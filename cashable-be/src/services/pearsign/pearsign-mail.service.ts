import { randomUUID } from 'crypto';
import { contractPdfFileName } from '../../utils/contractPdfFileName';
import prisma from '../../config/prismaClient';
import { BRAND_DISPLAY_NAME, BRAND_LOGO_URL, buildBrandLogoAttachments } from '../../constants/brand';
import { APPROVAL_BANNER_LOGO_URL } from '../emailService';
import {
  buildContractSentEmailSubject,
  buildContractStatusUpdateSubject,
  buildSignedContractEmailSubject,
  renderContractSentEmailHtml,
  renderContractStatusUpdateEmailHtml,
  renderSignedContractEmailHtml,
} from '../emailTemplates/contractStatusEmailHtml';
import {
  logExternalSigningInvites,
  sendLoggedContractEmail,
  type ContractEmailAttachmentKind,
  type ContractEmailKind,
} from '../contractEmailHistoryService';
import {
  formatContractOfferAmountForSubject,
} from '../../utils/contractEnvelopeEmailSubject';

/**
 * The CRM sends the contract emails from its own mailbox (Gmail), not PearSign:
 *   - "Signing invite"  to each signer, carrying that signer's PearSign signing URL
 *   - "Contract Sent"   with the filled contract PDF to each CC, right after the send
 *   - "Signed Contract" with the executed PDF to each CC, once the envelope is completed
 * PearSign is asked to send with `sendEmail: false`; it then only creates the signing
 * sessions and returns each signer's signing URL. Set PEARSIGN_SIGNER_INVITES=pearsign
 * to let PearSign email the signers again. Every email is logged per recipient for the
 * Contract tab's "View email recipients" history (and the deal's Mail Log).
 */

export type PearSignMailOutcome = { emailed: string[]; failed: Array<{ email: string; error: string }> };

/** True (default) when the CRM emails the signing invites itself from its Gmail mailbox. */
export function crmSendsSignerInvites(): boolean {
  return String(process.env.PEARSIGN_SIGNER_INVITES ?? 'crm').trim().toLowerCase() !== 'pearsign';
}

/** `sendEmail` for the PearSign send call: PearSign only emails when the CRM does not. */
export function pearSignShouldEmailSigners(): boolean {
  if (crmSendsSignerInvites()) return false;
  return !/^(0|false|no)$/i.test(String(process.env.PEARSIGN_SEND_EMAIL ?? 'true').trim());
}

const SIGNING_EXPIRATION_DAYS = 30;

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "Your document is ready to sign" — sent from the CRM mailbox with the signer's PearSign link. */
export function buildPearSignInviteHtml(input: {
  recipientName?: string | null;
  contractLabel: string;
  bookName: string;
  message?: string | null;
  signingUrl: string;
  expirationDays: number;
  logoSrc?: string | null;
}): string {
  const brand = escapeHtml(input.bookName || BRAND_DISPLAY_NAME);
  const greeting = input.recipientName ? `Hi ${escapeHtml(input.recipientName)},` : 'Hello,';
  const label = escapeHtml(input.contractLabel);
  const link = escapeHtml(input.signingUrl);
  const message = String(input.message || '').trim();
  const header = input.logoSrc
    ? `<img src="${escapeHtml(input.logoSrc)}" alt="${escapeHtml(BRAND_DISPLAY_NAME)}" style="max-height:44px;display:block;" />`
    : `<span style="font-size:24px;font-weight:bold;color:${BRAND_PRIMARY};">${escapeHtml(BRAND_DISPLAY_NAME)}</span>`;
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e4e7eb;border-radius:8px;border-top:4px solid ${BRAND_PRIMARY};">
            <tr>
              <td style="padding:20px 32px;border-bottom:1px solid #e4e7eb;">${header}</td>
            </tr>
            <tr>
              <td align="center" style="padding:36px 32px 8px;font-size:24px;line-height:32px;font-weight:bold;color:#1f2933;">Your document is ready to sign</td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;font-size:15px;line-height:24px;">${greeting}</td>
            </tr>
            <tr>
              <td style="padding:12px 32px 0;font-size:15px;line-height:24px;">
                You have been invited to review and sign <strong>${label}</strong> from <strong>${brand}</strong>.
                Follow the link below to open and sign the document.
              </td>
            </tr>${
              message
                ? `
            <tr>
              <td style="padding:16px 32px 0;font-size:14px;line-height:22px;color:#3e4c59;white-space:pre-line;">${escapeHtml(message)}</td>
            </tr>`
                : ''
            }
            <tr>
              <td align="center" style="padding:28px 32px;">
                <a href="${link}" style="display:inline-block;background:${BRAND_PRIMARY};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 48px;border-radius:4px;">Review &amp; Sign</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 16px;font-size:13px;line-height:20px;color:#52606d;">
                This link is for you only and expires in ${input.expirationDays} days. If it stops working, reply to this email and we will send a new one.
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px;font-size:12px;line-height:18px;color:#7b8794;border-top:1px solid #e4e7eb;">
                If the button does not work, copy and paste this address into your browser:<br />
                <span style="word-break:break-all;">${link}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const BRAND_PRIMARY = '#0B5D3B';
const BRAND_ACCENT = '#22C55E';

const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();

type ContractMailInput = {
  contractId: number;
  applicationId: string;
  envelopeId: string;
  /** Envelope title, e.g. "ACME LLC — $45,000.00 — Signature Requested". */
  title: string;
  funderName?: string | null;
  values?: Record<string, string> | null;
  signers: Array<{ email: string; name?: string | null; roleName?: string | null }>;
  ccEmails: string[];
};

function stripTitleSuffix(title: string): string {
  return String(title || '').replace(/\s+—\s+Signature Requested$/i, '').trim();
}

async function emailContext(input: ContractMailInput) {
  const app = await prisma.application
    .findUnique({ where: { id: input.applicationId }, select: { applicationId: true, dealDisplayName: true } })
    .catch(() => null);
  const values = input.values ?? {};
  const label = stripTitleSuffix(input.title) || 'Contract';
  const merchantName =
    String(values.client_legal_name || '').trim() || String(app?.dealDisplayName || '').trim() || label.split(' — ')[0];
  const rawAmount = String(values.purchase_amount || '').trim();
  const logos = buildBrandLogoAttachments();
  const lightLogo = logos.find((a) => a.cid.includes('light')) ?? logos[0];
  return {
    bookName: String(input.funderName || '').trim() || BRAND_DISPLAY_NAME,
    merchantName,
    applicationNumber: app?.applicationId != null ? String(app.applicationId) : null,
    fundedAmount: rawAmount ? formatContractOfferAmountForSubject(rawAmount) : null,
    pdfFilename: contractPdfFileName(merchantName),
    logoSrc: BRAND_LOGO_URL || (lightLogo ? `cid:${lightLogo.cid}` : APPROVAL_BANNER_LOGO_URL),
    logoAttachments: !BRAND_LOGO_URL && lightLogo ? [lightLogo] : [],
  };
}

function formatEmailDate(d = new Date()): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
}

/** CC addresses that are not signers, de-duplicated. */
function ccRecipients(input: ContractMailInput): string[] {
  const signers = new Set(input.signers.map((s) => lower(s.email)));
  return [...new Set(input.ccEmails.map(lower))].filter((e) => e.includes('@') && !signers.has(e));
}

async function deliverToCcs(
  input: ContractMailInput,
  kind: ContractEmailKind,
  subject: string,
  html: string,
  ctx: Awaited<ReturnType<typeof emailContext>>,
  pdf: Buffer | null,
): Promise<PearSignMailOutcome> {
  const out: PearSignMailOutcome = { emailed: [], failed: [] };
  const attachments = [
    ...ctx.logoAttachments,
    ...(pdf?.length ? [{ filename: ctx.pdfFilename, content: pdf, contentType: 'application/pdf' }] : []),
  ];
  const resendKinds: ContractEmailAttachmentKind[] = [
    ...(ctx.logoAttachments.length ? (['brand_logo'] as const) : []),
    ...(pdf?.length ? (['contract_pdf'] as const) : []),
  ];
  // One after another: the Gmail mailbox rate-limits bursts, and the lists are tiny.
  for (const email of ccRecipients(input)) {
    try {
      await sendLoggedContractEmail({
        applicationId: input.applicationId,
        groupId: input.envelopeId,
        kind,
        recipient: { email, role: 'CC' },
        subject,
        html,
        attachments,
        resend: {
          contractId: input.contractId,
          envelopeId: input.envelopeId,
          attachments: resendKinds,
          pdfFilename: ctx.pdfFilename,
        },
      });
      out.emailed.push(email);
    } catch (err) {
      const error = (err as Error)?.message || String(err);
      console.error(`[PearSign] ${kind} email to ${email} failed:`, error);
      out.failed.push({ email, error });
    }
  }
  return out;
}

/** One invite per signer from the CRM mailbox, each with that signer's PearSign signing URL. */
async function sendSignerInvites(
  input: ContractMailInput & {
    message?: string | null;
    signingUrls: Array<{ email: string; roleId?: string; signingUrl: string }>;
  },
): Promise<PearSignMailOutcome> {
  const out: PearSignMailOutcome = { emailed: [], failed: [] };
  const ctx = await emailContext(input);
  const label = stripTitleSuffix(input.title) || 'your agreement';
  const subject = `${ctx.bookName}: ${label} — Signature Requested`;
  for (const signer of input.signers) {
    const email = lower(signer.email);
    if (!email) continue;
    const url = input.signingUrls.find((u) => lower(u.email) === email)?.signingUrl;
    if (!url) {
      const error = 'PearSign returned no signing link for this signer.';
      console.error(`[PearSign] signing invite to ${email} not sent: ${error}`);
      out.failed.push({ email, error });
      continue;
    }
    try {
      await sendLoggedContractEmail({
        applicationId: input.applicationId,
        groupId: input.envelopeId,
        kind: 'signing_invite',
        recipient: { email, role: 'SIGNER', name: signer.name ?? null, roleDetail: signer.roleName ?? null },
        subject,
        html: buildPearSignInviteHtml({
          recipientName: signer.name,
          contractLabel: label,
          bookName: ctx.bookName,
          message: input.message,
          signingUrl: url,
          expirationDays: SIGNING_EXPIRATION_DAYS,
          logoSrc: ctx.logoSrc,
        }),
        attachments: ctx.logoAttachments,
        resend: {
          contractId: input.contractId,
          envelopeId: input.envelopeId,
          attachments: ctx.logoAttachments.length ? ['brand_logo'] : [],
        },
      });
      out.emailed.push(email);
    } catch (err) {
      const error = (err as Error)?.message || String(err);
      console.error(`[PearSign] signing invite to ${email} failed:`, error);
      out.failed.push({ email, error });
    }
  }
  return out;
}

/**
 * After a PearSign send: email the signing invites from the CRM mailbox (or log the
 * ones PearSign emailed), then the "Contract Sent" copy (with the filled contract)
 * to every CC. Never throws.
 */
export async function notifyPearSignContractSent(
  input: ContractMailInput & {
    pearSignEmailedSigners: boolean;
    signingUrls?: Array<{ email: string; roleId?: string; signingUrl: string }> | null;
    message?: string | null;
    loadPdf: () => Promise<Buffer>;
  },
): Promise<PearSignMailOutcome & { invites: PearSignMailOutcome }> {
  let invites: PearSignMailOutcome = { emailed: [], failed: [] };
  try {
    if (input.pearSignEmailedSigners) {
      await logExternalSigningInvites({
        applicationId: input.applicationId,
        groupId: input.envelopeId,
        subject: `PearSign requested your signature on "${input.title}"`,
        signers: input.signers,
      });
    } else if (crmSendsSignerInvites()) {
      invites = await sendSignerInvites({ ...input, signingUrls: input.signingUrls ?? [] });
      console.info('[PearSign] signing invites emailed', { contractId: input.contractId, ...invites });
    }
  } catch (err) {
    console.error('[PearSign] signing invites failed:', err);
    invites = {
      emailed: invites.emailed,
      failed: input.signers.map((s) => ({ email: s.email, error: String((err as Error)?.message || err) })),
    };
  }
  const cc = await notifyCcsContractSent(input);
  return { ...cc, invites };
}

/**
 * The old per-CC copies ("Contract Sent" and "Signed Contract", with the PDF) are off: the team
 * gets only the two "Contract Update" emails (Viewed, Signed). Set CONTRACT_CC_COPY_EMAILS=on
 * to send the CC copies again.
 */
export function contractCcCopyEmailsEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(String(process.env.CONTRACT_CC_COPY_EMAILS ?? '').trim());
}

async function notifyCcsContractSent(
  input: ContractMailInput & { loadPdf: () => Promise<Buffer> },
): Promise<PearSignMailOutcome> {
  try {
    if (!contractCcCopyEmailsEnabled() || !ccRecipients(input).length) return { emailed: [], failed: [] };

    let pdf: Buffer | null = null;
    try {
      pdf = await input.loadPdf();
    } catch (err) {
      console.warn('[PearSign] contract PDF for the CC copy unavailable:', (err as Error)?.message);
    }
    const ctx = await emailContext(input);
    const html = renderContractSentEmailHtml({
      bookName: ctx.bookName,
      merchantName: ctx.merchantName,
      applicationId: ctx.applicationNumber,
      fundedAmount: ctx.fundedAmount,
      sentDate: formatEmailDate(),
      signerEmails: input.signers.map((s) => s.email),
      attachmentName: pdf?.length ? ctx.pdfFilename : null,
      companyName: BRAND_DISPLAY_NAME,
      logoSrc: ctx.logoSrc,
      brandPrimary: BRAND_PRIMARY,
      brandAccent: BRAND_ACCENT,
    });
    const subject = buildContractSentEmailSubject(ctx.bookName, ctx.merchantName);
    const outcome = await deliverToCcs(input, 'cc_copy', subject, html, ctx, pdf);
    console.info('[PearSign] contract-sent copy emailed', { contractId: input.contractId, ...outcome });
    return outcome;
  } catch (err) {
    console.error('[PearSign] contract-sent CC emails failed:', err);
    return { emailed: [], failed: input.ccEmails.map((email) => ({ email, error: String((err as Error)?.message || err) })) };
  }
}

/** Once the envelope is completed: the executed contract to every CC. Never throws. */
export async function notifyPearSignContractSigned(
  input: ContractMailInput & { pdf: Buffer | null },
): Promise<PearSignMailOutcome> {
  try {
    if (!contractCcCopyEmailsEnabled() || !ccRecipients(input).length) return { emailed: [], failed: [] };
    const ctx = await emailContext(input);
    const html = renderSignedContractEmailHtml({
      bookName: ctx.bookName,
      merchantName: ctx.merchantName,
      applicationId: ctx.applicationNumber,
      fundedAmount: ctx.fundedAmount,
      signedDate: formatEmailDate(),
      attachmentName: input.pdf?.length ? ctx.pdfFilename : null,
      companyName: BRAND_DISPLAY_NAME,
      logoSrc: ctx.logoSrc,
      brandPrimary: BRAND_PRIMARY,
      brandAccent: BRAND_ACCENT,
    });
    const subject = buildSignedContractEmailSubject(ctx.bookName, ctx.merchantName);
    const outcome = await deliverToCcs(input, 'signed_copy', subject, html, ctx, input.pdf);
    console.info('[PearSign] signed copy emailed', { contractId: input.contractId, ...outcome });
    return outcome;
  } catch (err) {
    console.error('[PearSign] signed-copy CC emails failed:', err);
    return { emailed: [], failed: input.ccEmails.map((email) => ({ email, error: String((err as Error)?.message || err) })) };
  }
}

// ---------- Contract status updates (internal team notice) ----------

/** Who gets the "Contract Update" notice. Override with CONTRACT_STATUS_NOTIFY_EMAILS (comma separated). */
const DEFAULT_STATUS_NOTIFY_EMAILS = ['office@cashablefunding.com', 'ariel@cashablefunding.com'];

export function contractStatusNotifyEmails(): string[] {
  const raw = String(process.env.CONTRACT_STATUS_NOTIFY_EMAILS ?? '').trim();
  const list = raw ? raw.split(/[,;\s]+/) : DEFAULT_STATUS_NOTIFY_EMAILS;
  return [...new Set(list.map(lower))].filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function formatEmailDateTime(d = new Date()): string {
  const s = d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
  return `${s} ET`;
}

/** PearSign recipient status → wording for the Signers row. */
function signerStatusLabel(status: string | null | undefined, signedAt?: string | null): string {
  const s = lower(status);
  if (signedAt || s === 'signed' || s === 'completed') return 'Signed';
  if (s === 'viewed' || s === 'opened') return 'Viewed';
  if (s === 'declined') return 'Declined';
  if (s === 'sent' || s === 'pending' || s === 'waiting' || !s) return 'Not signed yet';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Where the team's email thread for one envelope starts (its first "Contract Update"). */
export type ContractUpdateThreads = Record<string, { messageId?: string; gmailThreadId?: string }>;
/** Key of the single shared thread in ContractUpdateThreads. */
const TEAM_THREAD = 'team';

/** A Message-ID for the first email of a thread, on the sender mailbox's domain. */
function newThreadMessageId(): string {
  const sender = String(process.env.GMAIL_SENDER_EMAIL || process.env.SMTP_FROM || '').trim();
  const domain = sender.split('@')[1]?.replace(/[>\s].*$/, '') || 'cashable.crm';
  return `<contract-update-${randomUUID()}@${domain}>`;
}

/**
 * "Contract Update: <Merchant>" to the Cashable team (Office + Ariel by default), from the CRM
 * mailbox, each logged to the deal's Mail Log. One thread per envelope and recipient: the first
 * email (normally "Sent") starts it and every later update replies into it ("Re: …"), with the
 * status as the email's heading. Returns the updated `threads`. Never throws.
 */
export async function notifyPearSignStatusChange(input: {
  contractId: number;
  applicationId: string;
  envelopeId: string;
  title: string;
  funderName?: string | null;
  values?: Record<string, string> | null;
  status: string;
  /** Signers as sent (role order), matched to PearSign's per-recipient status by email. */
  signers: Array<{ email: string; name?: string | null; roleName?: string | null }>;
  recipientStatuses?: Array<{ signerEmail: string; status: string; signedAt?: string | null }>;
  /** Existing threads for this envelope (from earlier updates). */
  threads?: ContractUpdateThreads | null;
  /** Signed contract PDF, attached to the Signed update only. */
  pdf?: Buffer | null;
}): Promise<PearSignMailOutcome & { threads: ContractUpdateThreads }> {
  const threads: ContractUpdateThreads = { ...(input.threads ?? {}) };
  const out: PearSignMailOutcome & { threads: ContractUpdateThreads } = { emailed: [], failed: [], threads };
  const to = contractStatusNotifyEmails();
  if (!to.length) return out;
  try {
    const ctx = await emailContext({ ...input, ccEmails: [] });
    const pdf = input.pdf?.length ? input.pdf : null;
    const byEmail = new Map((input.recipientStatuses ?? []).map((r) => [lower(r.signerEmail), r]));
    const signers = input.signers
      .filter((s) => String(s.name || s.email || '').trim())
      .map((s) => {
        const r = byEmail.get(lower(s.email));
        const who = String(s.name || s.email).trim();
        const role = String(s.roleName || '').trim();
        return {
          name: role ? `${who} (${role})` : who,
          detail: r ? signerStatusLabel(r.status, r.signedAt) : null,
        };
      });
    const html = renderContractStatusUpdateEmailHtml({
      bookName: ctx.bookName,
      merchantName: ctx.merchantName,
      applicationId: ctx.applicationNumber,
      fundedAmount: ctx.fundedAmount,
      status: input.status,
      updatedAt: formatEmailDateTime(),
      signers,
      attachmentName: pdf ? ctx.pdfFilename : null,
      companyName: BRAND_DISPLAY_NAME,
      logoSrc: ctx.logoSrc,
      brandPrimary: BRAND_PRIMARY,
      brandAccent: BRAND_ACCENT,
    });
    // ONE email per update with the whole team (Office + Ariel) in CC, addressed To the CRM's own
    // sending mailbox. The first update (Viewed) starts the thread; Signed replies into it.
    const mailbox = lower(process.env.GMAIL_SENDER_EMAIL || '');
    const [primary, ...ccs] = mailbox && !to.includes(mailbox) ? [mailbox, ...to] : to;
    const root = threads[TEAM_THREAD];
    const reply = Boolean(root?.messageId);
    const ownMessageId = reply ? undefined : newThreadMessageId();
    try {
      await sendLoggedContractEmail({
        applicationId: input.applicationId,
        groupId: input.envelopeId,
        kind: 'status_update',
        recipient: {
          email: primary,
          role: 'CC',
          roleDetail: primary === mailbox ? 'Status update (To: CRM mailbox)' : 'Status update (To)',
        },
        cc: ccs.map((email) => ({ email, role: 'CC' as const, roleDetail: 'Status update (CC)' })),
        subject: buildContractStatusUpdateSubject(ctx.merchantName, { reply }),
        html,
        threading: reply
          ? { inReplyTo: root!.messageId, references: root!.messageId, gmailThreadId: root!.gmailThreadId }
          : { messageId: ownMessageId },
        onDelivered: (d) => {
          // Only the first email defines the thread; replies keep pointing at it.
          if (!reply) threads[TEAM_THREAD] = { messageId: d.messageId ?? ownMessageId, gmailThreadId: d.gmailThreadId };
        },
        attachments: [
          ...ctx.logoAttachments,
          ...(pdf ? [{ filename: ctx.pdfFilename, content: pdf, contentType: 'application/pdf' }] : []),
        ],
        resend: {
          contractId: input.contractId,
          envelopeId: input.envelopeId,
          attachments: [
            ...(ctx.logoAttachments.length ? (['brand_logo'] as const) : []),
            ...(pdf ? (['contract_pdf'] as const) : []),
          ],
          pdfFilename: ctx.pdfFilename,
        },
      });
      out.emailed.push(...to);
    } catch (err) {
      const error = (err as Error)?.message || String(err);
      console.error(`[PearSign] status update email to ${to.join(', ')} failed:`, error);
      out.failed.push(...to.map((email) => ({ email, error })));
    }
    console.info('[PearSign] status update emailed', { contractId: input.contractId, status: input.status, ...out });
  } catch (err) {
    console.error('[PearSign] status update emails failed:', err);
    for (const email of to) if (!out.emailed.includes(email)) out.failed.push({ email, error: String((err as Error)?.message || err) });
  }
  return out;
}
