import { EMAIL_BRAND_LOGO_URL, emailHtmlHasBrandLogo, withEmailBrandLogo } from './emailBrandLogo';

describe('every CRM email shows the logo', () => {
  it('adds the logo right after <body> when a template has none', () => {
    const out = withEmailBrandLogo('<!DOCTYPE html><html><body style="margin:0"><p>Hi</p></body></html>');
    expect(out).toContain(EMAIL_BRAND_LOGO_URL);
    expect(out.indexOf(EMAIL_BRAND_LOGO_URL)).toBeLessThan(out.indexOf('<p>Hi</p>'));
    expect(out.indexOf('<body style="margin:0">')).toBeLessThan(out.indexOf(EMAIL_BRAND_LOGO_URL));
  });
  it('puts the logo before an HTML fragment', () => {
    expect(withEmailBrandLogo('<p>Contract sent</p>').startsWith('<table')).toBe(true);
  });
  it('leaves templates that already show the logo, plain text and empty bodies alone', () => {
    const branded = `<body><img src="${EMAIL_BRAND_LOGO_URL}" alt="Cashable"></body>`;
    expect(withEmailBrandLogo(branded)).toBe(branded);
    const other = '<body><img src="https://cdn.example.com/brand/logo.png" alt="x"></body>';
    expect(emailHtmlHasBrandLogo(other)).toBe(true);
    expect(withEmailBrandLogo(other)).toBe(other);
    expect(withEmailBrandLogo('Plain text only')).toBe('Plain text only');
    expect(withEmailBrandLogo('')).toBe('');
  });
});
