import axios from 'axios';
import MailComposer from 'nodemailer/lib/mail-composer';
import type Mail from 'nodemailer/lib/mailer';
import { getAccessTokenForRefreshToken, invalidateAccessTokenCache } from './gmail';
import {
    findUserForGmailAccess,
    getGoogleRefreshTokenForUser,
} from '../services/googleToken.service';

/**
 * Server-wide outbound mail via the Gmail API (`users.messages.send`).
 *
 * The sending mailbox is `GMAIL_SENDER_EMAIL`. Its OAuth refresh token comes from
 * `GMAIL_SENDER_REFRESH_TOKEN`, or — when unset — from the CRM user with that email
 * who connected Google on the Gmail page (scope `gmail.send` is already requested).
 *
 * Gmail sends From the authenticated mailbox (or a verified "Send mail as" alias),
 * so the From address is always the sender mailbox; only the display name varies.
 * Gmail has no delivery/open/click webhooks, so Mail Log rows stay at "sent".
 */

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const ACCESS_TOKEN_CACHE_KEY = 'server-mailer';

export function getGmailSenderEmail(): string | undefined {
    return process.env.GMAIL_SENDER_EMAIL?.trim() || undefined;
}

export function isGmailApiMailerConfigured(): boolean {
    return Boolean(
        getGmailSenderEmail() &&
            process.env.GOOGLE_CLIENT_ID?.trim() &&
            process.env.GOOGLE_CLIENT_SECRET?.trim(),
    );
}

async function resolveSenderRefreshToken(senderEmail: string): Promise<string> {
    const fromEnv = process.env.GMAIL_SENDER_REFRESH_TOKEN?.trim();
    if (fromEnv) return fromEnv;

    const user = await findUserForGmailAccess({ email: senderEmail });
    const fromDb = user ? getGoogleRefreshTokenForUser(user) : null;
    if (!fromDb) {
        throw new Error(
            `Gmail sender ${senderEmail} is not connected. Sign in to the CRM as ${senderEmail} and connect Google on the Gmail page, or set GMAIL_SENDER_REFRESH_TOKEN.`,
        );
    }
    return fromDb;
}

async function getSenderAccessToken(senderEmail: string): Promise<string> {
    const refreshToken = await resolveSenderRefreshToken(senderEmail);
    const token = await getAccessTokenForRefreshToken(refreshToken, ACCESS_TOKEN_CACHE_KEY);
    if (!token) {
        throw new Error(`Could not mint a Gmail access token for ${senderEmail}`);
    }
    return token;
}

function toBase64Url(buffer: Buffer): string {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type GmailApiSendResult = {
    gmailMessageId?: string;
    gmailThreadId?: string;
    /** RFC 822 Message-ID as delivered. */
    messageId?: string;
    accepted: string[];
    rejected: string[];
};

function listAddresses(value: Mail.Options['to']): string[] {
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    return list
        .map((entry) => (typeof entry === 'string' ? entry : entry?.address || ''))
        .map((entry) => String(entry).trim())
        .filter(Boolean);
}

/** Gmail API rejected or could not take a send; `status` is the HTTP status when there was one. */
export class GmailApiSendError extends Error {
    constructor(
        message: string,
        readonly status?: number,
        /** True when Gmail certainly did not accept the message (safe to try another provider). */
        readonly notSent = false,
    ) {
        super(message);
        this.name = 'GmailApiSendError';
    }
}

/** A Gmail mailbox to send from: the server mailer, or a funder's connected mailbox. */
export type GmailSendMailbox = {
    /** Address used for Message-ID read-back logs. */
    email: string;
    /** From address (the mailbox itself or a verified "Send mail as" alias). */
    fromEmail: string;
    /** Short-lived access token; `force` skips any cache (after a 401). */
    getAccessToken: (force?: boolean) => Promise<string | null>;
};

/** Gmail API failure → not sent (4xx / no request made) vs. possibly sent (5xx / timeout / reset). */
function toGmailSendError(error: any): GmailApiSendError {
    const status: number | undefined = error?.response?.status;
    const message = `Gmail API send failed: ${error?.response?.data?.error?.message || error?.message || error}`;
    if (typeof status === 'number') return new GmailApiSendError(message, status, status < 500);
    const code = String(error?.code ?? '').toUpperCase();
    const preRequest = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code);
    return new GmailApiSendError(message, undefined, preRequest);
}

/**
 * Send a fully composed message (nodemailer `Mail.Options`: html, cc, bcc,
 * attachments incl. inline `cid`, custom headers) from `mailbox` through the Gmail API.
 */
export async function sendViaGmailMailbox(
    mail: Omit<Mail.Options, 'from'> & {
        fromName?: string;
        /** Gmail thread to add this message to (the sender mailbox's conversation). */
        gmailThreadId?: string;
    },
    mailbox: GmailSendMailbox,
): Promise<GmailApiSendResult> {
    const { fromName, gmailThreadId, ...rest } = mail;
    const raw = await new MailComposer({
        ...rest,
        from: fromName ? { name: fromName, address: mailbox.fromEmail } : mailbox.fromEmail,
    })
        .compile()
        .build();

    const token = async (force = false) => {
        const value = await mailbox.getAccessToken(force);
        if (!value) {
            throw new GmailApiSendError(`Could not mint a Gmail access token for ${mailbox.email}`, undefined, true);
        }
        return value;
    };
    const post = (accessToken: string) =>
        axios.post(
            GMAIL_SEND_URL,
            { raw: toBase64Url(raw), ...(gmailThreadId ? { threadId: gmailThreadId } : {}) },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                maxBodyLength: Infinity,
            },
        );

    let response;
    try {
        response = await post(await token());
    } catch (error: any) {
        if (error instanceof GmailApiSendError) throw error;
        if (error?.response?.status !== 401) throw toGmailSendError(error);
        try {
            response = await post(await token(true));
        } catch (retryError: any) {
            if (retryError instanceof GmailApiSendError) throw retryError;
            throw toGmailSendError(retryError);
        }
    }

    const gmailMessageId = response.data?.id ? String(response.data.id) : undefined;
    return {
        gmailMessageId,
        gmailThreadId: response.data?.threadId ? String(response.data.threadId) : undefined,
        // Gmail may replace the Message-ID it was given; read back the one recipients see,
        // so later emails can reply to it (In-Reply-To / References).
        messageId: gmailMessageId ? await readGmailRfcMessageId(mailbox, gmailMessageId) : undefined,
        accepted: [...listAddresses(mail.to), ...listAddresses(mail.cc), ...listAddresses(mail.bcc)],
        rejected: [],
    };
}

/** Send through the server mailbox (`GMAIL_SENDER_EMAIL`). */
export async function sendViaGmailApi(
    mail: Omit<Mail.Options, 'from'> & {
        fromName?: string;
        gmailThreadId?: string;
    },
): Promise<GmailApiSendResult> {
    const senderEmail = getGmailSenderEmail();
    if (!senderEmail) {
        throw new Error('Gmail API mailer is not configured. Set GMAIL_SENDER_EMAIL.');
    }
    try {
        return await sendViaGmailMailbox(mail, {
            email: senderEmail,
            fromEmail: senderEmail,
            getAccessToken: async (force) => {
                if (force) invalidateAccessTokenCache(ACCESS_TOKEN_CACHE_KEY);
                return getSenderAccessToken(senderEmail);
            },
        });
    } catch (error) {
        if (error instanceof GmailApiSendError) throw new Error(error.message);
        throw error;
    }
}

/** The RFC 822 `Message-ID` header of a sent Gmail message (best effort). */
async function readGmailRfcMessageId(mailbox: GmailSendMailbox, gmailMessageId: string): Promise<string | undefined> {
    try {
        const accessToken = await mailbox.getAccessToken();
        if (!accessToken) return undefined;
        const res = await axios.get(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(gmailMessageId)}`,
            {
                params: { format: 'metadata', metadataHeaders: 'Message-ID' },
                headers: { Authorization: `Bearer ${accessToken}` },
            },
        );
        const headers: Array<{ name?: string; value?: string }> = res.data?.payload?.headers ?? [];
        const value = headers.find((h) => String(h.name || '').toLowerCase() === 'message-id')?.value;
        return value ? String(value).trim() : undefined;
    } catch (err: any) {
        console.warn('[gmail-mailer] could not read the sent Message-ID:', err?.response?.data?.error?.message || err?.message);
        return undefined;
    }
}
