import { contractPdfFileName } from './contractPdfFileName';

describe('contractPdfFileName', () => {
  it('names the PDF "CASHABLE FUND LLC: <Merchant>.pdf" with a file-safe colon', () => {
    expect(contractPdfFileName('Pathfinder Mortgage Corp')).toBe('CASHABLE FUND LLC꞉ Pathfinder Mortgage Corp.pdf');
  });
  it('drops characters file names cannot hold', () => {
    expect(contractPdfFileName('A/B: "C" LLC')).toBe('CASHABLE FUND LLC꞉ A B C LLC.pdf');
  });
  it('falls back to the funder name alone', () => {
    expect(contractPdfFileName('  ')).toBe('CASHABLE FUND LLC.pdf');
  });
});
