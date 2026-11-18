/**
 * State disclosure PDF tab coordinates for DocuSign merged envelopes.
 *
 * `tabLabel` values match CRM prefill field ids from
 * `in-house-crm-fe/src/components/application/contractdata/Daily_*.ts` and
 * `Weekly_California.ts` (snake_case), NOT legacy third-party platform names
 * (`purchasePrice`, `amountFinanced`, `paymentTerms`, etc.).
 *
 * Config keys: `${frequency}${StateName}` — e.g. `dailyFlorida`, `weeklyCalifornia`.
 */

type StateDocumentTabParty = 'primary' | 'secondary';

export interface StateDocumentFieldConfig {
  documentId: string;
  pageNumber: string;
  signHere: {
    x: string;
    y: string;
    pageNumber?: string;
    signerParty?: StateDocumentTabParty;
  }[];
  dateTabs: {
    x: string;
    y: string;
    pageNumber?: string;
    tabLabel?: string;
    signerParty?: StateDocumentTabParty;
  }[];
  textTabs: {
    tabLabel: string;
    x: string;
    y: string;
    pageNumber?: string;
    width?: string;
    height?: string;
    /** When true, tab is not required and may be omitted when empty. */
    optional?: boolean;
    /** When true, signer cannot edit (CRM prefill only). */
    lockedForSigner?: boolean;
    /** Explicit font size in points for narrow template gaps (default size10). */
    fontSize?: string;
  }[];
  initialHereTabs?: { x: string; y: string; pageNumber?: string }[];
}

/** Florida disclosure page-1 coordinates — daily layout. */
const FLORIDA_DAILY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '151' },
  { tabLabel: 'total_amount_business_fund', x: '426', y: '102' },
  { tabLabel: 'funder_name', x: '207', y: '188' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '154' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '429', y: '189' },
  { tabLabel: 'total_dollar_cost', x: '429', y: '240' },
  { tabLabel: 'estimated_payment_amount', x: '430', y: '276' },
  { tabLabel: 'percent_of_business_income', x: '417', y: '328' },
  { tabLabel: 'client_name', x: '473', y: '328' },
  { tabLabel: 'client_name', x: '419', y: '356' },
  { tabLabel: 'total_dollar_cost', x: '477', y: '435' },
];

/** Florida disclosure page-1 coordinates — weekly layout. */
const FLORIDA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '152' },
  { tabLabel: 'total_amount_business_fund', x: '426', y: '102' },
  { tabLabel: 'funder_name', x: '207', y: '190' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '153' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '429', y: '190' },
  { tabLabel: 'total_dollar_cost', x: '429', y: '240' },
  { tabLabel: 'estimated_payment_amount', x: '430', y: '278' },
  { tabLabel: 'percent_of_business_income', x: '417', y: '328' },
  { tabLabel: 'client_name', x: '465', y: '328' },
  { tabLabel: 'client_name', x: '419', y: '360' },
  { tabLabel: 'total_dollar_cost', x: '478', y: '462' },
];

/** Missouri disclosure page-1 coordinates. */
const MISSOURI_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '151' },
  { tabLabel: 'total_amount_business_fund', x: '436', y: '107' },
  { tabLabel: 'funder_name', x: '207', y: '188' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '436', y: '156' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '436', y: '189' },
  { tabLabel: 'total_dollar_cost', x: '436', y: '240' },
  { tabLabel: 'estimated_payment_amount', x: '434', y: '291' },
  { tabLabel: 'percent_of_business_income', x: '416', y: '355' },
  { tabLabel: 'client_name', x: '473', y: '355' },
  { tabLabel: 'client_name', x: '420', y: '394' },
  { tabLabel: 'total_dollar_cost', x: '479', y: '489' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const MISSOURI_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '151' },
  { tabLabel: 'total_amount_business_fund', x: '436', y: '101' },
  { tabLabel: 'funder_name', x: '207', y: '190' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '436', y: '151' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '436', y: '189' },
  { tabLabel: 'total_dollar_cost', x: '436', y: '240' },
  { tabLabel: 'estimated_payment_amount', x: '428', y: '291' },
  { tabLabel: 'percent_of_business_income', x: '416', y: '355' },
  { tabLabel: 'client_name', x: '459', y: '355' },
  { tabLabel: 'client_name', x: '420', y: '400' },
  { tabLabel: 'total_dollar_cost', x: '477', y: '491' },
];

const MISSOURI_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '88', y: '604' },
    { x: '426', y: '603', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '83', y: '679', tabLabel: 'Signature_date' },
    { x: '422', y: '679', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

/** Georgia disclosure page-1 coordinates — daily layout. */
const GEORGIA_DAILY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '151' },
  { tabLabel: 'total_amount_business_fund', x: '436', y: '107' },
  { tabLabel: 'funder_name', x: '208', y: '202' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '436', y: '157' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '438', y: '210' },
  { tabLabel: 'total_dollar_cost', x: '438', y: '260' },
  { tabLabel: 'estimated_payment_amount', x: '438', y: '293' },
  { tabLabel: 'percent_of_business_income', x: '415', y: '342' },
  { tabLabel: 'client_name', x: '474', y: '342' },
  { tabLabel: 'client_name', x: '422', y: '384' },
  { tabLabel: 'total_dollar_cost', x: '476', y: '472' },
];

/** Georgia disclosure page-1 coordinates — weekly layout. */
const GEORGIA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '152' },
  { tabLabel: 'total_amount_business_fund', x: '436', y: '102' },
  { tabLabel: 'funder_name', x: '207', y: '190' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '436', y: '153' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '438', y: '189' },
  { tabLabel: 'total_dollar_cost', x: '433', y: '240' },
  { tabLabel: 'estimated_payment_amount', x: '430', y: '278' },
  { tabLabel: 'percent_of_business_income', x: '419', y: '328' },
  { tabLabel: 'client_name', x: '463', y: '328' },
  { tabLabel: 'client_name', x: '419', y: '360' },
  { tabLabel: 'total_dollar_cost', x: '477', y: '463' },
];

const GEORGIA_DAILY_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '91', y: '589' },
    { x: '430', y: '589', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '86', y: '665', tabLabel: 'Signature_date' },
    { x: '426', y: '665', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

const GEORGIA_WEEKLY_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '91', y: '577' },
    { x: '430', y: '589', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '88', y: '653', tabLabel: 'Signature_date' },
    { x: '426', y: '665', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

/** Utah disclosure page-2 owner signatures and agreement dates (daily + weekly). */
const UTAH_DISCLOSURE_PAGE2_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '92', y: '102', pageNumber: '2' },
    { x: '431', y: '101', pageNumber: '2', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '90', y: '175', pageNumber: '2', tabLabel: 'Signature_date' },
    {
      x: '431',
      y: '175',
      pageNumber: '2',
      tabLabel: 'Signature_date',
      signerParty: 'secondary',
    },
  ],
};

/** Utah disclosure page-1 amount / variable-payment coordinates (daily + weekly). */
const UTAH_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'purchase_amount', x: '190', y: '112' },
  { tabLabel: 'net_to_merchant', x: '191', y: '148' },
  { tabLabel: 'purchase_price', x: '191', y: '183' },
  { tabLabel: 'finance_charge', x: '191', y: '218' },
  { tabLabel: 'remittance', x: '192', y: '348' },
  { tabLabel: 'monthly_income', x: '227', y: '529' },
  { tabLabel: 'appendix_underwriting_fees', x: '190', y: '464' },
  // Payment-terms % of daily revenue (not cadence). Keep off bare `frequency`
  // so Contract / OfferDecision frequency cannot be polluted with "0.00%".
  { tabLabel: 'payment_terms_percent', x: '174', y: '516' },
  { tabLabel: 'payment_exceed_percent', x: '403', y: '559' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const UTAH_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'purchase_amount', x: '183', y: '107' },
  { tabLabel: 'net_to_merchant', x: '183', y: '142' },
  { tabLabel: 'purchase_price', x: '183', y: '176' },
  { tabLabel: 'finance_charge', x: '183', y: '210' },
  { tabLabel: 'remittance', x: '183', y: '341' },
  { tabLabel: 'monthly_income', x: '227', y: '529' },
  { tabLabel: 'appendix_underwriting_fees', x: '190', y: '468' },
  // Payment-terms % of daily revenue (not cadence). Keep off bare `frequency`
  // so Contract / OfferDecision frequency cannot be polluted with "0.00%".
  { tabLabel: 'payment_terms_percent', x: '174', y: '516' },
  { tabLabel: 'payment_exceed_percent', x: '403', y: '560' },
];

/** Kansas disclosure page-1 coordinates — daily layout. */
const KANSAS_DAILY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '151' },
  { tabLabel: 'funder_name', x: '162', y: '202' },
  { tabLabel: 'total_amount_of_fund_provided', x: '438', y: '107' },
  { tabLabel: 'total_amount_fund_disbursed', x: '438', y: '158' },
  { tabLabel: 'total_of_payments', x: '439', y: '208' },
  { tabLabel: 'total_dollar_cost_of_frinancing', x: '439', y: '245' },
  { tabLabel: 'estimated_payment', x: '439', y: '280' },
  { tabLabel: 'total_dollar_cost_of_frinancing', x: '483', y: '332' },
];

/** Kansas disclosure page-1 coordinates — weekly layout. */
const KANSAS_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '155' },
  { tabLabel: 'funder_name', x: '162', y: '193' },
  { tabLabel: 'total_amount_of_fund_provided', x: '434', y: '100' },
  { tabLabel: 'total_amount_fund_disbursed', x: '433', y: '137' },
  { tabLabel: 'total_of_payments', x: '434', y: '175' },
  { tabLabel: 'total_dollar_cost_of_frinancing', x: '432', y: '212' },
  { tabLabel: 'estimated_payment', x: '428', y: '251' },
  { tabLabel: 'total_dollar_cost_of_frinancing', x: '475', y: '302' },
];

const KANSAS_DAILY_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '91', y: '442' },
    { x: '429', y: '442', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '91', y: '518', tabLabel: 'Signature_date' },
    { x: '428', y: '517', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

const KANSAS_WEEKLY_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '93', y: '414' },
    { x: '430', y: '416', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '88', y: '493', tabLabel: 'Signature_date' },
    { x: '430', y: '490', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

/** Virginia disclosure page-1 coordinates (daily + weekly). */
const VIRGINIA_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'disclosure_name', x: '450', y: '69' },
  { tabLabel: 'recipient_address', x: '365', y: '108' },
  { tabLabel: 'funder_name', x: '446', y: '133' },
  { tabLabel: 'funder_address', x: '346', y: '166' },
  { tabLabel: 'funder_phone', x: '466', y: '198' },
  { tabLabel: 'funder_email', x: '344', y: '232' },
  { tabLabel: 'total_amount_sales_based_financing', x: '267', y: '45' },
  { tabLabel: 'fees_deducted', x: '268', y: '89' },
  { tabLabel: 'disbursement_amount', x: '267', y: '125' },
  { tabLabel: 'finance_charge', x: '269', y: '166' },
  { tabLabel: 'total_repayment_amount', x: '269', y: '189' },
  { tabLabel: 'estimated_number_of_payement', x: '264', y: '224' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const VIRGINIA_WEEKLY_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'disclosure_name', x: '450', y: '69' },
  { tabLabel: 'recipient_address', x: '365', y: '108' },
  { tabLabel: 'funder_name', x: '446', y: '133' },
  { tabLabel: 'funder_address', x: '346', y: '166' },
  { tabLabel: 'funder_phone', x: '466', y: '198' },
  { tabLabel: 'funder_email', x: '344', y: '232' },
  { tabLabel: 'total_amount_sales_based_financing', x: '267', y: '45' },
  { tabLabel: 'fees_deducted', x: '268', y: '89' },
  { tabLabel: 'disbursement_amount', x: '267', y: '125' },
  { tabLabel: 'finance_charge', x: '269', y: '166' },
  { tabLabel: 'total_repayment_amount', x: '269', y: '189' },
  { tabLabel: 'estimated_number_of_payement', x: '264', y: '218' },
  /** Methodology paragraph: funder name before "provides revenue-based". */
  { tabLabel: 'funder_name', x: '95', y: '372' },
  /** "payment of $ __ Weekly" - narrow template gap, smaller font. */
  { tabLabel: 'remittance', x: '247', y: '412', fontSize: '8' },
];

const VIRGINIA_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '167', y: '719' },
    { x: '420', y: '720', signerParty: 'secondary' },
    { x: '150', y: '711', pageNumber: '2' },
    { x: '438', y: '712', pageNumber: '2', signerParty: 'secondary' },
  ],
  dateTabs: [{ x: '443', y: '45', tabLabel: 'agreement_date' }],
};

const VIRGINIA_PAGE2_HEADER_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'recipient_name2', x: '152', y: '43', pageNumber: '2' },
  { tabLabel: 'recipient_address1', x: '152', y: '72', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '421', y: '72', pageNumber: '2' },
  { tabLabel: 'disclosure_date2', x: '416', y: '44', pageNumber: '2' },
];

const VIRGINIA_PAGE2_FEES_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'deal_id_prefix', x: '338', y: '267', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '227', y: '315', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '478', y: '412', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '395', y: '428', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '77', y: '460', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '109', y: '476', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '510', y: '476', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '448', y: '636', pageNumber: '2' },
];

const VIRGINIA_DAILY_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  ...VIRGINIA_PAGE2_HEADER_TEXT_TABS,
  ...VIRGINIA_PAGE2_FEES_TEXT_TABS,
];

const VIRGINIA_WEEKLY_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  ...VIRGINIA_PAGE2_HEADER_TEXT_TABS,
  ...VIRGINIA_PAGE2_FEES_TEXT_TABS,
];

/** Connecticut disclosure page 1 — daily layout. */
const CONNECTICUT_DAILY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'recipient_name', x: '450', y: '64' },
  { tabLabel: 'recipient_address', x: '345', y: '112' },
  { tabLabel: 'funder_name', x: '424', y: '127' },
  { tabLabel: 'funder_address', x: '346', y: '167' },
  { tabLabel: 'funder_phone', x: '466', y: '192' },
  { tabLabel: 'funder_email', x: '344', y: '229' },
  { tabLabel: 'total_amount_commercial_financing', x: '267', y: '41' },
  { tabLabel: 'deducted_at_disbursement', x: '267', y: '77' },
  { tabLabel: 'total_commerical_financing', x: '272', y: '113' },
  { tabLabel: 'finance_charge', x: '269', y: '166' },
  { tabLabel: 'total_repayment_amount', x: '269', y: '197' },
  { tabLabel: 'estimated_time_periodic_paymement', x: '264', y: '241' },
  { tabLabel: 'disclosure_broker_fee', x: '393', y: '664' },
];

/** Connecticut disclosure page 1 — weekly layout (recipient address lower on page). */
const CONNECTICUT_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'recipient_name', x: '450', y: '69' },
  { tabLabel: 'recipient_address', x: '345', y: '124' },
  { tabLabel: 'funder_name', x: '424', y: '130' },
  { tabLabel: 'funder_address', x: '346', y: '166' },
  { tabLabel: 'funder_phone', x: '466', y: '189' },
  { tabLabel: 'funder_email', x: '344', y: '229' },
  { tabLabel: 'total_amount_commercial_financing', x: '267', y: '51' },
  { tabLabel: 'deducted_at_disbursement', x: '267', y: '77' },
  { tabLabel: 'total_commerical_financing', x: '272', y: '113' },
  { tabLabel: 'finance_charge', x: '269', y: '166' },
  { tabLabel: 'total_repayment_amount', x: '269', y: '196' },
  { tabLabel: 'estimated_time_periodic_paymement', x: '264', y: '241' },
  { tabLabel: 'disclosure_broker_fee', x: '393', y: '666' },
];

const CONNECTICUT_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'recipient_name2', x: '144', y: '38', pageNumber: '2' },
  { tabLabel: 'recipient_address2_line1', x: '155', y: '58', fontSize: '8', pageNumber: '2' },
  { tabLabel: 'recipient_address2_line2', x: '155', y: '67', fontSize: '8', pageNumber: '2' },
  { tabLabel: 'disclosure_date2', x: '429', y: '39', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '431', y: '58', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '68', y: '178', fontSize: '9', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '282', y: '248', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '410', y: '275', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '502', y: '342', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '325', y: '354', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '339', y: '369', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '270', y: '382', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '100', y: '394', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '274', y: '493', pageNumber: '2' },
  {
    tabLabel: 'connecticut_review_field_1',
    x: '284',
    y: '525',
    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_2',
    x: '282',
    y: '555',
    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_3',
    x: '280',
    y: '599',
    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_4',
    x: '275',
    y: '630',
    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
];

/** Weekly variant - aligned to the weekly template PDF. */
const CONNECTICUT_WEEKLY_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'recipient_name2', x: '144', y: '38', pageNumber: '2' },
  { tabLabel: 'recipient_address2_line1', x: '155', y: '58', fontSize: '8', pageNumber: '2' },
  { tabLabel: 'recipient_address2_line2', x: '155', y: '67', fontSize: '8', pageNumber: '2' },
  { tabLabel: 'disclosure_date2', x: '429', y: '39', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '431', y: '58', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '90', y: '178', pageNumber: '2' },
  { tabLabel: 'remittance', x: '175', y: '211', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '294', y: '243', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '411', y: '270', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '503', y: '337', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '331', y: '351', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '351', y: '364', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '334', y: '377', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '132', y: '390', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '273', y: '488', pageNumber: '2' },
  {
    tabLabel: 'connecticut_review_field_1',
    x: '284',
    y: '525',
    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_2',
    x: '282',
    y: '556',
    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_3',
    x: '280',
    y: '600',
    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_4',
    x: '275',
    y: '630',
    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
];

const CONNECTICUT_DISCLOSURE_SIGN_INITIAL_AND_DATES: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs' | 'initialHereTabs'
> = {
  initialHereTabs: [{ x: '258', y: '733' }],
  dateTabs: [
    { x: '443', y: '45', tabLabel: 'disclosure_date' },
    { x: '475', y: '746', tabLabel: 'signature_date' },
    { x: '82', y: '39', pageNumber: '3', tabLabel: 'signature1_date' },
    {
      x: '81',
      y: '71',
      pageNumber: '3',
      tabLabel: 'signature2_date',
      signerParty: 'secondary',
    },
  ],
  signHere: [
    { x: '165', y: '23', pageNumber: '3' },
    { x: '250', y: '38', pageNumber: '3', signerParty: 'secondary' },
  ],
};

/** Weekly variant - aligned to the weekly template PDF. */
const CONNECTICUT_WEEKLY_SIGN_INITIAL_AND_DATES: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs' | 'initialHereTabs'
> = {
  initialHereTabs: [{ x: '258', y: '733' }],
  dateTabs: [
    { x: '443', y: '45', tabLabel: 'disclosure_date' },
    { x: '475', y: '746', tabLabel: 'signature_date' },
    { x: '82', y: '39', pageNumber: '3', tabLabel: 'signature1_date' },
    {
      x: '81',
      y: '71',
      pageNumber: '3',
      tabLabel: 'signature2_date',
      signerParty: 'secondary',
    },
  ],
  signHere: [
    { x: '165', y: '23', pageNumber: '3' },
    { x: '250', y: '38', pageNumber: '3', signerParty: 'secondary' },
  ],
};

/** California disclosure sign/date positions (daily + weekly share page 2 layout). */
const CALIFORNIA_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '92', y: '260', pageNumber: '2' },
    { x: '429', y: '259', pageNumber: '2', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '90', y: '336', pageNumber: '2', tabLabel: 'signature_date' },
    {
      x: '434',
      y: '335',
      pageNumber: '2',
      tabLabel: 'signature_date',
      signerParty: 'secondary',
    },
  ],
};

/** California disclosure coordinates — daily layout. */
const CALIFORNIA_DAILY_DISCLOSURE_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'funding_provided', x: '183', y: '101' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '345', y: '143' },
  { tabLabel: 'estimated_annual_percentage_rate', x: '178', y: '234' },
  { tabLabel: 'avarage_monthly_income', x: '330', y: '318' },
  /** Merchant business legal name (not owner / client person name). */
  { tabLabel: 'disclosure_merchant_name', x: '383', y: '304' },
  { tabLabel: 'funder_name', x: '433', y: '376' },
  { tabLabel: 'finance_charge', x: '182', y: '423' },
  { tabLabel: 'payment_total', x: '184', y: '444' },
  { tabLabel: 'estimated_monthly_cost', x: '182', y: '478' },
  { tabLabel: 'funder_name', x: '348', y: '493' },
  { tabLabel: 'estimated_payment', x: '182', y: '541' },
  { tabLabel: 'funder_name', x: '174', y: '558' },
  { tabLabel: 'payement_exceeded_percent', x: '423', y: '623' },
  { tabLabel: 'client_name', x: '180', y: '637' },
  { tabLabel: 'monthly_income', x: '360', y: '650' },
  { tabLabel: 'payement_exceeded_percent', x: '405', y: '681' },
  { tabLabel: 'estimated_term', x: '198', y: '71', pageNumber: '2' },
  { tabLabel: 'disclosure_merchant_name', x: '361', y: '85', pageNumber: '2' },
  { tabLabel: 'avarage_monthly_income', x: '454', y: '112', pageNumber: '2' },
  { tabLabel: 'finance_charge', x: '355', y: '160', pageNumber: '2' },
  { tabLabel: 'disclosure_recipient_funds', x: '446', y: '90', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '446',
    y: '112',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '446',
    y: '145',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'disclosure_page3_subtotal', x: '448', y: '167', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '448', y: '185', pageNumber: '3' },
  { tabLabel: 'disclosure_page3_net', x: '447', y: '208', pageNumber: '3' },
];

/** California weekly disclosure — distinct page 1 / page 3 x positions from daily. */
const CALIFORNIA_WEEKLY_DISCLOSURE_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'funding_provided', x: '183', y: '100' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '345', y: '141' },
  { tabLabel: 'funder_name', x: '415', y: '100' },
  { tabLabel: 'estimated_annual_percentage_rate', x: '178', y: '234' },
  { tabLabel: 'avarage_monthly_income', x: '334', y: '318' },
  /** Merchant business legal name (not owner / client person name). */
  { tabLabel: 'disclosure_merchant_name', x: '383', y: '304' },
  { tabLabel: 'funder_name', x: '433', y: '376' },
  { tabLabel: 'finance_charge', x: '183', y: '409' },
  { tabLabel: 'payment_total', x: '183', y: '430' },
  { tabLabel: 'estimated_monthly_cost', x: '184', y: '464' },
  { tabLabel: 'funder_name', x: '349', y: '478' },
  { tabLabel: 'estimated_payment', x: '183', y: '526' },
  { tabLabel: 'funder_name', x: '240', y: '543' },
  { tabLabel: 'payement_exceeded_percent', x: '423', y: '608' },
  { tabLabel: 'client_name', x: '180', y: '623' },
  { tabLabel: 'monthly_income', x: '361', y: '636' },
  { tabLabel: 'payement_exceeded_percent', x: '405', y: '666' },
  { tabLabel: 'estimated_term', x: '198', y: '71', pageNumber: '2' },
  { tabLabel: 'disclosure_merchant_name', x: '361', y: '85', pageNumber: '2' },
  { tabLabel: 'avarage_monthly_income', x: '454', y: '112', pageNumber: '2' },
  { tabLabel: 'finance_charge', x: '355', y: '159', pageNumber: '2' },
  { tabLabel: 'disclosure_recipient_funds', x: '434', y: '91', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '434',
    y: '110',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '434',
    y: '145',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'disclosure_page3_subtotal', x: '434', y: '166', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '434', y: '187', pageNumber: '3' },
  { tabLabel: 'disclosure_page3_net', x: '434', y: '206', pageNumber: '3' },
];

/** New York disclosure — California base layout with NY-specific tab positions (daily + weekly). */
const NEW_YORK_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '93', y: '483', pageNumber: '2' },
    { x: '429', y: '483', pageNumber: '2', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '87', y: '560', pageNumber: '2', tabLabel: 'signature_date' },
    {
      x: '426',
      y: '559',
      pageNumber: '2',
      tabLabel: 'signature_date',
      signerParty: 'secondary',
    },
  ],
};

const NEW_YORK_DISCLOSURE_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'funding_provided', x: '183', y: '101' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '345', y: '143' },
  { tabLabel: 'funder_name', x: '415', y: '101' },
  { tabLabel: 'estimated_annual_percentage_rate', x: '178', y: '278' },
  { tabLabel: 'avarage_monthly_income', x: '331', y: '362' },
  { tabLabel: 'disclosure_merchant_name', x: '420', y: '347' },
  { tabLabel: 'funder_name', x: '432', y: '421' },
  { tabLabel: 'finance_charge', x: '183', y: '468' },
  { tabLabel: 'payment_total', x: '183', y: '488' },
  {
    tabLabel: 'disclosure_page1_line_1',
    x: '439',
    y: '213',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'estimated_payment', x: '182', y: '522' },
  { tabLabel: 'funder_name', x: '173', y: '539' },
  { tabLabel: 'payement_exceeded_percent', x: '423', y: '604' },
  { tabLabel: 'client_name', x: '182', y: '619' },
  { tabLabel: 'monthly_income', x: '364', y: '631' },
  { tabLabel: 'payement_exceeded_percent', x: '402', y: '662' },
  { tabLabel: 'estimated_term', x: '198', y: '70', pageNumber: '2' },
  { tabLabel: 'disclosure_merchant_name', x: '361', y: '85', pageNumber: '2' },
  { tabLabel: 'avarage_monthly_income', x: '454', y: '112', pageNumber: '2' },
  { tabLabel: 'finance_charge', x: '363', y: '159', pageNumber: '2' },
  { tabLabel: 'estimated_monthly_cost', x: '183', y: '375', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '346', y: '391', pageNumber: '2' },
  { tabLabel: 'disclosure_recipient_funds', x: '446', y: '90', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '446',
    y: '111',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '446',
    y: '145',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'disclosure_page3_subtotal', x: '443', y: '164', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '448', y: '185', pageNumber: '3' },
  { tabLabel: 'disclosure_page3_net', x: '444', y: '206', pageNumber: '3' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const NEW_YORK_WEEKLY_DISCLOSURE_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'funding_provided', x: '183', y: '101' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '345', y: '143' },
  { tabLabel: 'funder_name', x: '415', y: '101' },
  { tabLabel: 'estimated_annual_percentage_rate', x: '178', y: '278' },
  { tabLabel: 'avarage_monthly_income', x: '331', y: '362' },
  { tabLabel: 'disclosure_merchant_name', x: '420', y: '349' },
  { tabLabel: 'funder_name', x: '432', y: '421' },
  { tabLabel: 'finance_charge', x: '183', y: '468' },
  { tabLabel: 'payment_total', x: '183', y: '488' },
  { tabLabel: 'estimated_payment', x: '182', y: '522' },
  { tabLabel: 'funder_name', x: '173', y: '539' },
  { tabLabel: 'payement_exceeded_percent', x: '420', y: '602' },
  { tabLabel: 'client_name', x: '178', y: '617' },
  { tabLabel: 'monthly_income', x: '356', y: '634' },
  { tabLabel: 'payement_exceeded_percent', x: '402', y: '664' },
  { tabLabel: 'estimated_term', x: '198', y: '70', pageNumber: '2' },
  { tabLabel: 'disclosure_merchant_name', x: '361', y: '85', pageNumber: '2' },
  { tabLabel: 'avarage_monthly_income', x: '454', y: '112', pageNumber: '2' },
  { tabLabel: 'finance_charge', x: '363', y: '160', pageNumber: '2' },
  { tabLabel: 'estimated_monthly_cost', x: '183', y: '375', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '346', y: '391', pageNumber: '2' },
  { tabLabel: 'disclosure_recipient_funds', x: '446', y: '90', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '446',
    y: '111',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '446',
    y: '145',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'disclosure_page3_subtotal', x: '443', y: '166', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '448', y: '186', pageNumber: '3' },
  { tabLabel: 'disclosure_page3_net', x: '444', y: '206', pageNumber: '3' },
];

/** Louisiana disclosure (La. R.S. 3138.4) — daily + weekly share page 1 amounts and page 2 signatures. */
const LOUISIANA_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '247', y: '101' },
  { tabLabel: 'client_name', x: '249', y: '152' },
  { tabLabel: 'funder_name', x: '207', y: '190' },
  { tabLabel: 'total_amount_business_fund', x: '427', y: '101' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '151' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '427', y: '188' },
  { tabLabel: 'total_dollar_cost', x: '427', y: '240' },
  { tabLabel: 'estimated_payment_amount', x: '438', y: '314' },
  { tabLabel: 'funder_name', x: '239', y: '352' },
  { tabLabel: 'total_dollar_cost', x: '446', y: '436' },
  { tabLabel: 'client_name', x: '276', y: '469' },
  { tabLabel: 'total_dollar_cost', x: '475', y: '535' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const LOUISIANA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '247', y: '101' },
  { tabLabel: 'client_name', x: '249', y: '152' },
  { tabLabel: 'funder_name', x: '207', y: '190' },
  { tabLabel: 'total_amount_business_fund', x: '427', y: '101' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '151' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '427', y: '188' },
  { tabLabel: 'total_dollar_cost', x: '427', y: '240' },
  { tabLabel: 'estimated_payment_amount', x: '438', y: '314' },
  { tabLabel: 'funder_name', x: '239', y: '352' },
  { tabLabel: 'total_dollar_cost', x: '446', y: '436' },
  { tabLabel: 'client_name', x: '276', y: '469' },
  { tabLabel: 'total_dollar_cost', x: '475', y: '535' },
];

const LOUISIANA_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '93', y: '94', pageNumber: '2' },
    { x: '431', y: '94', pageNumber: '2', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '87', y: '172', pageNumber: '2', tabLabel: 'Signature_date' },
    { x: '427', y: '171', pageNumber: '2', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

/** Texas disclosure — 3-page PDF (page 2 = fees/payoff; page 3 = broker/payoff lines + signatures). */
const TEXAS_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'total_amount_business_fund', x: '428', y: '100' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '428', y: '138' },
  { tabLabel: 'total_dollar_cost', x: '428', y: '175' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '428', y: '212' },
  { tabLabel: 'estimated_term', x: '452', y: '251' },
  /** Method cell: funder name before "provides revenue-based" (gap 239-392). */
  { tabLabel: 'funder_name', x: '242', y: '301', fontSize: '9' },
  { tabLabel: 'estimated_payment_amount', x: '403', y: '370' },
  { tabLabel: 'estimated_monthly_cost', x: '428', y: '404' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const TEXAS_WEEKLY_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'total_amount_business_fund', x: '428', y: '100' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '428', y: '138' },
  { tabLabel: 'total_dollar_cost', x: '428', y: '175' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '428', y: '212' },
  { tabLabel: 'estimated_term', x: '452', y: '251' },
  { tabLabel: 'funder_name', x: '242', y: '301', fontSize: '9' },
  { tabLabel: 'estimated_payment_amount', x: '403', y: '370' },
  { tabLabel: 'estimated_monthly_cost', x: '428', y: '404' },
];

const TEXAS_DISCLOSURE_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'deal_id_prefix', x: '514', y: '70', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '354', y: '139', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '335', y: '277', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '444', y: '291', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '455', y: '319', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '393', y: '346', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '481', y: '360', pageNumber: '2' },
  /** "The finance charge [merchant] will be required to pay" rows - merchant name. */
  { tabLabel: 'client_name', x: '155', y: '408', pageNumber: '2' },
  { tabLabel: 'client_name', x: '138', y: '498', pageNumber: '2' },
  { tabLabel: 'total_dollar_cost', x: '494', y: '463', pageNumber: '2' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const TEXAS_WEEKLY_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'deal_id_prefix', x: '514', y: '70', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '354', y: '139', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '335', y: '277', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '444', y: '291', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '455', y: '319', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '393', y: '346', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '481', y: '360', pageNumber: '2' },
  { tabLabel: 'client_name', x: '155', y: '408', pageNumber: '2' },
  { tabLabel: 'client_name', x: '139', y: '498', pageNumber: '2' },
  { tabLabel: 'total_dollar_cost', x: '494', y: '463', pageNumber: '2' },
];

const TEXAS_DISCLOSURE_PAGE3_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'deal_id_prefix', x: '507', y: '197', pageNumber: '3' },
  { tabLabel: 'funder_name', x: '368', y: '259', fontSize: '9', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '512', y: '259', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '322',
    y: '310',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '265',
    y: '338',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_net',
    x: '434',
    y: '352',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'total_dollar_cost', x: '477', y: '400', pageNumber: '3' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const TEXAS_WEEKLY_PAGE3_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'deal_id_prefix', x: '507', y: '181', pageNumber: '3' },
  { tabLabel: 'funder_name', x: '368', y: '259', fontSize: '9', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '509', y: '259', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '322',
    y: '310',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '288',
    y: '338',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_net',
    x: '489',
    y: '352',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'total_dollar_cost', x: '477', y: '400', pageNumber: '3' },
];

const TEXAS_WEEKLY_DISCLOSURE_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  ...TEXAS_WEEKLY_PAGE1_TEXT_TABS,
  ...TEXAS_WEEKLY_PAGE2_TEXT_TABS,
  ...TEXAS_WEEKLY_PAGE3_TEXT_TABS,
];

const TEXAS_DISCLOSURE_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  ...TEXAS_DISCLOSURE_PAGE1_TEXT_TABS,
  ...TEXAS_DISCLOSURE_PAGE2_TEXT_TABS,
  ...TEXAS_DISCLOSURE_PAGE3_TEXT_TABS,
];

const TEXAS_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '90', y: '521', pageNumber: '3' },
    { x: '400', y: '521', pageNumber: '3', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '90', y: '594', pageNumber: '3', tabLabel: 'Signature_date' },
    { x: '400', y: '594', pageNumber: '3', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

export const STATE_DOCUMENT_CONFIG: Record<string, StateDocumentFieldConfig> = {
  weeklyCalifornia: {
    documentId: '1',
    pageNumber: '1',
    ...CALIFORNIA_DISCLOSURE_SIGN_AND_DATE,
    textTabs: CALIFORNIA_WEEKLY_DISCLOSURE_TEXT_TABS,
  },

  dailyCalifornia: {
    documentId: '1',
    pageNumber: '1',
    ...CALIFORNIA_DISCLOSURE_SIGN_AND_DATE,
    textTabs: CALIFORNIA_DAILY_DISCLOSURE_TEXT_TABS,
  },

  weeklyFlorida: {
    documentId: '1',
    pageNumber: '1',
    signHere: [
      { x: '101', y: '576' },
      { x: '426', y: '577', signerParty: 'secondary' },
    ],
    dateTabs: [
      { x: '96', y: '652', tabLabel: 'Signature_date' },
      { x: '420', y: '650', tabLabel: 'Signature_date', signerParty: 'secondary' },
    ],
    textTabs: FLORIDA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  dailyFlorida: {
    documentId: '1',
    pageNumber: '1',
    signHere: [
      { x: '89', y: '548' },
      { x: '425', y: '549', signerParty: 'secondary' },
    ],
    dateTabs: [
      { x: '78', y: '623', tabLabel: 'Signature_date' },
      { x: '420', y: '622', tabLabel: 'Signature_date', signerParty: 'secondary' },
    ],
    textTabs: FLORIDA_DAILY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  weeklyMissouri: {
    documentId: '1',
    pageNumber: '1',
    ...MISSOURI_DISCLOSURE_SIGN_AND_DATE,
    textTabs: MISSOURI_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  dailyMissouri: {
    documentId: '1',
    pageNumber: '1',
    ...MISSOURI_DISCLOSURE_SIGN_AND_DATE,
    textTabs: MISSOURI_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  weeklyGeorgia: {
    documentId: '1',
    pageNumber: '1',
    ...GEORGIA_WEEKLY_DISCLOSURE_SIGN_AND_DATE,
    textTabs: GEORGIA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  dailyGeorgia: {
    documentId: '1',
    pageNumber: '1',
    ...GEORGIA_DAILY_DISCLOSURE_SIGN_AND_DATE,
    textTabs: GEORGIA_DAILY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  weeklyKansas: {
    documentId: '1',
    pageNumber: '1',
    ...KANSAS_WEEKLY_DISCLOSURE_SIGN_AND_DATE,
    textTabs: KANSAS_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  dailyKansas: {
    documentId: '1',
    pageNumber: '1',
    ...KANSAS_DAILY_DISCLOSURE_SIGN_AND_DATE,
    textTabs: KANSAS_DAILY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  /** Utah disclosure page-1 coordinates (aligned to Utah Code 7-27-202 table). */
  dailyUtah: {
    documentId: '1',
    pageNumber: '1',
    ...UTAH_DISCLOSURE_PAGE2_SIGN_AND_DATE,
    textTabs: UTAH_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  weeklyUtah: {
    documentId: '1',
    pageNumber: '1',
    ...UTAH_DISCLOSURE_PAGE2_SIGN_AND_DATE,
    textTabs: UTAH_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  weeklyVirginia: {
    documentId: '1',
    pageNumber: '1',
    ...VIRGINIA_DISCLOSURE_SIGN_AND_DATE,
    textTabs: [
      ...VIRGINIA_WEEKLY_PAGE1_TEXT_TABS,
      ...VIRGINIA_WEEKLY_PAGE2_TEXT_TABS,
    ],
  },

  dailyVirginia: {
    documentId: '1',
    pageNumber: '1',
    ...VIRGINIA_DISCLOSURE_SIGN_AND_DATE,
    textTabs: [
      ...VIRGINIA_DISCLOSURE_PAGE1_TEXT_TABS,
      ...VIRGINIA_DAILY_PAGE2_TEXT_TABS,
    ],
  },

  weeklyConnecticut: {
    documentId: '1',
    pageNumber: '1',
    ...CONNECTICUT_WEEKLY_SIGN_INITIAL_AND_DATES,
    textTabs: [
      ...CONNECTICUT_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS,
      ...CONNECTICUT_WEEKLY_PAGE2_TEXT_TABS,
    ],
  },

  dailyConnecticut: {
    documentId: '1',
    pageNumber: '1',
    ...CONNECTICUT_DISCLOSURE_SIGN_INITIAL_AND_DATES,
    textTabs: [
      ...CONNECTICUT_DAILY_DISCLOSURE_PAGE1_TEXT_TABS,
      ...CONNECTICUT_PAGE2_TEXT_TABS,
    ],
  },

  weeklyNewYork: {
    documentId: '1',
    pageNumber: '1',
    ...NEW_YORK_DISCLOSURE_SIGN_AND_DATE,
    textTabs: NEW_YORK_WEEKLY_DISCLOSURE_TEXT_TABS,
  },

  dailyNewYork: {
    documentId: '1',
    pageNumber: '1',
    ...NEW_YORK_DISCLOSURE_SIGN_AND_DATE,
    textTabs: NEW_YORK_DISCLOSURE_TEXT_TABS,
  },

  /** Louisiana (La. R.S. 3138.4) — daily + weekly. */
  weeklyLouisiana: {
    documentId: '1',
    pageNumber: '1',
    ...LOUISIANA_DISCLOSURE_SIGN_AND_DATE,
    textTabs: LOUISIANA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  dailyLouisiana: {
    documentId: '1',
    pageNumber: '1',
    ...LOUISIANA_DISCLOSURE_SIGN_AND_DATE,
    textTabs: LOUISIANA_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  weeklyTexas: {
    documentId: '1',
    pageNumber: '1',
    ...TEXAS_DISCLOSURE_SIGN_AND_DATE,
    textTabs: TEXAS_WEEKLY_DISCLOSURE_TEXT_TABS,
  },

  dailyTexas: {
    documentId: '1',
    pageNumber: '1',
    ...TEXAS_DISCLOSURE_SIGN_AND_DATE,
    textTabs: TEXAS_DISCLOSURE_TEXT_TABS,
  },
};

const STATE_NAME_ALIASES: Record<string, string> = {
  ca: 'california',
  california: 'california',
  fl: 'florida',
  florida: 'florida',
  mo: 'missouri',
  missouri: 'missouri',
  ga: 'georgia',
  georgia: 'georgia',
  ks: 'kansas',
  kansas: 'kansas',
  ut: 'utah',
  utah: 'utah',
  va: 'virginia',
  virginia: 'virginia',
  ct: 'connecticut',
  connecticut: 'connecticut',
  ny: 'newyork',
  newyork: 'newyork',
  'new york': 'newyork',
  la: 'louisiana',
  louisiana: 'louisiana',
  tx: 'texas',
  texas: 'texas',
};

const STATE_DISPLAY_NAME: Record<string, string> = {
  california: 'California',
  florida: 'Florida',
  missouri: 'Missouri',
  georgia: 'Georgia',
  kansas: 'Kansas',
  utah: 'Utah',
  virginia: 'Virginia',
  connecticut: 'Connecticut',
  newyork: 'NewYork',
  louisiana: 'Louisiana',
  texas: 'Texas',
};

function capitalize(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Resolve config key from CRM `frequency` + `state` (e.g. daily + florida → dailyFlorida). */
export function resolveStateDocumentConfigKey(
  frequency: string | null | undefined,
  state: string | null | undefined,
): string | null {
  const freqRaw = String(frequency ?? '')
    .trim()
    .toLowerCase();
  const stateRaw = String(state ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
  if (!freqRaw || !stateRaw) return null;

  const stateKey = STATE_NAME_ALIASES[stateRaw] || stateRaw.replace(/\s+/g, '');
  const freqKey = freqRaw.startsWith('week') ? 'weekly' : freqRaw.startsWith('day') ? 'daily' : freqRaw;
  const stateName = STATE_DISPLAY_NAME[stateKey] || capitalize(stateKey);
  const key = `${freqKey}${stateName}`;
  return STATE_DOCUMENT_CONFIG[key] ? key : null;
}

export function getStateDocumentConfig(
  frequency: string | null | undefined,
  state: string | null | undefined,
): StateDocumentFieldConfig | null {
  const key = resolveStateDocumentConfigKey(frequency, state);
  return key ? STATE_DOCUMENT_CONFIG[key] : null;
}
