import {
  CONTRACT_STATUS_UPDATE_STATUSES,
  buildContractStatusUpdateSubject,
  contractStatusUpdateLabel,
  renderContractStatusUpdateEmailHtml,
} from './contractStatusEmailHtml';

const base = {
  bookName: 'CASHABLE FUND LLC',
  merchantName: 'ACME LLC',
  companyName: 'Cashable',
  logoSrc: 'https://example.test/logo.png',
  brandPrimary: '#0B5D3B',
  brandAccent: '#22C55E',
};

describe('Contract Update email', () => {
  it.each([
    ['viewed', 'Contract Update: ACME LLC - Viewed'],
    ['partially_signed', 'Contract Update: ACME LLC - Partially Signed'],
    ['signed', 'Contract Update: ACME LLC - Signed'],
    ['completed', 'Contract Update: ACME LLC - Completed'],
    ['declined', 'Contract Update: ACME LLC - Declined'],
    ['voided', 'Contract Update: ACME LLC - Voided'],
    ['expired', 'Contract Update: ACME LLC - Expired'],
  ])('subject for %s', (status, subject) => {
    expect(buildContractStatusUpdateSubject('ACME LLC', status)).toBe(subject);
  });

  it('notifies on status changes but not on the initial send', () => {
    expect(CONTRACT_STATUS_UPDATE_STATUSES.has('viewed')).toBe(true);
    expect(CONTRACT_STATUS_UPDATE_STATUSES.has('completed')).toBe(true);
    expect(CONTRACT_STATUS_UPDATE_STATUSES.has('sent')).toBe(false);
    expect(CONTRACT_STATUS_UPDATE_STATUSES.has('draft')).toBe(false);
  });

  it('labels an unknown status readably', () => {
    expect(contractStatusUpdateLabel('awaiting_bank')).toBe('Awaiting Bank');
  });

  it('renders the status, merchant and signers, escaping HTML', () => {
    const html = renderContractStatusUpdateEmailHtml({
      ...base,
      merchantName: 'A&B <Corp>',
      status: 'viewed',
      updatedAt: 'November 19, 2026, 2:15 PM ET',
      signers: [{ name: 'Jane Doe (Owner 1)', detail: 'Viewed' }],
    });
    expect(html).toContain('Contract Viewed');
    expect(html).toContain('A&amp;B &lt;Corp&gt;');
    expect(html).not.toContain('<Corp>');
    expect(html).toContain('Jane Doe (Owner 1)');
    expect(html).toContain('November 19, 2026, 2:15 PM ET');
  });
});
