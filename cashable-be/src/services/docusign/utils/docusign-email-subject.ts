import { BRAND_DISPLAY_NAME } from '../../../constants/brand';

/** Matches CRM DocuSign signer envelope emailSubject (see fe docusignTemplateConfig). */
export function buildDocuSignEnvelopeEmailSubject(clientName: string): string {
  const client = String(clientName || '').trim() || 'Client';
  return `Complete with Dropbox Sign: ${BRAND_DISPLAY_NAME} - ${client}`;
}
