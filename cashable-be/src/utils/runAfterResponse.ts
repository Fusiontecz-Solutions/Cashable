/**
 * Run slow follow-up work (email delivery, notifications, logs) after the HTTP response has been
 * sent, so the CRM does not wait for it. Errors are logged, never thrown: the request is already
 * answered.
 */
export function runAfterResponse(label: string, work: () => Promise<unknown>): void {
    setImmediate(() => {
        work().catch((err) => {
            console.error(`${label} background work failed:`, err);
        });
    });
}
