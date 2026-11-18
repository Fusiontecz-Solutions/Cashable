import type { DocumentLayout } from '../utils/convert-docusign-template-export';
import { convertSimplifiedTabsContractExport } from '../utils/convert-docusign-template-export';
import achAuthorizationLayout from './ach_authorization.layout.json';
import achAuthorizationStandaloneLayout from './ach_authorization_standalone.layout.json';
import achAuthorizationTexasExport from './ach_authorization_texas.json';
import balanceTransferLayout from './balance_transfer.layout.json';
import caseTakeoverAddendumLayout from './case_takeover_addendum.layout.json';
import contractLayout from './contract.layout.json';
import flexAddendumLayout from './flex_addendum.layout.json';
import prePaymentAddendumLayout from './pre_payment_addendum.layout.json';
import texasFundingGroupContractExport from './texas_funding_group_contract.json';
import waiverPersonalServiceLayout from './waiver_personal_service.layout.json';
import depositControlLayout from './deposit_control.layout.json';
import depositControlNyTxLayout from './deposit_control_ny_tx.layout.json';
import cojNyGeneralLayout from './coj_ny_general.layout.json';
import cojNyBusinessLayout from './coj_ny_business.layout.json';
import cojNyMerchantLayout from './coj_ny_merchant.layout.json';
import cojIowaLayout from './coj_iowa.layout.json';
import prepayDiscountLayout from './prepay_discount.layout.json';

/** Document type keys used with BoldSignTemplate.type and merge order. */
export const DOCUMENT_LAYOUT_KEYS = {
  contract: 'contract',
  texasFundingGroupContract: 'texas_funding_group_contract',
  balanceTransfer: 'balance_transfer',
  caseTakeoverAddendum: 'case_takeover_addendum',
  flexAddendum: 'flex_addendum',
  prePaymentAddendum: 'pre_payment_addendum',
  achAuthorization: 'ach_authorization',
  achAuthorizationStandalone: 'ach_authorization_standalone',
  achAuthorizationTexas: 'ach_authorization_texas',
  waiverPersonalService: 'waiver_personal_service',
  depositControl: 'deposit_control',
  depositControlNyTx: 'deposit_control_ny_tx',
  cojNyGeneral: 'coj_ny_general',
  cojNyBusiness: 'coj_ny_business',
  cojNyMerchant: 'coj_ny_merchant',
  cojIowa: 'coj_iowa',
  prepayDiscount: 'prepay_discount',
} as const;

export type DocumentLayoutKey =
  (typeof DOCUMENT_LAYOUT_KEYS)[keyof typeof DOCUMENT_LAYOUT_KEYS];

/** Maps BoldSignTemplate.type values to coordinate layouts. */
export const BOLD_SIGN_TYPE_TO_LAYOUT_KEY: Record<string, DocumentLayoutKey> = {
  contract: DOCUMENT_LAYOUT_KEYS.contract,
  texas_funding_group_contract: DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract,
  texas_funding_group: DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract,
  ach_authorization: DOCUMENT_LAYOUT_KEYS.achAuthorization,
  ach_authorization_standalone: DOCUMENT_LAYOUT_KEYS.achAuthorizationStandalone,
  ach_authorization_texas: DOCUMENT_LAYOUT_KEYS.achAuthorizationTexas,
  ach: DOCUMENT_LAYOUT_KEYS.achAuthorization,
  woodmere_ach_authorization: DOCUMENT_LAYOUT_KEYS.achAuthorization,
  texas_ach_authorization: DOCUMENT_LAYOUT_KEYS.achAuthorizationTexas,
  waiver_personal_service: DOCUMENT_LAYOUT_KEYS.waiverPersonalService,
  waiver: DOCUMENT_LAYOUT_KEYS.waiverPersonalService,
  deposit_control: DOCUMENT_LAYOUT_KEYS.depositControl,
  deposit_control_ny_tx: DOCUMENT_LAYOUT_KEYS.depositControlNyTx,
  coj_ny_general: DOCUMENT_LAYOUT_KEYS.cojNyGeneral,
  coj: DOCUMENT_LAYOUT_KEYS.cojNyGeneral,
  coj_ny_business: DOCUMENT_LAYOUT_KEYS.cojNyBusiness,
  coj_ny_merchant: DOCUMENT_LAYOUT_KEYS.cojNyMerchant,
  coj_iowa: DOCUMENT_LAYOUT_KEYS.cojIowa,
  prepay_discount: DOCUMENT_LAYOUT_KEYS.prepayDiscount,
  standard_pre_pay: DOCUMENT_LAYOUT_KEYS.prepayDiscount,
};

const texasFundingGroupLayout = convertSimplifiedTabsContractExport(
  texasFundingGroupContractExport as Record<string, unknown>,
  {
    key: DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract,
    name: 'Texas Funding Group Contract',
    pdfFileName: 'TEXAS FUNDING GROUP.pdf',
  },
);

const achAuthorizationTexasLayout = {
  ...convertSimplifiedTabsContractExport(
    achAuthorizationTexasExport as Record<string, unknown>,
    {
      key: DOCUMENT_LAYOUT_KEYS.achAuthorizationTexas,
      name: 'Texas ACH Authorization',
      pdfFileName: 'TEXAS FUNDING GROUP ACH.pdf',
    },
  ),
  skipOwner2InitialMirror: true,
} as DocumentLayout;

const REGISTRY: Record<DocumentLayoutKey, DocumentLayout> = {
  [DOCUMENT_LAYOUT_KEYS.contract]: contractLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract]: texasFundingGroupLayout,
  [DOCUMENT_LAYOUT_KEYS.balanceTransfer]: balanceTransferLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.caseTakeoverAddendum]:
    caseTakeoverAddendumLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.flexAddendum]: flexAddendumLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.prePaymentAddendum]: prePaymentAddendumLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.achAuthorization]: achAuthorizationLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.achAuthorizationStandalone]:
    achAuthorizationStandaloneLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.achAuthorizationTexas]: achAuthorizationTexasLayout,
  [DOCUMENT_LAYOUT_KEYS.waiverPersonalService]: waiverPersonalServiceLayout as unknown as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.depositControl]: depositControlLayout as unknown as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.depositControlNyTx]: depositControlNyTxLayout as unknown as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.cojNyGeneral]: cojNyGeneralLayout as unknown as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.cojNyBusiness]: cojNyBusinessLayout as unknown as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.cojNyMerchant]: cojNyMerchantLayout as unknown as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.cojIowa]: cojIowaLayout as unknown as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.prepayDiscount]: prepayDiscountLayout as unknown as DocumentLayout,
};

export function getDocumentLayout(key: DocumentLayoutKey): DocumentLayout {
  const layout = REGISTRY[key];
  if (!layout) {
    throw new Error(`Unknown document layout key: ${key}`);
  }
  return layout;
}

export function resolveLayoutKeyFromBoldSignType(type: string): DocumentLayoutKey | null {
  const normalized = String(type || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return BOLD_SIGN_TYPE_TO_LAYOUT_KEY[normalized] || null;
}

/** Default merge order for a full contract package. */
export const DEFAULT_MERGE_LAYOUT_ORDER: DocumentLayoutKey[] = [
  DOCUMENT_LAYOUT_KEYS.contract,
];
