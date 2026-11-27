import { BRAND_DISPLAY_NAME, BRAND_LOGO_URL } from '../constants/brand';

/** Hosted Cashable logo for outbound email (email clients cannot load app-bundled images). */
export const EMAIL_BRAND_LOGO_URL =
    BRAND_LOGO_URL ||
    'https://res.cloudinary.com/ar8iuzlv/image/upload/v1793283654/Copy_of_CASHABLE_FUND_LLC_CONTRACT_2.jpg';

/** An image that already is the brand logo: the logo URL, or an <img> whose src / alt names the logo or brand. */
export function emailHtmlHasBrandLogo(html: string): boolean {
    if (!html) return false;
    if (html.includes(EMAIL_BRAND_LOGO_URL)) return true;
    if (/Copy_of_CASHABLE_FUND_LLC_CONTRACT/i.test(html)) return true;
    return /<img\b[^>]*(?:src|alt)\s*=\s*["'][^"']*(?:logo|cashable)[^"']*["']/i.test(html);
}

function logoBlock(): string {
    const alt = String(BRAND_DISPLAY_NAME || 'Cashable').replace(/"/g, '&quot;');
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">' +
        '<tr><td align="center" style="padding:16px 12px 8px 12px;">' +
        `<img src="${EMAIL_BRAND_LOGO_URL}" alt="${alt}" width="140" border="0" style="display:block;width:140px;max-width:140px;height:auto;margin:0 auto;" />` +
        '</td></tr></table>'
    );
}

/**
 * Every email the CRM sends shows the Cashable logo. Templates that already carry it are left
 * as they are; any other HTML email gets the logo at the top (right after <body>, or before the
 * content when it is a fragment). Plain-text and empty bodies are untouched.
 */
export function withEmailBrandLogo(html: string | undefined | null): string {
    const body = String(html ?? '');
    if (!body.trim() || !/<[a-z][\s\S]*>/i.test(body)) return body;
    if (emailHtmlHasBrandLogo(body)) return body;
    const bodyOpen = /<body\b[^>]*>/i.exec(body);
    if (bodyOpen) {
        const at = bodyOpen.index + bodyOpen[0].length;
        return body.slice(0, at) + logoBlock() + body.slice(at);
    }
    return logoBlock() + body;
}
