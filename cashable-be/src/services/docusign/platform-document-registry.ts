import prisma from '../../config/prismaClient';
import * as fs from 'fs';
import * as path from 'path';
import {
  DOCUMENT_LAYOUT_KEYS,
  getDocumentLayout,
  type DocumentLayoutKey,
} from './layouts/document-layout.registry';
import { downloadLegacyDocuSignTemplatePdfBase64 } from './utils/download-legacy-docusign-template-pdf';
import {
  DOCUSIGN_DEFAULT_ROLE_NAME,
  DOCUSIGN_SECONDARY_ROLE_NAME,
} from './utils/docusign-client';
import { BRAND_DISPLAY_NAME } from '../../constants/brand';
import { fetchRemoteAssetBuffer } from '../cloudinaryInlinePreviewService';

export type PlatformDocumentDefinition = {
  layoutKey: DocumentLayoutKey;
  name: string;
  type: string;
};

/** Envelope signer slots for code-built layouts — not DocuSign Admin templates. */
export const PLATFORM_SIGNER_SLOTS = [
  { roleIndex: 1, roleName: DOCUSIGN_DEFAULT_ROLE_NAME, signerOrder: 1 },
  { roleIndex: 2, roleName: DOCUSIGN_SECONDARY_ROLE_NAME, signerOrder: 2 },
] as const;

export const PLATFORM_DOCUMENTS: Record<DocumentLayoutKey, PlatformDocumentDefinition> = {
  [DOCUMENT_LAYOUT_KEYS.contract]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.contract,
    name: `${BRAND_DISPLAY_NAME} Contract`,
    type: 'contract',
  },
  [DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract,
    name: 'Texas Funding Group Contract',
    type: 'texas_funding_group_contract',
  },
  [DOCUMENT_LAYOUT_KEYS.flexAddendum]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.flexAddendum,
    name: `${BRAND_DISPLAY_NAME} Flex Addendum`,
    type: 'flex_addendum',
  },
  [DOCUMENT_LAYOUT_KEYS.prePaymentAddendum]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.prePaymentAddendum,
    name: `${BRAND_DISPLAY_NAME} Pre-Payment Addendum`,
    type: 'pre_payment_addendum',
  },
  [DOCUMENT_LAYOUT_KEYS.balanceTransfer]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.balanceTransfer,
    name: `${BRAND_DISPLAY_NAME} Balance Transfer Sheet`,
    type: 'balance_transfer',
  },
  [DOCUMENT_LAYOUT_KEYS.caseTakeoverAddendum]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.caseTakeoverAddendum,
    name: 'Case Takeover Balance Transfer',
    type: 'case_takeover_addendum',
  },
  [DOCUMENT_LAYOUT_KEYS.achAuthorization]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.achAuthorization,
    name: `${BRAND_DISPLAY_NAME} ACH Authorization`,
    type: 'ach_authorization',
  },
  [DOCUMENT_LAYOUT_KEYS.achAuthorizationStandalone]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.achAuthorizationStandalone,
    name: `${BRAND_DISPLAY_NAME} ACH Authorization (standalone)`,
    type: 'ach_authorization',
  },
  [DOCUMENT_LAYOUT_KEYS.achAuthorizationTexas]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.achAuthorizationTexas,
    name: 'Texas ACH Authorization (contract pages 11–12)',
    type: 'ach_authorization_texas',
  },
  [DOCUMENT_LAYOUT_KEYS.waiverPersonalService]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.waiverPersonalService,
    name: `${BRAND_DISPLAY_NAME} Waiver of Personal Service (NY)`,
    type: 'waiver_personal_service',
  },
  [DOCUMENT_LAYOUT_KEYS.depositControl]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.depositControl,
    name: `${BRAND_DISPLAY_NAME} Deposit Control Agreement`,
    type: 'deposit_control',
  },
  [DOCUMENT_LAYOUT_KEYS.depositControlNyTx]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.depositControlNyTx,
    name: `${BRAND_DISPLAY_NAME} Deposit Control Agreement (NY & TX)`,
    type: 'deposit_control_ny_tx',
  },
  [DOCUMENT_LAYOUT_KEYS.cojNyGeneral]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.cojNyGeneral,
    name: 'COJ — NY General',
    type: 'coj_ny_general',
  },
  [DOCUMENT_LAYOUT_KEYS.cojNyBusiness]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.cojNyBusiness,
    name: 'COJ — NY Business only',
    type: 'coj_ny_business',
  },
  [DOCUMENT_LAYOUT_KEYS.cojNyMerchant]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.cojNyMerchant,
    name: 'COJ — NY Individual only',
    type: 'coj_ny_merchant',
  },
  [DOCUMENT_LAYOUT_KEYS.cojIowa]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.cojIowa,
    name: 'COJ — Iowa (Cashable Fund LLC)',
    type: 'coj_iowa',
  },
  [DOCUMENT_LAYOUT_KEYS.prepayDiscount]: {
    layoutKey: DOCUMENT_LAYOUT_KEYS.prepayDiscount,
    name: `${BRAND_DISPLAY_NAME} Prepay Discount`,
    type: 'prepay_discount',
  },
};

/** Supplemental documents available in the addendum picker (excludes main contract). */
export const SUPPLEMENTAL_PLATFORM_DOCUMENTS: PlatformDocumentDefinition[] = [
  PLATFORM_DOCUMENTS[DOCUMENT_LAYOUT_KEYS.achAuthorization],
  PLATFORM_DOCUMENTS[DOCUMENT_LAYOUT_KEYS.depositControl],
  PLATFORM_DOCUMENTS[DOCUMENT_LAYOUT_KEYS.depositControlNyTx],
  PLATFORM_DOCUMENTS[DOCUMENT_LAYOUT_KEYS.waiverPersonalService],
  PLATFORM_DOCUMENTS[DOCUMENT_LAYOUT_KEYS.cojNyGeneral],
  PLATFORM_DOCUMENTS[DOCUMENT_LAYOUT_KEYS.cojNyBusiness],
  PLATFORM_DOCUMENTS[DOCUMENT_LAYOUT_KEYS.cojNyMerchant],
  PLATFORM_DOCUMENTS[DOCUMENT_LAYOUT_KEYS.cojIowa],
  PLATFORM_DOCUMENTS[DOCUMENT_LAYOUT_KEYS.prepayDiscount],
];

const LAYOUT_KEY_SET = new Set<string>(Object.values(DOCUMENT_LAYOUT_KEYS));

/** When a layout key has no uploaded PDF, also try these sibling keys' uploads. */
const PDF_URL_ALIASES: Partial<Record<DocumentLayoutKey, DocumentLayoutKey[]>> = {
  [DOCUMENT_LAYOUT_KEYS.achAuthorizationStandalone]: [
    DOCUMENT_LAYOUT_KEYS.achAuthorization,
  ],
  [DOCUMENT_LAYOUT_KEYS.achAuthorization]: [
    DOCUMENT_LAYOUT_KEYS.achAuthorizationStandalone,
  ],
};

export function isDocumentLayoutKey(value: string): value is DocumentLayoutKey {
  return LAYOUT_KEY_SET.has(String(value || '').trim());
}

function isValidRemotePdfUrl(url: string): boolean {
  const trimmed = String(url || '').trim();
  if (!trimmed || trimmed.startsWith('platform://')) return false;
  return /^https?:\/\//i.test(trimmed);
}

/**
 * Resolve pdfUrl by exact layoutKey / templateId only.
 * Never match by BoldSignTemplate.type — multiple funders share type "contract"
 * and fuzzy matching can return the wrong funder's PDF (legal/compliance risk).
 */
export async function findBoldSignTemplatePdfUrlByExactLayoutKey(
  layoutKey: string,
): Promise<string | null> {
  const key = String(layoutKey || '').trim();
  if (!key) return null;

  const row = await prisma.boldSignTemplate.findFirst({
    where: {
      OR: [{ layoutKey: key }, { templateId: key }],
    },
    orderBy: { createdAt: 'desc' },
    select: { pdfUrl: true },
  });

  const url = String(row?.pdfUrl || '').trim();
  return isValidRemotePdfUrl(url) ? url : null;
}

/** Resolve Cloudinary (or other HTTPS) pdfUrl from BoldSignTemplate for a platform layout key. */
export async function findBoldSignTemplatePdfUrlForLayout(
  layoutKey: DocumentLayoutKey,
): Promise<string | null> {
  const exact = await findBoldSignTemplatePdfUrlByExactLayoutKey(layoutKey);
  if (exact) return exact;

  for (const alias of PDF_URL_ALIASES[layoutKey] ?? []) {
    const aliased = await findBoldSignTemplatePdfUrlByExactLayoutKey(alias);
    if (aliased) return aliased;
  }
  return null;
}

/** Platform default main-contract PDF: layout `contract` upload, then global ContractTemplate. */
export async function findDefaultContractPdfUrl(): Promise<string | null> {
  const fromLayout = await findBoldSignTemplatePdfUrlByExactLayoutKey(
    DOCUMENT_LAYOUT_KEYS.contract,
  );
  if (fromLayout) return fromLayout;

  const latest = await prisma.contractTemplate.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { url: true },
  });
  const url = String(latest?.url || '').trim();
  return isValidRemotePdfUrl(url) ? url : null;
}

async function fetchRemotePdfAsBase64(url: string, documentName: string): Promise<string> {
  let buf: Buffer;
  try {
    buf = await fetchRemoteAssetBuffer(url);
  } catch (error) {
    const status =
      error instanceof Error ? error.message : `Failed to download ${documentName} PDF`;
    throw new Error(status);
  }
  if (buf.length < 5 || buf.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error(`Downloaded file is not a valid PDF for "${documentName}"`);
  }
  return buf.toString('base64');
}

async function loadDefaultPdfFromLegacyDocuSign(
  layoutKey: DocumentLayoutKey,
): Promise<string | null> {
  const layout = getDocumentLayout(layoutKey);
  const legacyId = String(layout.legacyDocuSignTemplateId || '').trim();
  if (!legacyId) return null;
  try {
    return await downloadLegacyDocuSignTemplatePdfBase64(legacyId, layout.name);
  } catch (err) {
    console.warn(
      `[platform-docs] Default Dropbox Sign PDF failed for "${layoutKey}" (${legacyId}):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function resolvePlatformDocumentPdfUrl(
  layoutKey: DocumentLayoutKey,
): Promise<string> {
  const def = PLATFORM_DOCUMENTS[layoutKey];
  const fromDb = await findBoldSignTemplatePdfUrlForLayout(layoutKey);
  if (fromDb) return fromDb;

  throw new Error(
    `Missing PDF URL for "${def.name}". Upload the PDF to Cloudinary and set pdfUrl on the BoldSignTemplate row with layoutKey "${layoutKey}", or rely on the default Dropbox Sign template PDF via loadPlatformDocumentPdfBase64.`,
  );
}

/**
 * Bundled Texas ACH blank PDF (`TEXAS FUNDING GROUP- BLANK FILLABLE ACH.pdf`).
 * Used when no funder/platform Cloudinary upload exists for `ach_authorization_texas`.
 */
function loadBundledLayoutPdfBase64(layoutKey: string): string | null {
  const fileName = `${layoutKey}.pdf`;
  const candidates = [
    path.join(__dirname, 'layouts', 'assets', fileName),
    path.join(process.cwd(), 'src', 'services', 'docusign', 'layouts', 'assets', fileName),
    path.join(process.cwd(), 'dist', 'services', 'docusign', 'layouts', 'assets', fileName),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath).toString('base64');
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function loadBundledTexasAchPdfBase64(): string | null {
  const candidates = [
    path.join(__dirname, 'layouts', 'assets', 'ach_authorization_texas.pdf'),
    path.join(
      process.cwd(),
      'src',
      'services',
      'docusign',
      'layouts',
      'assets',
      'ach_authorization_texas.pdf',
    ),
    path.join(
      process.cwd(),
      'dist',
      'services',
      'docusign',
      'layouts',
      'assets',
      'ach_authorization_texas.pdf',
    ),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath).toString('base64');
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Load platform document PDF bytes.
 * Priority: uploaded BoldSignTemplate.pdfUrl → sibling layout upload → default DocuSign template PDF.
 * Texas ACH prefers the uploaded funder PDF, then the bundled blank ACH form (page-11 coordinates).
 */
/**
 * The form's PDF (uploaded copy or bundled fallback) with the layout's `masks` applied:
 * white patches over printed text the layout replaces (e.g. a "$" printed at the end of a
 * line when the amount field prints its own "$" on the next line).
 */
export async function loadPlatformDocumentPdfBase64(
  layoutKey: DocumentLayoutKey,
): Promise<string> {
  const base64 = await loadPlatformDocumentPdfBase64Unmasked(layoutKey);
  return applyLayoutMasks(layoutKey, base64);
}

async function applyLayoutMasks(layoutKey: DocumentLayoutKey, base64: string): Promise<string> {
  let masks: NonNullable<ReturnType<typeof getDocumentLayout>['masks']> = [];
  try {
    masks = getDocumentLayout(layoutKey).masks ?? [];
  } catch {
    return base64;
  }
  if (!masks.length) return base64;
  try {
    const { PDFDocument, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.load(Buffer.from(base64, 'base64'), { ignoreEncryption: true });
    const pages = doc.getPages();
    for (const m of masks) {
      const page = pages[Math.max(0, parseInt(String(m.pageNumber || '1'), 10) - 1)];
      if (!page) continue;
      const x = Number(m.x), y = Number(m.y), w = Number(m.width), h = Number(m.height);
      if (![x, y, w, h].every(Number.isFinite)) continue;
      page.drawRectangle({ x, y: page.getHeight() - y - h, width: w, height: h, color: rgb(1, 1, 1) });
    }
    return Buffer.from(await doc.save()).toString('base64');
  } catch (err) {
    console.warn(`[platform-documents] could not apply masks for ${layoutKey}:`, err instanceof Error ? err.message : err);
    return base64;
  }
}

async function loadPlatformDocumentPdfBase64Unmasked(
  layoutKey: DocumentLayoutKey,
): Promise<string> {
  const def = PLATFORM_DOCUMENTS[layoutKey];

  if (layoutKey === DOCUMENT_LAYOUT_KEYS.caseTakeoverAddendum) {
    const dedicatedUrl = await findBoldSignTemplatePdfUrlByExactLayoutKey(layoutKey);
    if (dedicatedUrl) {
      return fetchRemotePdfAsBase64(dedicatedUrl, def.name);
    }
    throw new Error(
      `No PDF uploaded for "${def.name}". Upload it in Settings → Funder profile → Addendum PDFs (Case Takeover Balance Transfer).`,
    );
  }

  if (layoutKey === DOCUMENT_LAYOUT_KEYS.achAuthorizationTexas) {
    const dedicatedUrl = await findBoldSignTemplatePdfUrlByExactLayoutKey(layoutKey);
    if (dedicatedUrl) {
      return fetchRemotePdfAsBase64(dedicatedUrl, def.name);
    }
    // Funder-scoped texas ACH upload (Settings → Funder profile → Addendum PDFs).
    const funderScoped = await prisma.boldSignTemplate.findFirst({
      where: {
        OR: [
          { layoutKey: { endsWith: '_ach_authorization_texas' } },
          { type: 'ach_authorization_texas' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { pdfUrl: true },
    });
    const scopedUrl = String(funderScoped?.pdfUrl || '').trim();
    if (scopedUrl && /^https?:\/\//i.test(scopedUrl)) {
      return fetchRemotePdfAsBase64(scopedUrl, def.name);
    }
    const bundled = loadBundledTexasAchPdfBase64();
    if (bundled) return bundled;
  }

  const fromDb = await findBoldSignTemplatePdfUrlForLayout(layoutKey);
  if (fromDb) {
    try {
      return await fetchRemotePdfAsBase64(fromDb, def.name);
    } catch (err) {
      // Stale rows (e.g. copied dev data pointing at another book's Cloudinary)
      // must not break the document - fall through to the bundled PDF.
      const bundledFallback = loadBundledLayoutPdfBase64(layoutKey);
      if (bundledFallback) return bundledFallback;
      throw err;
    }
  }

  // Cashable supplemental documents ship with bundled cleaned PDFs
  // (COJs, Deposit Control, Waiver) so no upload is required.
  const bundledGeneric = loadBundledLayoutPdfBase64(layoutKey);
  if (bundledGeneric) return bundledGeneric;

  // Do not pull the old Katan/Woodmere DocuSign contract PDF as a default.
  if (layoutKey === DOCUMENT_LAYOUT_KEYS.contract) {
    const latestDefault = await findDefaultContractPdfUrl();
    if (latestDefault) {
      return fetchRemotePdfAsBase64(latestDefault, def.name);
    }
    throw new Error(
      `No PDF configured for "${def.name}". Upload the Cashable contract PDF in Settings → Funders.`,
    );
  }

  const fromLegacy = await loadDefaultPdfFromLegacyDocuSign(layoutKey);
  if (fromLegacy) return fromLegacy;

  for (const alias of PDF_URL_ALIASES[layoutKey] ?? []) {
    const aliasLegacy = await loadDefaultPdfFromLegacyDocuSign(alias);
    if (aliasLegacy) return aliasLegacy;
  }

  throw new Error(
    `No PDF configured for "${def.name}". Upload to Cloudinary (BoldSignTemplate.pdfUrl, layoutKey "${layoutKey}") or ensure the default Dropbox Sign template is available.`,
  );
}

export function normalizeSupplementalLayoutKeys(refs: string[]): DocumentLayoutKey[] {
  const out: DocumentLayoutKey[] = [];
  for (const ref of refs) {
    const key = String(ref || '').trim();
    if (!key) continue;
    if (isDocumentLayoutKey(key)) {
      out.push(key);
      continue;
    }
    throw new Error(
      `Unknown supplemental layout key "${key}". Use one of: ${[...LAYOUT_KEY_SET].join(', ')}`,
    );
  }
  return [...new Set(out)];
}

/** Resolves CRM document row id for a platform layout key (coordinates come from code layouts). */
export async function ensurePlatformBoldSignTemplateRow(
  layoutKey: DocumentLayoutKey,
): Promise<string> {
  const def = PLATFORM_DOCUMENTS[layoutKey];

  const existing = await prisma.boldSignTemplate.findFirst({
    where: { OR: [{ templateId: layoutKey }, { layoutKey }] },
    orderBy: { createdAt: 'desc' },
    select: { id: true, layoutKey: true, name: true, type: true },
  });
  if (existing?.id) {
    const needsSync =
      existing.layoutKey !== layoutKey ||
      existing.name !== def.name ||
      existing.type !== def.type;
    if (needsSync) {
      await prisma.boldSignTemplate.update({
        where: { id: existing.id },
        data: { layoutKey, name: def.name, type: def.type, templateId: layoutKey },
      });
    }
    return existing.id;
  }

  throw new Error(
    `No document record for "${def.name}" (layoutKey: ${layoutKey}). Create a BoldSignTemplate row with layoutKey "${layoutKey}" and a Cloudinary pdfUrl.`,
  );
}

export function getPlatformTemplateRecipients() {
  return {
    success: true,
    source: 'platform-layout',
    roles: PLATFORM_SIGNER_SLOTS.map((slot) => ({
      roleIndex: slot.roleIndex,
      roleName: slot.roleName,
      signerName: '',
      signerEmail: '',
      signerOrder: slot.signerOrder,
    })),
  };
}
