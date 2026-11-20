jest.mock('../../config/prismaClient', () => ({ __esModule: true, default: {} }));
jest.mock('puppeteer', () => ({ __esModule: true, default: {} }));

import { PDFDocument } from 'pdf-lib';
import { renderTypedCoj } from '../docusign/utils/coj-typed-document';
import { packageBase } from './pearsign-package.service';
import { primeBasePdfCache } from './pearsign-preview.service';

const inputs = [
  ['owner1_guarantor_name', 'Owner name'],
  ['business_name_with_dba', 'Merchant name'],
  ['owner_state', 'Sworn state'],
  ['owner_county', 'Sworn county'],
  ['guarantor_address_full', 'Owner address'],
  ['purchase_amount', 'Purchased amount'],
  ['agreement_date', 'Agreement date'],
  ['funder_name', 'Plaintiff'],
].map(([variable, label]) => ({ key: `d1__coj1__${variable}`, variable, label }));

const values: Record<string, string> = {
  d1__coj1__owner1_guarantor_name: 'Daniel Dale Berden',
  d1__coj1__business_name_with_dba: "Dan's Mobile V Twin Service, LLC",
  d1__coj1__owner_state: 'FL',
  d1__coj1__owner_county: 'Sarasota',
  d1__coj1__guarantor_address_full: '5239 Moeller Ave, Sarasota, FL, 34232',
  d1__coj1__purchase_amount: '20,000.00',
  d1__coj1__agreement_date: '11/20/2026',
  d1__coj1__funder_name: 'Cashable Fund LLC',
};

async function mergedWithCoj() {
  // [page 1: contract] [pages 2-3: COJ as staged] [page 4: addendum]
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const staged = await renderTypedCoj('coj_iowa', { owner1_guarantor_name: 'OLD NAME', purchase_amount: '1' });
  const src = await PDFDocument.load(staged.pdf);
  for (const p of await doc.copyPages(src, src.getPageIndices())) doc.addPage(p);
  doc.addPage([612, 792]);
  return { bytes: Buffer.from(await doc.save()), cojPages: staged.pageCount };
}

describe('packageBase (typed COJ in a package)', () => {
  it('rebuilds the COJ pages from Review values, keeps the page count and moves its signature box', async () => {
    const { bytes, cojPages } = await mergedWithCoj();
    const url = 'memory://package-test.pdf';
    primeBasePdfCache(url, bytes);
    const fields = [
      { name: 'sig_contract', key: 'sig', type: 'signature', roleId: 'signer-1', signerFilled: true, required: true, page: 1, x: 50, y: 700, width: 130, height: 20 },
      { name: 'sig_coj', key: 'sig2', type: 'signature', roleId: 'signer-1', signerFilled: true, required: true, page: 3, x: 1, y: 1, width: 130, height: 20 },
    ];
    const out = await packageBase(
      {
        mergedPdfUrl: url,
        recipients: [{ roleId: 'signer-1', roleName: 'Owner 1' }],
        fields,
        typedCojs: [{ kind: 'coj_iowa', startPage: 2, pageCount: cojPages, inputs }],
      },
      values,
    );
    const doc = await PDFDocument.load(out.pdf);
    expect(doc.getPageCount()).toBe(1 + cojPages + 1);
    // The contract's own signature is untouched; the COJ one sits on the rebuilt "By:" line.
    expect(out.fields[0]).toEqual(fields[0]);
    const cojSig = out.fields[1];
    expect(cojSig.page).toBeGreaterThanOrEqual(2);
    expect(cojSig.page).toBeLessThanOrEqual(1 + cojPages);
    expect(cojSig.y).toBeGreaterThan(100);
    expect(cojSig.x).toBeGreaterThan(40);
  });
});
