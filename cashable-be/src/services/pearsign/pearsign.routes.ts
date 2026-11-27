import express, { type Request, type Response } from 'express';
import { authenticateToken } from '../../middleware/authMiddleware';
import { PearSignApiError } from './pearsign-client';
import { boldSignEmbeddedAvailable, boldSignSandbox, signingProvider } from './boldsign-client';
import {
  PearSignContractError,
  buildPearSignReviewPreview,
  downloadPearSignContractPdf,
  getPearSignContractState,
  getPearSignFunderStatus,
  getPearSignReview,
  savePearSignOverrides,
  sendPearSignContract,
  syncPearSignContract,
  voidPearSignContract,
} from './pearsign-contract.service';
import { PearSignPreviewError } from './pearsign-preview.service';
import { contractPdfFileName } from '../../utils/contractPdfFileName';
import {
  buildPearSignPackagePreview,
  getPearSignPackageReview,
  savePearSignPackageOverrides,
  finishPearSignPackageEditor,
  openPearSignPackageEditor,
  sendPearSignPackage,
} from './pearsign-package.service';
import { listPearSignTemplatesForFunder } from './pearsign-template-registry';
import { renderTypedCoj, typedCojKind } from '../docusign/utils/coj-typed-document';

/**
 * PearSign main-contract API (mounted at /api/v1/pearsign). The API key never leaves the server.
 *
 *   GET  /funders/:funderProfileId/status       is a PearSign contract template registered for this funder?
 *   GET  /funders/:funderProfileId/templates    registered PearSign templates (?documentType=contract|disclosure|…)
 *   GET  /contracts/:contractId                 saved PearSign state for the contract
 *   POST /contracts/:contractId/review          Review data: template layout, CRM values, saved edits, recipients
 *   PUT  /contracts/:contractId/overrides       save Review edits (layout variable → value; "" clears)
 *   POST /contracts/:contractId/preview         filled preview PDF (nothing sent or saved)
 *   POST /contracts/:contractId/send            send the envelope (values recomputed server-side)
 *   POST /contracts/:contractId/sync            refresh status from PearSign
 *   POST /contracts/:contractId/void            void the active envelope
 *   GET  /contracts/:contractId/download        PDF (?version=latest|original&envelopeId=…)
 *
 * review / preview / send take the same body the Dropbox Sign send uses:
 *   { funderProfileId, prefillFields: [{id,value}], roles: [{signerRole,signerName,signerEmail}], ownerCount, contractState }
 */
const router = express.Router();
router.use(authenticateToken);

function contractIdParam(req: Request): number {
  const id = Number.parseInt(String(req.params.contractId), 10);
  if (!Number.isFinite(id) || id <= 0) throw new PearSignContractError('Invalid contract id.');
  return id;
}

function actorId(req: Request): string | null {
  const id = (req as Request & { user?: { id?: string | number } }).user?.id;
  return id == null ? null : String(id);
}

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const data = await fn(req, res);
      if (!res.headersSent) res.json({ success: true, data });
    } catch (err) {
      const status =
        err instanceof PearSignContractError || err instanceof PearSignPreviewError
          ? err.status
          : err instanceof PearSignApiError
            ? err.status === 401 || err.status === 403
              ? 502
              : err.status >= 400 && err.status < 500
                ? 400
                : 502
            : 500;
      const message = err instanceof Error ? err.message : 'PearSign request failed.';
      if (status >= 500) console.error('[PearSign]', req.method, req.originalUrl, err);
      else console.warn('[PearSign]', req.method, req.originalUrl, status, message);
      const code = typeof (err as { code?: unknown })?.code === 'string' ? (err as { code: string }).code : undefined;
      if (!res.headersSent) res.status(status).json({ success: false, message, ...(code ? { code } : {}) });
    }
  };
}

router.get('/funders/:funderProfileId/status', handle((req) => getPearSignFunderStatus(String(req.params.funderProfileId))));

router.get(
  '/funders/:funderProfileId/templates',
  handle((req) =>
    listPearSignTemplatesForFunder(
      String(req.params.funderProfileId),
      typeof req.query.documentType === 'string' ? req.query.documentType : null,
    ),
  ),
);

router.get('/contracts/:contractId', handle((req) => getPearSignContractState(contractIdParam(req))));

router.post('/contracts/:contractId/review', handle((req) => getPearSignReview(contractIdParam(req), req.body ?? {})));

router.put('/contracts/:contractId/overrides', handle((req) => savePearSignOverrides(contractIdParam(req), req.body ?? {})));

router.post(
  '/contracts/:contractId/preview',
  handle(async (req, res) => {
    const { pdf, fileName, filledFieldCount } = await buildPearSignReviewPreview(contractIdParam(req), req.body ?? {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('X-Filled-Field-Count', String(filledFieldCount));
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  }),
);

router.post(
  '/contracts/:contractId/send',
  handle((req) => sendPearSignContract(contractIdParam(req), actorId(req), req.body ?? {})),
);

// ---- One envelope for the whole package (contract + addendums + disclosure) ----
// Staged by POST /docusign/merge-and-send with { signingProvider: "pearsign" } (same package build as Dropbox Sign).

router.get('/contracts/:contractId/package', handle((req) => getPearSignPackageReview(contractIdParam(req))));

router.put(
  '/contracts/:contractId/package/overrides',
  handle((req) => savePearSignPackageOverrides(contractIdParam(req), req.body ?? {})),
);

router.post(
  '/contracts/:contractId/package/preview',
  handle(async (req, res) => {
    const { pdf, fileName, filledFieldCount, merchantName } = await buildPearSignPackagePreview(contractIdParam(req), req.body ?? {});
    res.setHeader('Content-Type', 'application/pdf');
    if (req.body?.download === true) {
      // Download before sending: "CASHABLE FUND LLC: <Merchant>.pdf", like every contract PDF.
      const name = contractPdfFileName(merchantName);
      const ascii = name.replace(/[^ -~]+/g, '-').replace(/"/g, '');
      res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    }
    res.setHeader('X-Filled-Field-Count', String(filledFieldCount));
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  }),
);

router.post(
  '/contracts/:contractId/package/send',
  handle((req) => sendPearSignPackage(contractIdParam(req), actorId(req), req.body ?? {})),
);

// Embedded PearSign editor: open a session (body: { origin, message }) and record the envelope
// once the user clicks Send inside it (body: { sessionId }; safe to call again).
router.post(
  '/contracts/:contractId/package/editor',
  handle((req) =>
    openPearSignPackageEditor(contractIdParam(req), actorId(req), {
      origin: req.get('origin'),
      pageOrigin: req.body?.origin,
      message: req.body?.message,
      allowRepeat: req.body?.allowRepeat,
    }),
  ),
);
router.post(
  '/contracts/:contractId/package/editor/finish',
  handle((req) => finishPearSignPackageEditor(contractIdParam(req), actorId(req), req.body ?? {})),
);

router.post('/contracts/:contractId/sync', handle((req) => syncPearSignContract(contractIdParam(req))));

/** Which e-signature service new contracts go through (labels in the CRM screens). */
router.get(
  '/provider',
  handle(async () => {
    const provider = signingProvider();
    return {
      provider,
      name: provider === 'boldsign' ? 'BoldSign' : 'PearSign',
      sandbox: provider === 'boldsign' && boldSignSandbox(),
      // BoldSign's editor needs a plan with embedded requests; without it the CRM reviews and sends itself.
      embeddedEditor: provider !== 'boldsign' || boldSignEmbeddedAvailable(),
    };
  }),
);

/**
 * POST /contracts/:contractId/coj-pdf  { layoutKey?, templateName?, values: { field id → value } }
 * The filled New York COJ as a PDF download. NY COJs are never sent for e-signature: the team
 * downloads this file and emails it. Values are the COJ editor's current fields.
 */
router.post(
  '/contracts/:contractId/coj-pdf',
  handle(async (req, res) => {
    contractIdParam(req);
    const body = (req.body ?? {}) as { layoutKey?: unknown; templateName?: unknown; values?: unknown };
    const kind = typedCojKind({ key: String(body.layoutKey ?? '') }) ?? typedCojKind({ key: String(body.templateName ?? '') });
    if (!kind || !kind.startsWith('coj_ny')) {
      throw new PearSignContractError('Only New York COJs are downloaded as a PDF.', 400);
    }
    const raw = body.values && typeof body.values === 'object' ? (body.values as Record<string, unknown>) : {};
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string' || typeof v === 'number') values[k] = String(v);
    // Business name with DBA, as the contract builds it ("LEGAL DBA TRADE NAME").
    if (!String(values.business_name_with_dba ?? '').trim() && String(values.client_legal_name ?? '').trim()) {
      const legal = values.client_legal_name.trim();
      const dba = String(values.doing_business_as ?? '').trim();
      values.business_name_with_dba = dba && dba.toUpperCase() !== legal.toUpperCase() ? `${legal} DBA ${dba}` : legal;
    }
    const { pdf } = await renderTypedCoj(kind, values);
    const label = { coj_ny_general: 'NY General', coj_ny_business: 'NY Business', coj_ny_merchant: 'NY Individual' }[kind as 'coj_ny_general'];
    const who = String(values.client_legal_name || values.business_name_with_dba || values.owner1_guarantor_name || '')
      .replace(/[^A-Za-z0-9 &.,'-]+/g, ' ')
      .trim()
      .slice(0, 80);
    const fileName = `COJ - ${label}${who ? ` - ${who}` : ''}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    res.send(pdf);
  }),
);

router.post(
  '/contracts/:contractId/void',
  handle((req) => voidPearSignContract(contractIdParam(req), { releaseIfMissing: req.body?.releaseIfMissing === true })),
);

router.get(
  '/contracts/:contractId/download',
  handle(async (req, res) => {
    const version = req.query.version === 'original' ? 'original' : 'latest';
    const requested = typeof req.query.envelopeId === 'string' ? req.query.envelopeId : null;
    const { pdf, envelopeId } = await downloadPearSignContractPdf(contractIdParam(req), version, requested);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contract_${envelopeId}_${version}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  }),
);

export default router;
