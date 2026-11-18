/**
 * Dropbox Sign (HelloSign) configuration.
 *
 * Auth is a single API key (HTTP Basic user, empty password) — no JWT / OAuth
 * dance like DocuSign. The client ID (an "API App" in Dropbox Sign) is only
 * needed for embedded signing / embedded requesting iframes.
 *
 * Env:
 *   DROPBOX_SIGN_API_KEY    — Settings → API → API key
 *   DROPBOX_SIGN_CLIENT_ID  — Settings → API → API Apps → your app's client ID
 *   DROPBOX_SIGN_TEST_MODE  — "true" sends every request with test_mode=1
 *                             (free, not legally binding, watermarked)
 */

function envTrim(key: string): string {
    return String(process.env[key] || '').trim();
}

export const DROPBOX_SIGN_API_BASE = 'https://api.hellosign.com/v3';

export function getDropboxSignApiKey(): string {
    return envTrim('DROPBOX_SIGN_API_KEY');
}

export function getDropboxSignClientId(): string {
    return envTrim('DROPBOX_SIGN_CLIENT_ID');
}

export function isDropboxSignTestMode(): boolean {
    const raw = envTrim('DROPBOX_SIGN_TEST_MODE').toLowerCase();
    if (raw === 'false' || raw === '0') return false;
    if (raw === 'true' || raw === '1') return true;
    // Default to test mode outside production so nobody burns paid requests by accident.
    return envTrim('NODE_ENV') !== 'production';
}

export function isDropboxSignConfigured(): boolean {
    return Boolean(getDropboxSignApiKey());
}

export function isDropboxSignEmbeddedConfigured(): boolean {
    return Boolean(getDropboxSignApiKey() && getDropboxSignClientId());
}
