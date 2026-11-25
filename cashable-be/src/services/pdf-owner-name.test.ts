jest.mock('../config/prismaClient', () => ({ __esModule: true, default: {} }));
jest.mock('puppeteer', () => ({ __esModule: true, default: {} }));
import { assertReadyToCreateNewClientFromPdf, pdfOwnerNameParts } from './applicationService';

describe('PDF upload always creates the application', () => {
  it('never rejects a PDF for a missing owner name', () => {
    expect(() => assertReadyToCreateNewClientFromPdf({ owner: {} }, null)).not.toThrow();
  });
  it('fills missing owner name parts', () => {
    expect(pdfOwnerNameParts({ owner_first_name: 'MYNOR', owner_last_name: 'DE LEON-REYES' })).toEqual({ first: 'MYNOR', last: 'DE LEON-REYES' });
    expect(pdfOwnerNameParts({ owner_first_name: 'MYNOR' })).toEqual({ first: 'MYNOR', last: '-' });
    expect(pdfOwnerNameParts({})).toEqual({ first: 'UNKNOWN', last: 'OWNER' });
    expect(pdfOwnerNameParts(null)).toEqual({ first: 'UNKNOWN', last: 'OWNER' });
  });
});
