import { useEffect, useRef, useState } from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - package ships without bundled types
import HelloSign from "hellosign-embedded";

/**
 * Full-tab host for the Dropbox Sign embedded editor (claim URLs only render
 * inside the official embed). Opened by Review & send in a new tab:
 *   /dropbox-sign-editor?u=<claim url>&c=<client id>
 * Send/close results are broadcast on the "dropboxsign-editor" channel so the
 * originating tab can refresh the deal's signing status.
 */
export default function DropboxSignEditorPage() {
  const [status, setStatus] = useState<"opening" | "sent" | "closed" | "error">(
    "opening",
  );
  const [error, setError] = useState("");
  const openedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const url = String(params.get("u") || "").trim();
    const clientId = String(params.get("c") || "").trim();
    if (!url) {
      setStatus("error");
      setError("Missing editor link. Close this tab and click Review & send again.");
      return;
    }
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("dropboxsign-editor")
        : null;
    const client = new HelloSign({ clientId });
    let completed = false;
    client.on("send", (data: unknown) => {
      completed = true;
      setStatus("sent");
      channel?.postMessage({
        type: "sent",
        signatureRequestId: String(
          (data as { signatureRequestId?: string })?.signatureRequestId || "",
        ),
      });
      // Hand control back to the CRM tab (it advances to the Sent step).
      setTimeout(() => {
        try {
          window.close();
        } catch {
          /* browser refused - the fallback text stays visible */
        }
      }, 800);
    });
    client.on("sign", () => {
      completed = true;
      setStatus("sent");
      channel?.postMessage({ type: "sent" });
    });
    client.on("error", (data: unknown) => {
      setStatus("error");
      setError(String((data as { code?: string })?.code || "Editor error"));
      channel?.postMessage({ type: "error" });
    });
    client.on("close", () => {
      if (!completed) {
        setStatus("closed");
        channel?.postMessage({ type: "closed" });
      }
    });
    const isTest = import.meta.env.DEV || params.get("t") === "1";
    client.open(url, {
      skipDomainVerification: isTest,
      testMode: isTest,
      debug: isTest,
      allowCancel: true,
      // Mount inline into the full-viewport container instead of the default
      // fixed-size modal, so the editor uses the whole tab.
      container: containerRef.current ?? undefined,
    });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-center">
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          display: status === "opening" ? "block" : "none",
        }}
      />
      {status === "opening" && (
        <p className="text-slate-500">Opening the Dropbox Sign editor…</p>
      )}
      {status === "sent" && (
        <div>
          <p className="text-lg font-semibold text-green-700">
            Sent! The signing email was delivered to the signer(s).
          </p>
          <p className="mt-2 text-slate-500">You can close this tab.</p>
        </div>
      )}
      {status === "closed" && (
        <div>
          <p className="text-lg font-semibold text-slate-700">
            Editor closed without sending.
          </p>
          <p className="mt-2 text-slate-500">
            Nothing was sent. Close this tab and click Review &amp; send to try again.
          </p>
        </div>
      )}
      {status === "error" && (
        <p className="text-red-600">{error || "Could not open the editor."}</p>
      )}
    </div>
  );
}
