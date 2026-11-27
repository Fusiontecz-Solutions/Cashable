jest.mock('puppeteer', () => ({ __esModule: true, default: {} }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prefillFieldsToValueMap } = require('./build-envelope-from-layout');

describe('COJ owner state is spelled out', () => {
  it.each([
    ['NY', 'New York'],
    ['tx', 'Texas'],
    ['NJ', 'New Jersey'],
    ['New York', 'New York'],
  ])('%s → %s', (raw, name) => {
    expect(String(prefillFieldsToValueMap([{ id: 'owner_state', value: raw }]).owner_state).toUpperCase()).toBe(name.toUpperCase());
  });
});
