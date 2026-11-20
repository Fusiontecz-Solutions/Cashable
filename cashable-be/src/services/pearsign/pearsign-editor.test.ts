jest.mock('../../config/prismaClient', () => ({ __esModule: true, default: {} }));
jest.mock('puppeteer', () => ({ __esModule: true, default: {} }));

import { editorOrigin, packageFromEditorFields } from './pearsign-package.service';

const pkg = {
  mergedPdfUrl: 'https://example.com/package.pdf',
  documents: [],
  recipients: [{ roleId: 'owner1', roleName: 'Owner 1', name: 'Jane', email: 'jane@example.com' }],
  fields: [
    {
      name: 'd1__business_name',
      key: 'd1__business_name',
      label: 'Business name',
      docIndex: 1,
      type: 'text' as const,
      roleId: 'owner1',
      signerFilled: false,
      required: false,
      page: 1,
      x: 100,
      y: 200,
      width: 150,
      height: 15,
    },
    {
      name: 'd1__sign',
      key: 'd1__sign',
      label: 'Signature',
      docIndex: 1,
      type: 'signature' as const,
      roleId: 'owner1',
      signerFilled: true,
      required: true,
      page: 2,
      x: 50,
      y: 600,
      width: 130,
      height: 20,
    },
  ],
};
const sendName = new Map([
  ['d1__business_name', 'd1__business_name'],
  ['d1__sign', 'd1__sign'],
]);

describe('packageFromEditorFields', () => {
  it('keeps the Review key for moved CRM fields and takes values typed in the editor', () => {
    const out = packageFromEditorFields(pkg, sendName, { d1__business_name: 'ACME' }, undefined, [
      { fieldName: 'd1__business_name', type: 'text', roleId: 'owner1', position: { page: 1, x: 120, y: 210, width: 200, height: 16 }, prefillValue: 'ACME LLC', fontSize: 9 },
      { fieldName: 'd1__sign', type: 'signature', roleId: 'owner1', position: { page: 2, x: 50, y: 600, width: 130, height: 20 } },
    ]);
    expect(out).not.toBeNull();
    const biz = out!.sentPackage.fields.find((f) => f.key === 'd1__business_name')!;
    expect(biz).toMatchObject({ x: 120, y: 210, width: 200, signerFilled: false });
    expect(out!.values.d1__business_name).toBe('ACME LLC');
    expect(out!.sentPackage.styles?.d1__business_name?.fontSize).toBe(9);
    expect(out!.sentPackage.fields.find((f) => f.key === 'd1__sign')!.signerFilled).toBe(true);
  });

  it('gives fields added in the editor their own key; a filled one prints, an empty one is for the signer', () => {
    const out = packageFromEditorFields(pkg, sendName, {}, undefined, [
      { fieldName: 'note', type: 'text', roleId: 'owner1', position: { page: 1, x: 10, y: 10, width: 80, height: 14 }, prefillValue: 'Wire on Monday' },
      { fieldName: 'title', type: 'text', roleId: 'owner1', position: { page: 1, x: 10, y: 40, width: 80, height: 14 } },
    ]);
    const note = out!.sentPackage.fields.find((f) => f.name === 'note')!;
    expect(note).toMatchObject({ key: 'editor__note', signerFilled: false });
    expect(out!.values.editor__note).toBe('Wire on Monday');
    expect(out!.sentPackage.fields.find((f) => f.name === 'title')!.signerFilled).toBe(true);
  });

  it('gives up (PearSign PDF instead) when a position is missing', () => {
    expect(packageFromEditorFields(pkg, sendName, {}, undefined, [{ fieldName: 'x', type: 'text', position: { page: 1 } }])).toBeNull();
  });
});

describe('editorOrigin', () => {
  it('accepts https and localhost origins, trimmed to the origin', () => {
    expect(editorOrigin('https://crm.example.com/deals/1')).toBe('https://crm.example.com');
    expect(editorOrigin('http://localhost:3043')).toBe('http://localhost:3043');
  });
  it('refuses plain http on a real host and garbage', () => {
    expect(() => editorOrigin('http://crm.example.com')).toThrow();
    expect(() => editorOrigin('')).toThrow();
  });
});
