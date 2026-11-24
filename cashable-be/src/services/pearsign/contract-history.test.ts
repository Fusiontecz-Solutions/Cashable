const store: { overrides: Record<string, unknown> } = { overrides: {} };
jest.mock('../../config/prismaClient', () => {
  const contract = {
    findUnique: jest.fn(async () => ({ id: 7, applicationId: 'app', status: 'SENT', funderName: null, contractPrefillOverrides: store.overrides })),
    update: jest.fn(async ({ data }: { data: { contractPrefillOverrides: Record<string, unknown> } }) => {
      store.overrides = data.contractPrefillOverrides;
      return {};
    }),
  };
  return { __esModule: true, default: { contract, $transaction: async (fn: (tx: unknown) => unknown) => fn({ contract }) } };
});
jest.mock('puppeteer', () => ({ __esModule: true, default: {} }));

import { recordHistoryEnvelopeStatus, syncPearSignContract } from './pearsign-contract.service';

const current = 'bs-22222222-2222-4222-8222-222222222222';
const older = 'bs-11111111-1111-4111-8111-111111111111';
const state = () => (store.overrides.pearsignMainContract as { status: string; history: Array<{ envelopeId: string; status: string }> });

describe('Contracts Generated chain: earlier documents keep their own status', () => {
  beforeEach(() => {
    store.overrides = {
      pearsignMainContract: { envelopeId: current, status: 'sent', sentAt: '2026-11-24T21:20:00Z', history: [{ envelopeId: older, status: 'sent', sentAt: '2026-11-24T16:00:00Z' }] },
    };
  });
  it('an update for an older document changes only its history entry, never the current one', async () => {
    await syncPearSignContract(7, { details: { envelopeId: older, title: '', status: 'completed', createdAt: '', completedAt: '2026-11-24T16:07:00Z', recipients: [] } });
    expect(state().status).toBe('sent');
    expect(state().history).toEqual([expect.objectContaining({ envelopeId: older, status: 'completed', endedAt: '2026-11-24T16:07:00Z' })]);
  });
  it('a status never moves back, and a missed document is added to the chain', async () => {
    await recordHistoryEnvelopeStatus(7, { envelopeId: older, status: 'voided', completedAt: null });
    await recordHistoryEnvelopeStatus(7, { envelopeId: older, status: 'viewed', completedAt: null });
    expect(state().history[0].status).toBe('voided');
    await recordHistoryEnvelopeStatus(7, { envelopeId: 'bs-33333333-3333-4333-8333-333333333333', status: 'declined', completedAt: null, sentAt: '2026-11-23T10:00:00Z' });
    expect(state().history.map((h) => [h.envelopeId.slice(3, 4), h.status])).toEqual([['3', 'declined'], ['1', 'voided']]);
  });
});
