/**
 * Signed `state` for Google OAuth flows that share GET /api/v1/google/callback.
 * Each flow signs its own purpose, so a state minted for one can never complete another.
 */
import jwt from 'jsonwebtoken';
import { resolveCrmFrontendBaseUrl } from '../../utils/crmFrontendUrl';

export const OAUTH_STATE_PURPOSES = { funderGmail: 'funder_gmail_connect' } as const;

const STATE_TTL = '15m';

function jwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured');
    return secret;
}

/** Only allow in-app return paths (open-redirect safe). */
export function safeReturnPath(raw: unknown, fallback: string): string {
    const path = String(raw ?? '').trim();
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback;
    return path;
}

export function signOAuthState(payload: Record<string, unknown> & { p: string }): string {
    return jwt.sign(payload, jwtSecret(), { expiresIn: STATE_TTL });
}

/** Verify a callback state minted for `purpose`; null when invalid, expired or for another flow. */
export function verifyOAuthState<T extends Record<string, unknown>>(
    state: unknown,
    purpose: string,
): (T & { p: string }) | null {
    try {
        const decoded = jwt.verify(String(state ?? ''), jwtSecret()) as T & { p?: string };
        return decoded?.p === purpose ? (decoded as T & { p: string }) : null;
    } catch {
        return null;
    }
}

/** Frontend URL for `returnPath` with extra query params. */
export function frontendRedirect(returnPath: string, params: Record<string, string>): string {
    const base = (resolveCrmFrontendBaseUrl() || '').replace(/\/+$/, '');
    const [path, query = ''] = safeReturnPath(returnPath, '/').split('?');
    const search = new URLSearchParams(query);
    for (const [k, v] of Object.entries(params)) search.set(k, v);
    return `${base}${path}?${search.toString()}`;
}
