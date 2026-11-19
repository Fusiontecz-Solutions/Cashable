import {
  buildContractStatusUpdateSubject,
  contractStatusNoticeGroup,
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
  it('keeps one subject per contract so updates stay in one thread', () => {
    expect(buildContractStatusUpdateSubject('ACME LLC')).toBe('Contract Update: ACME LLC');
    expect(buildContractStatusUpdateSubject('ACME LLC', { reply: true })).toBe('Re: Contract Update: ACME LLC');
    expect(buildContractStatusUpdateSubject('')).toBe('Contract Update: Merchant');
  });

  it.each([
    ['sent', 'sent'],
    ['viewed', 'viewed'],
    ['signed', 'signed'],
    ['completed', 'signed'],
    ['partially_signed', null],
    ['in_signing', null],
    ['declined', null],
    ['voided', null],
    ['expired', null],
    ['draft', null],
  ])('notice group for %s is %s', (status, group) => {
    expect(contractStatusNoticeGroup(status)).toBe(group);
  });

  it('labels the three notices', () => {
    expect(contractStatusUpdateLabel('sent')).toBe('Sent');
    expect(contractStatusUpdateLabel('viewed')).toBe('Viewed');
    expect(contractStatusUpdateLabel('completed')).toBe('Signed');
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

  it('shows Signed for a completed contract', () => {
    const html = renderContractStatusUpdateEmailHtml({ ...base, status: 'completed' });
    expect(html).toContain('Contract Signed');
  });
});
