import { randomUUID } from 'crypto';
import prisma from '../config/prismaClient';
import sendMail, { getServerMailVia } from '../config/nodemailer';
import { getGmailSenderEmail } from '../config/gmailApiMailer';
import { buildBrandLogoAttachments } from '../constants/brand';
import type { AuthenticatedUser } from './applicationService';
import { recordCommunicationAudit } from './systemActivityLogService';

/**
 * Contract email history ("View email recipients" on the Contract tab).
 *
 * Every email a contract send produces is logged as one `outbound_communications`
 * row per recipient, tagged `metadata.source = 'contract_email'`:
 *   - signing_invite — the signing link emailed to a signer (sent by the CRM from Gmail;
 *                      logged only when PEARSIGN_SIGNER_INVITES=pearsign has PearSign send it)
 *   - cc_copy        — "Contract Sent" copy with the contract PDF to each CC address
 *   - signed_copy    — "Signed Contract" copy with the executed PDF to each CC address
 *
 * Rows the CRM sent keep their HTML and a resend recipe, so they can be viewed
 * and resent from the history. They also appear in the deal's Mail Log.
 */

export const CONTRACT_EMAIL_SOURCE = 'contract_email';

export type ContractEmailKind = 'signing_invite' | 'cc_copy' | 'signed_copy' | 'status_update';
export type ContractEmailRole = 'SIGNER' | 'CC';
export type ContractEmailAttachmentKind = 'contract_pdf' | 'brand_logo';

export type ContractEmailRecipient = {
  email: string;
  role: ContractEmailRole;
  name?: string | null;
  roleDetail?: string | null;
};

/** What a resend needs to rebuild the attachments (the HTML is stored on the row). */
export type ContractEmailResendPayload = {
  contractId: number;
  envelopeId: string;
  attachments: ContractEmailAttachmentKind[];
  pdfFilename?: string;
};

type MailAttachment = {
  filename?: string | false;
  content?: Buffer | string;
  path?: string;
  cid?: string;
  contentType?: string;
  contentDisposition?: 'inline' | 'attachment';
};

const KIND_LOG: Record<ContractEmailKind, { template: string; templateName: string; description: string }> = {
  signing_invite: {
    template: 'contract-signing-invite',
    templateName: 'Contract signing invite',
    description: 'Signing invite with the PearSign signing link emailed to a contract signer.',
  },
  cc_copy: {
    template: 'contract-sent-cc',
    templateName: 'Contract sent (CC)',
    description: 'Contract sent notice with the contract PDF emailed to a CC recipient.',
  },
  signed_copy: {
    template: 'contract-signed-cc',
    templateName: 'Contract signed (CC)',
    description: 'Signed contract notice with the executed PDF emailed to a CC recipient.',
  },
  status_update: {
    template: 'contract-status-update',
    templateName: 'Contract status update',
    description: 'PearSign contract status change (viewed, signed, completed …) emailed to the Cashable team.',
  },
};

const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();

function asMeta(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function senderMailbox(): string | null {
  return getServerMailVia() === 'gmail' ? getGmailSenderEmail() ?? null : null;
}

/**
 * Send one contract email and log it (sent or failed) to the history + Mail Log.
 * Throws when the send fails, after logging the failure.
 */
export async function sendLoggedContractEmail(input: {
  applicationId: string;
  groupId: string;
  kind: ContractEmailKind;
  recipient: ContractEmailRecipient;
  subject: string;
  html: string;
  attachments: MailAttachment[];
  resend: ContractEmailResendPayload;
  resendOf?: string | null;
  user?: AuthenticatedUser | null;
}): Promise<string> {
  const id = randomUUID();
  const to = lower(input.recipient.email);
  let error: unknown = null;
  try {
    await sendMail({ to, subject: input.subject, html: input.html, attachments: input.attachments, trackingId: id });
  } catch (err) {
    error = err;
  }
  const status = error ? 'failed' : 'sent';
  const errorMessage = error ? (error instanceof Error ? error.message : String(error)) : undefined;
  const log = KIND_LOG[input.kind];
  try {
    await recordCommunicationAudit(null, {
      outboundCommunicationId: id,
      applicationId: input.applicationId,
      channel: 'EMAIL',
      recipientType: input.recipient.role === 'SIGNER' ? 'MERCHANT' : 'OTHER',
      recipient: to,
      subject: input.subject,
      body: input.html,
      templateName: log.templateName,
      actionType: error ? 'EMAIL_FAILED' : 'EMAIL_SENT',
      actionDescription: error ? `${log.description} (failed)` : log.description,
      user: input.user ?? null,
      metadata: {
        source: CONTRACT_EMAIL_SOURCE,
        kind: input.kind,
        role: input.recipient.role,
        recipientName: input.recipient.name ?? null,
        roleDetail: input.recipient.roleDetail ?? null,
        groupId: input.groupId,
        provider: getServerMailVia(),
        mailboxEmail: senderMailbox(),
        attachmentNames: input.attachments
          .map((a) => (typeof a.filename === 'string' ? a.filename : ''))
          .filter(Boolean),
        resend: input.resend,
        ...(input.resendOf ? { resendOf: input.resendOf } : {}),
        template: log.template,
        emailSentTo: [to],
        status,
        ...(errorMessage ? { error: errorMessage } : {}),
        delivery: { status, sentAt: new Date().toISOString() },
      },
    });
    if (error) {
      await prisma.outbound_communications.update({ where: { id }, data: { status: 'failed' } });
    }
  } catch (logError) {
    console.error('[contract-email] could not log', input.kind, to, logError);
  }
  if (error) throw error;
  return id;
}

/** Record the signing invites PearSign itself emailed, so the signers show in the history. */
export async function logExternalSigningInvites(input: {
  applicationId: string;
  groupId: string;
  subject: string;
  signers: Array<{ email: string; name?: string | null; roleName?: string | null }>;
}): Promise<void> {
  for (const s of input.signers) {
    const to = lower(s.email);
    if (!to) continue;
    try {
      await recordCommunicationAudit(null, {
        applicationId: input.applicationId,
        channel: 'EMAIL',
        recipientType: 'MERCHANT',
        recipient: to,
        subject: input.subject,
        templateName: KIND_LOG.signing_invite.templateName,
        actionType: 'EMAIL_SENT',
        actionDescription: KIND_LOG.signing_invite.description,
        metadata: {
          source: CONTRACT_EMAIL_SOURCE,
          kind: 'signing_invite',
          role: 'SIGNER',
          recipientName: s.name ?? null,
          roleDetail: s.roleName ?? null,
          groupId: input.groupId,
          provider: 'pearsign',
          template: KIND_LOG.signing_invite.template,
          emailSentTo: [to],
          status: 'sent',
        },
      });
    } catch (err) {
      console.error('[contract-email] could not log the PearSign invite for', to, err);
    }
  }
}

// ---------- history ----------

export type ContractEmailHistoryRow = {
  id: string;
  sentAt: string;
  email: string;
  role: ContractEmailRole;
  roleDetail: string | null;
  name: string | null;
  kind: ContractEmailKind;
  subject: string;
  status: string;
  groupId: string | null;
  outboundId: string;
  provider: string | null;
  senderEmail: string | null;
  /** SendGrid reports delivery / opens for this row. */
  tracked: boolean;
  canView: boolean;
  canResend: boolean;
  deliveredAt: string | null;
  openedAt: string | null;
  openCount: number;
  failureReason: string | null;
  resendOf: string | null;
};

const historyWhere = (applicationId: string) => ({
  applicationId,
  metadata: { path: ['source'], equals: CONTRACT_EMAIL_SOURCE },
});

/** Every contract email for the application (UUID), newest first. */
export async function listContractEmailHistory(applicationId: string): Promise<ContractEmailHistoryRow[]> {
  const rows = await prisma.outbound_communications.findMany({
    where: historyWhere(applicationId),
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, recipient: true, subject: true, status: true, metadata: true, body: true },
  });
  return rows.map((row) => {
    const meta = asMeta(row.metadata);
    const tracking = asMeta(meta.tracking);
    const provider = String(meta.provider || '').trim() || null;
    const failed = meta.status === 'failed';
    const hasResend = Boolean(row.body) && Object.keys(asMeta(meta.resend)).length > 0;
    return {
      id: row.id,
      sentAt: row.createdAt.toISOString(),
      email: row.recipient,
      role: (meta.role === 'SIGNER' ? 'SIGNER' : 'CC') as ContractEmailRole,
      roleDetail: String(meta.roleDetail || '').trim() || null,
      name: String(meta.recipientName || '').trim() || null,
      kind: String(meta.kind || 'cc_copy') as ContractEmailKind,
      subject: String(row.subject || ''),
      status: failed ? 'failed' : String(row.status || 'sent'),
      groupId: String(meta.groupId || '').trim() || null,
      outboundId: row.id,
      provider,
      senderEmail: String(meta.mailboxEmail || '').trim() || null,
      tracked: provider === 'sendgrid',
      canView: Boolean(row.body),
      canResend: hasResend,
      deliveredAt: String(tracking.deliveredAt || '') || null,
      openedAt: String(tracking.openedAt || '') || null,
      openCount: Number(tracking.openCount) || 0,
      failureReason: String(tracking.bounceReason || meta.error || '').trim() || null,
      resendOf: String(meta.resendOf || '').trim() || null,
    };
  });
}

export class ContractEmailHistoryError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'ContractEmailHistoryError';
  }
}

async function loadHistoryRow(applicationId: string, emailId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(emailId)) throw new ContractEmailHistoryError('Email not found.', 404);
  const row = await prisma.outbound_communications.findFirst({
    where: { id: emailId, ...historyWhere(applicationId) },
    select: { id: true, createdAt: true, recipient: true, subject: true, status: true, metadata: true, body: true },
  });
  if (!row) throw new ContractEmailHistoryError('Email not found.', 404);
  return row;
}

/** The HTML a contract email sent (shown sandboxed in the history). */
export async function getContractEmailContent(applicationId: string, emailId: string) {
  const row = await loadHistoryRow(applicationId, emailId);
  if (!row.body) throw new ContractEmailHistoryError('The content of this email was not kept.', 404);
  const meta = asMeta(row.metadata);
  return {
    id: row.id,
    email: row.recipient,
    subject: String(row.subject || ''),
    sentAt: row.createdAt.toISOString(),
    status: meta.status === 'failed' ? 'failed' : String(row.status || 'sent'),
    from: String(meta.mailboxEmail || '').trim() || null,
    html: row.body,
    attachments: Array.isArray(meta.attachmentNames) ? meta.attachmentNames.map(String) : [],
  };
}

/** Send one history email again to the same recipient, with fresh attachments. */
export async function resendContractEmail(applicationId: string, emailId: string, user: AuthenticatedUser | null) {
  const row = await loadHistoryRow(applicationId, emailId);
  const meta = asMeta(row.metadata);
  const resend = asMeta(meta.resend) as Partial<ContractEmailResendPayload>;
  if (!row.body || !resend.contractId || !resend.envelopeId) {
    throw new ContractEmailHistoryError(
      meta.provider === 'pearsign'
        ? 'PearSign sent this invite. Use Resend on the contract to send the signing link again.'
        : 'This email cannot be resent.',
    );
  }

  const attachments: MailAttachment[] = [];
  const kinds = Array.isArray(resend.attachments) ? resend.attachments : [];
  if (kinds.includes('brand_logo')) attachments.push(...buildBrandLogoAttachments());
  if (kinds.includes('contract_pdf')) {
    const { downloadPearSignContractPdf } = await import('./pearsign/pearsign-contract.service');
    let pdf: Buffer;
    try {
      pdf = (await downloadPearSignContractPdf(Number(resend.contractId), 'latest', resend.envelopeId)).pdf;
    } catch (err) {
      throw new ContractEmailHistoryError(`Could not load the contract PDF: ${(err as Error)?.message || err}`, 502);
    }
    attachments.push({ filename: resend.pdfFilename || 'contract.pdf', content: pdf, contentType: 'application/pdf' });
  }

  try {
    await sendLoggedContractEmail({
      applicationId,
      groupId: String(meta.groupId || resend.envelopeId),
      kind: String(meta.kind || 'cc_copy') as ContractEmailKind,
      recipient: {
        email: row.recipient,
        role: meta.role === 'SIGNER' ? 'SIGNER' : 'CC',
        name: (meta.recipientName as string) ?? null,
        roleDetail: (meta.roleDetail as string) ?? null,
      },
      subject: String(row.subject || ''),
      html: row.body,
      attachments,
      resend: resend as ContractEmailResendPayload,
      resendOf: row.id,
      user,
    });
  } catch (err) {
    throw new ContractEmailHistoryError(`Could not resend the email: ${(err as Error)?.message || err}`, 502);
  }
  return { resent: true };
}
