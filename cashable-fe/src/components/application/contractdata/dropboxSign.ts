/**
 * Dropbox Sign (HelloSign) frontend client for the Cashable contract flow.
 *
 * Backend endpoints live under /dropboxsign (see cashable-be
 * src/services/dropboxsign). Dropbox Sign mapping:
 *   send envelope            → sendDropboxSignRequest
 *   embedded sender view     → openDropboxSignEmbedded(claimUrl) from
 *                              getDropboxSignEmbeddedRequestUrl (admin places
 *                              fields + sends inside the iframe)
 *   embedded recipient view  → openDropboxSignEmbedded(signUrl) from
 *                              getDropboxSignEmbeddedSignLink
 *   void envelope            → cancelDropboxSignRequest
 */
import { axiosGet, axiosPost, axiosPostFormData } from "@/redux/axios";

export type DropboxSignSigner = { name: string; email: string; order?: number };

export type DropboxSignRequestSummary = {
  signatureRequestId: string;
  title: string;
  isComplete: boolean;
  isDeclined: boolean;
  status: "sent" | "partially_signed" | "completed" | "declined" | "canceled" | "error";
  signatures: Array<{
    signatureId: string;
    signerName: string | null;
    signerEmail: string | null;
    statusCode: string;
    signedAt: number | null;
  }>;
  metadata: Record<string, string>;
};

export async function getDropboxSignCapabilities(): Promise<{
  configured: boolean;
  embeddedConfigured: boolean;
  testMode: boolean;
  clientId: string;
}> {
  const res = await axiosGet("/dropboxsign/capabilities");
  return res.data;
}

export async function sendDropboxSignRequest(input: {
  applicationId?: string;
  title?: string;
  subject?: string;
  message?: string;
  signers: DropboxSignSigner[];
  files?: File[];
  fileUrls?: string[];
  useTextTags?: boolean;
  embedded?: boolean;
  ccEmails?: string[];
}): Promise<DropboxSignRequestSummary> {
  const form = new FormData();
  if (input.applicationId) form.append("applicationId", input.applicationId);
  if (input.title) form.append("title", input.title);
  if (input.subject) form.append("subject", input.subject);
  if (input.message) form.append("message", input.message);
  form.append("signers", JSON.stringify(input.signers));
  if (input.fileUrls?.length) form.append("fileUrls", JSON.stringify(input.fileUrls));
  if (input.ccEmails?.length) form.append("ccEmails", JSON.stringify(input.ccEmails));
  if (input.useTextTags) form.append("useTextTags", "true");
  if (input.embedded) form.append("embedded", "true");
  (input.files || []).forEach((file) => form.append("files", file, file.name));
  const res = await axiosPostFormData("/dropboxsign/send", form);
  return res.data?.signatureRequest;
}

/** Sender-view replacement: returns a claim URL to open with openDropboxSignEmbedded. */
export async function getDropboxSignEmbeddedRequestUrl(input: {
  applicationId?: string;
  requesterEmail?: string;
  title?: string;
  subject?: string;
  message?: string;
  signers?: DropboxSignSigner[];
  files?: File[];
  fileUrls?: string[];
}): Promise<{ claimUrl: string; clientId: string }> {
  const form = new FormData();
  if (input.applicationId) form.append("applicationId", input.applicationId);
  if (input.requesterEmail) form.append("requesterEmail", input.requesterEmail);
  if (input.title) form.append("title", input.title);
  if (input.subject) form.append("subject", input.subject);
  if (input.message) form.append("message", input.message);
  if (input.signers?.length) form.append("signers", JSON.stringify(input.signers));
  if (input.fileUrls?.length) form.append("fileUrls", JSON.stringify(input.fileUrls));
  (input.files || []).forEach((file) => form.append("files", file, file.name));
  const res = await axiosPostFormData("/dropboxsign/embedded-request-url", form);
  return res.data;
}

export async function getDropboxSignEmbeddedSignLink(input: {
  signatureRequestId: string;
  signerEmail?: string;
}): Promise<{ signUrl: string; clientId: string }> {
  const res = await axiosPost("/dropboxsign/embedded-sign-link", input);
  return res.data;
}

export async function getDropboxSignStatus(
  signatureRequestId: string,
): Promise<DropboxSignRequestSummary> {
  const res = await axiosGet(`/dropboxsign/status/${encodeURIComponent(signatureRequestId)}`);
  return res.data?.signatureRequest;
}

export async function cancelDropboxSignRequest(signatureRequestId: string): Promise<void> {
  await axiosPost("/dropboxsign/cancel", { signatureRequestId });
}

export async function remindDropboxSignSigner(
  signatureRequestId: string,
  signerEmail: string,
): Promise<void> {
  await axiosPost("/dropboxsign/remind", { signatureRequestId, signerEmail });
}

export function dropboxSignDownloadUrl(signatureRequestId: string): string {
  return `/dropboxsign/download/${encodeURIComponent(signatureRequestId)}`;
}

/* ------------------------------------------------------------------ */
/* Embedded iframe (hellosign-embedded v2, loaded from the CDN)        */
/* ------------------------------------------------------------------ */

/**
 * Open the Dropbox Sign editor in its own tab (the /dropbox-sign-editor route
 * hosts the embed; claim URLs cannot render outside it). Resolves immediately;
 * the editor's outcome arrives via onResult (BroadcastChannel from the tab).
 */
export function openDropboxSignEmbedded(
  url: string,
  clientId: string,
  options?: {
    /** Pre-opened window (popup-blocker safe) to navigate instead of window.open. */
    reuseWindow?: Window | null;
    /** Test-mode drafts may skip Dropbox Sign's domain verification. */
    testMode?: boolean;
    onResult?: (result: { completed: boolean; signatureRequestId?: string }) => void;
  },
): Promise<{ completed: boolean; openedInTab: boolean }> {
  const route = `/dropbox-sign-editor?u=${encodeURIComponent(url)}&c=${encodeURIComponent(clientId)}${options?.testMode ? "&t=1" : ""}`;
  const reuse = options?.reuseWindow;
  if (reuse && !reuse.closed) {
    try {
      reuse.location.href = route;
    } catch {
      window.open(route, "_blank");
    }
  } else {
    window.open(route, "_blank");
  }
  if (options?.onResult && typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("dropboxsign-editor");
    const done = (completed: boolean, signatureRequestId?: string) => {
      try {
        channel.close();
      } catch {
        /* ignore */
      }
      clearTimeout(timer);
      options.onResult?.({ completed, signatureRequestId });
    };
    const timer = setTimeout(() => done(false), 30 * 60_000);
    channel.onmessage = (event) => {
      const data = event.data as { type?: string; signatureRequestId?: string } | null;
      const type = data?.type;
      if (type === "sent") done(true, data?.signatureRequestId || undefined);
      else if (type === "closed" || type === "error") done(false);
    };
  }
  return Promise.resolve({ completed: false, openedInTab: true });
}
