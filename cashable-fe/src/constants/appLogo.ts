import appLogoLightSrc from "@/assets/black_logo.svg";
import appLogoDarkSrc from "@/assets/white_logo.svg";
import appMarkSrc from "@/assets/cashable_mark.svg";

function envUrl(key: string): string {
  return String(import.meta.env[key] || "").trim();
}

const envLogoUrl = envUrl("VITE_APP_LOGO_URL");
const envLogoDarkUrl = envUrl("VITE_APP_LOGO_DARK_URL") || envLogoUrl;

/** Long logo on light backgrounds. Set VITE_APP_LOGO_URL to a hosted image URL. */
export const APP_LOGO_SRC = envLogoUrl || appLogoLightSrc;

/** Long logo on dark backgrounds. Set VITE_APP_LOGO_DARK_URL (falls back to VITE_APP_LOGO_URL). */
export const APP_LOGO_DARK_SRC = envLogoDarkUrl || appLogoDarkSrc;

/** Collapsed sidebar / favicon / any small square mark — the green Cashable mark
 *  alone (the full wordmark is unreadable at icon size). Override with VITE_APP_ICON_URL. */
export const APP_SHORT_ICON_SRC = envUrl("VITE_APP_ICON_URL") || appMarkSrc;

/** Same mark works on dark backgrounds (green on transparent). */
export const APP_SHORT_ICON_DARK_SRC = APP_SHORT_ICON_SRC;

/** Hosted logo for outbound email (absolute URL — email clients cannot load Vite-bundled assets). */
export const APP_EMAIL_LOGO_SRC =
  envLogoUrl ||
  envLogoDarkUrl ||
  "https://res.cloudinary.com/ar8iuzlv/image/upload/v1793283654/Copy_of_CASHABLE_FUND_LLC_CONTRACT_2.jpg";

/** Pick long logo URL for the current theme (sidebar expanded, auth headers, etc.). */
export function resolveAppLogoSrc(isDark: boolean): string {
  return isDark ? APP_LOGO_DARK_SRC : APP_LOGO_SRC;
}

export function applyDocumentBrandAssets(companyName: string): void {
  if (typeof document === "undefined") return;
  document.title = companyName;

  const href = APP_SHORT_ICON_SRC;
  if (!href) return;

  const ensureIcon = (rel: string, media?: string) => {
    const selector = media
      ? `link[rel="${rel}"][media="${media}"]`
      : `link[rel="${rel}"]:not([media])`;
    let link = document.head.querySelector<HTMLLinkElement>(selector);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      if (media) link.media = media;
      document.head.appendChild(link);
    }
    link.href = href;
  };

  ensureIcon("icon");
  ensureIcon("icon", "(prefers-color-scheme: light)");
  ensureIcon("icon", "(prefers-color-scheme: dark)");
  ensureIcon("shortcut icon");
}
