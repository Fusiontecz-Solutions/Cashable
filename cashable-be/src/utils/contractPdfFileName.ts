/** Every contract PDF the CRM hands out is named "CASHABLE FUND LLC: <Merchant>.pdf". */
export const CONTRACT_PDF_FUNDER_NAME = 'CASHABLE FUND LLC';

/**
 * Windows and macOS do not allow ":" in file names (mail clients and browsers turn it into "_"),
 * so the name uses "꞉" (U+A789), which looks the same.
 */
const FILE_NAME_COLON = '꞉';

export function contractPdfFileName(merchantName?: string | null): string {
  const merchant = String(merchantName ?? '')
    .replace(/[<>:"/\|?*\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return merchant ? `${CONTRACT_PDF_FUNDER_NAME}${FILE_NAME_COLON} ${merchant}.pdf` : `${CONTRACT_PDF_FUNDER_NAME}.pdf`;
}
