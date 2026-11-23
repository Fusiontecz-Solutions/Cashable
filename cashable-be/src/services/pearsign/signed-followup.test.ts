jest.mock('../../config/prismaClient', () => ({ __esModule: true, default: {} }));
jest.mock('puppeteer', () => ({ __esModule: true, default: {} }));

import { owedSignedFollowUp } from './pearsign-contract.service';

describe('owedSignedFollowUp (Signed email held back for its PDF)', () => {
  const env = 'bs-6cdd4a77-49a3-4686-a447-f26dd9dd133e';
  const now = new Date().toISOString();
  const state = (extra: object = {}) => ({ envelopeId: env, status: 'completed', completedAt: now, ...extra }) as never;
  it('is owed until the Signed email went out and the signed copy is archived', () => {
    expect(owedSignedFollowUp({}, state())).toBe(true);
    expect(owedSignedFollowUp({ pearsignStatusNotice: `${env}:signed` }, state())).toBe(true); // no archive yet
    expect(owedSignedFollowUp({ pearsignStatusNotice: `${env}:viewed` }, state({ signedPdfUrl: 'https://x' }))).toBe(true);
    expect(owedSignedFollowUp({ pearsignStatusNotice: `${env}:signed` }, state({ signedPdfUrl: 'https://x' }))).toBe(false);
  });
  it('never applies to unsigned or long-finished contracts', () => {
    expect(owedSignedFollowUp({}, state({ status: 'viewed' }))).toBe(false);
    expect(owedSignedFollowUp({}, state({ completedAt: '2026-01-01T00:00:00Z' }))).toBe(false);
    expect(owedSignedFollowUp({}, state({ completedAt: null }))).toBe(false);
  });
});
