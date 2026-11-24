/**
 * Desktop (Windows / macOS) notifications for contract signing updates while the CRM is open in
 * any tab — also in the background. Uses the browser Notification API; the user allows it once
 * ("Enable desktop alerts" in the bell). Several open tabs show one alert (same tag).
 */

export function desktopNotificationsSupported(): boolean {
    return typeof window !== "undefined" && "Notification" in window;
}

export function desktopNotificationPermission(): NotificationPermission | "unsupported" {
    return desktopNotificationsSupported() ? Notification.permission : "unsupported";
}

/** Ask once (must run from a click). Resolves with the browser's answer. */
export async function enableDesktopNotifications(): Promise<NotificationPermission | "unsupported"> {
    if (!desktopNotificationsSupported()) return "unsupported";
    if (Notification.permission !== "default") return Notification.permission;
    try {
        return await Notification.requestPermission();
    } catch {
        return Notification.permission;
    }
}

/** Contract status notifications from the server (type set by contractSigningStatusEffects). */
export function isContractSigningNotification(type: unknown, realtimeKind?: unknown): boolean {
    return String(type ?? "") === "contract_signing" || String(realtimeKind ?? "") === "contract_signing_status";
}

export function showDesktopNotification(input: { id: string; title: string; body: string; url?: string | null }): void {
    if (!desktopNotificationsSupported() || Notification.permission !== "granted") return;
    try {
        const n = new Notification(input.title, {
            body: input.body,
            tag: `crm-${input.id}`, // one alert even with several CRM tabs open
            icon: "/favicon.ico",
        });
        n.onclick = () => {
            window.focus();
            if (input.url) {
                const target = new URL(input.url, window.location.origin);
                if (target.origin === window.location.origin) window.location.assign(target.toString());
            }
            n.close();
        };
    } catch {
        /* some browsers only allow notifications from a service worker */
    }
}
