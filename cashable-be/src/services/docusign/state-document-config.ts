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
  { tabLabel: 'client_name', x: '246', y: '99', width: '170', height: '15' },
  { tabLabel: 'client_name', x: '248', y: '150', width: '168', height: '15' },
  { tabLabel: 'total_amount_business_fund', x: '427', y: '99', height: '15' },
  { tabLabel: 'funder_name', x: '207', y: '187', width: '153', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '154' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '429', y: '187', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '427', y: '239', height: '15' },
  { tabLabel: 'estimated_payment_amount', x: '430', y: '276', width: '49', height: '15' },
  { tabLabel: 'percent_of_business_income', x: '417', y: '328', width: '32', height: '15' },
  { tabLabel: 'client_name', x: '473', y: '328', width: '71', height: '15' },
  { tabLabel: 'client_name', x: '419', y: '356' },
  { tabLabel: 'total_dollar_cost', x: '477', y: '434', height: '15' },
];

/** Florida disclosure page-1 coordinates — weekly layout. */
const FLORIDA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '246', y: '99', width: '170', height: '15' },
  { tabLabel: 'client_name', x: '248', y: '150', width: '168', height: '15' },
  { tabLabel: 'total_amount_business_fund', x: '427', y: '99', height: '15' },
  { tabLabel: 'funder_name', x: '208', y: '188', width: '140', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '150', height: '15' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '427', y: '188', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '427', y: '239', height: '15' },
  { tabLabel: 'estimated_payment_amount', x: '427', y: '276', width: '37', height: '15' },
  { tabLabel: 'percent_of_business_income', x: '417', y: '328', width: '32', height: '15' },
  { tabLabel: 'client_name', x: '465', y: '327', width: '74', height: '15' },
  { tabLabel: 'client_name', x: '419', y: '360' },
  { tabLabel: 'total_dollar_cost', x: '475', y: '461', height: '15' },
];

/** Missouri disclosure page-1 coordinates. */
const MISSOURI_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '246', y: '99', width: '170', height: '15' },
  { tabLabel: 'client_name', x: '248', y: '150', width: '168', height: '15' },
  { tabLabel: 'total_amount_business_fund', x: '436', y: '107' },
  { tabLabel: 'funder_name', x: '207', y: '187', width: '153', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '436', y: '156' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '436', y: '188', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '436', y: '239', height: '15' },
  { tabLabel: 'estimated_payment_amount', x: '434', y: '290', width: '45', height: '15' },
  { tabLabel: 'percent_of_business_income', x: '416', y: '355', width: '27', height: '15' },
  { tabLabel: 'client_name', x: '471', y: '355', height: '15' },
  { tabLabel: 'client_name', x: '420', y: '394' },
  { tabLabel: 'total_dollar_cost', x: '479', y: '488', width: '52', height: '15' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const MISSOURI_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '246', y: '99', width: '170', height: '15' },
  { tabLabel: 'client_name', x: '248', y: '150', width: '168', height: '15' },
  { tabLabel: 'total_amount_business_fund', x: '427', y: '99', height: '15' },
  { tabLabel: 'funder_name', x: '208', y: '188', width: '140', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '150', height: '15' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '436', y: '188', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '436', y: '239', height: '15' },
  { tabLabel: 'estimated_payment_amount', x: '427', y: '290', width: '43', height: '15' },
  { tabLabel: 'percent_of_business_income', x: '416', y: '355', width: '27', height: '15' },
  { tabLabel: 'client_name', x: '459', y: '355', width: '83', height: '15' },
  { tabLabel: 'client_name', x: '420', y: '400' },
  { tabLabel: 'total_dollar_cost', x: '475', y: '489', width: '44', height: '15' },
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
  { tabLabel: 'client_name', x: '246', y: '99', width: '170', height: '15' },
  { tabLabel: 'client_name', x: '248', y: '150', width: '168', height: '15' },
  { tabLabel: 'total_amount_business_fund', x: '436', y: '107' },
  { tabLabel: 'funder_name', x: '207', y: '201', width: '150', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '436', y: '157' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '438', y: '210' },
  { tabLabel: 'total_dollar_cost', x: '438', y: '260' },
  { tabLabel: 'estimated_payment_amount', x: '438', y: '290', width: '41', height: '15' },
  { tabLabel: 'percent_of_business_income', x: '415', y: '341', width: '18', height: '15' },
  { tabLabel: 'client_name', x: '465', y: '341', height: '15' },
  { tabLabel: 'client_name', x: '422', y: '384' },
  { tabLabel: 'total_dollar_cost', x: '476', y: '472' },
];

/** Georgia disclosure page-1 coordinates — weekly layout. */
const GEORGIA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '246', y: '99', width: '170', height: '15' },
  { tabLabel: 'client_name', x: '248', y: '150', width: '168', height: '15' },
  { tabLabel: 'total_amount_business_fund', x: '427', y: '99', height: '15' },
  { tabLabel: 'funder_name', x: '208', y: '188', width: '140', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '150', height: '15' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '438', y: '188', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '427', y: '239', height: '15' },
  { tabLabel: 'estimated_payment_amount', x: '427', y: '276', width: '37', height: '15' },
  { tabLabel: 'percent_of_business_income', x: '419', y: '327', width: '27', height: '15' },
  { tabLabel: 'client_name', x: '462', y: '327', width: '80', height: '15' },
  { tabLabel: 'client_name', x: '419', y: '360' },
  { tabLabel: 'total_dollar_cost', x: '475', y: '461', width: '44', height: '15' },
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
  { tabLabel: 'monthly_income', x: '233', y: '529', width: '46', height: '15' },
  { tabLabel: 'appendix_underwriting_fees', x: '190', y: '464' },
  // Payment-terms % of daily revenue (not cadence). Keep off bare `frequency`
  // so Contract / OfferDecision frequency cannot be polluted with "0.00%".
  { tabLabel: 'payment_terms_percent', x: '183', y: '515', width: '36', height: '15' },
  { tabLabel: 'payment_exceed_percent', x: '404', y: '559', width: '42', height: '15' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const UTAH_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'purchase_amount', x: '182', y: '106', width: '102', height: '15' },
  { tabLabel: 'net_to_merchant', x: '182', y: '141', width: '102', height: '15' },
  { tabLabel: 'purchase_price', x: '182', y: '175', width: '102', height: '15' },
  { tabLabel: 'finance_charge', x: '182', y: '209', width: '102', height: '15' },
  { tabLabel: 'remittance', x: '182', y: '340', width: '102', height: '15' },
  { tabLabel: 'monthly_income', x: '233', y: '529', width: '46', height: '15' },
  { tabLabel: 'appendix_underwriting_fees', x: '190', y: '467', width: '94', height: '15' },
  // Payment-terms % of daily revenue (not cadence). Keep off bare `frequency`
  // so Contract / OfferDecision frequency cannot be polluted with "0.00%".
  { tabLabel: 'payment_terms_percent', x: '183', y: '515', width: '36', height: '15' },
  { tabLabel: 'payment_exceed_percent', x: '404', y: '560', width: '40', height: '15' },
];

/** Kansas disclosure page-1 coordinates — daily layout. */
const KANSAS_DAILY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '246', y: '99', width: '170', height: '15' },
  { tabLabel: 'client_name', x: '248', y: '150', width: '168', height: '15' },
  { tabLabel: 'funder_name', x: '162', y: '201', height: '15' },
  { tabLabel: 'total_amount_of_fund_provided', x: '438', y: '107' },
  { tabLabel: 'total_amount_fund_disbursed', x: '438', y: '158' },
  { tabLabel: 'total_of_payments', x: '439', y: '208' },
  { tabLabel: 'total_dollar_cost_of_frinancing', x: '439', y: '245' },
  { tabLabel: 'estimated_payment', x: '439', y: '280' },
  { tabLabel: 'total_dollar_cost_of_frinancing', x: '483', y: '332' },
];

/** Kansas disclosure page-1 coordinates — weekly layout. */
const KANSAS_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '246', y: '99', width: '170', height: '15' },
  { tabLabel: 'client_name', x: '248', y: '153', height: '15' },
  { tabLabel: 'funder_name', x: '162', y: '193' },
  { tabLabel: 'total_amount_of_fund_provided', x: '427', y: '99', height: '15' },
  { tabLabel: 'total_amount_fund_disbursed', x: '427', y: '137', height: '15' },
  { tabLabel: 'total_of_payments', x: '427', y: '174', height: '15' },
  { tabLabel: 'total_dollar_cost_of_frinancing', x: '427', y: '211', height: '15' },
  { tabLabel: 'estimated_payment', x: '427', y: '249', width: '40', height: '15' },
  { tabLabel: 'total_dollar_cost_of_frinancing', x: '475', y: '300', width: '44', height: '15' },
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
  { tabLabel: 'disclosure_name', x: '450', y: '68', height: '15' },
  { tabLabel: 'recipient_address', x: '365', y: '108' },
  { tabLabel: 'funder_name', x: '446', y: '132', height: '15' },
  { tabLabel: 'funder_address', x: '346', y: '166' },
  { tabLabel: 'funder_phone', x: '466', y: '198' },
  { tabLabel: 'funder_email', x: '344', y: '232' },
  { tabLabel: 'total_amount_sales_based_financing', x: '267', y: '43', width: '94', height: '15' },
  { tabLabel: 'fees_deducted', x: '267', y: '88', width: '92', height: '15' },
  { tabLabel: 'disbursement_amount', x: '267', y: '124', width: '92', height: '15' },
  { tabLabel: 'finance_charge', x: '267', y: '165', width: '74', height: '15' },
  { tabLabel: 'total_repayment_amount', x: '267', y: '187', width: '92', height: '15' },
  { tabLabel: 'estimated_number_of_payement', x: '264', y: '224' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const VIRGINIA_WEEKLY_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'disclosure_name', x: '450', y: '68', height: '15' },
  { tabLabel: 'recipient_address', x: '365', y: '108' },
  { tabLabel: 'funder_name', x: '446', y: '132', height: '15' },
  { tabLabel: 'funder_address', x: '346', y: '166' },
  { tabLabel: 'funder_phone', x: '466', y: '198' },
  { tabLabel: 'funder_email', x: '344', y: '232' },
  { tabLabel: 'total_amount_sales_based_financing', x: '267', y: '43', width: '94', height: '15' },
  { tabLabel: 'fees_deducted', x: '267', y: '88', width: '92', height: '15' },
  { tabLabel: 'disbursement_amount', x: '267', y: '124', width: '92', height: '15' },
  { tabLabel: 'finance_charge', x: '267', y: '165', width: '74', height: '15' },
  { tabLabel: 'total_repayment_amount', x: '267', y: '187', width: '92', height: '15' },
  { tabLabel: 'estimated_number_of_payement', x: '264', y: '217', width: '100', height: '15' },
  /** Methodology paragraph: funder name before "provides revenue-based". */
  { tabLabel: 'funder_name', x: '95', y: '371', width: '94', height: '15' },
  /** "payment of $ __ Weekly" - narrow template gap, smaller font. */
  { tabLabel: 'remittance', x: '247', y: '411', width: '18', height: '15', fontSize: '8' },
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
  { tabLabel: 'recipient_name2', x: '152', y: '42', width: '183', height: '15', pageNumber: '2' },
  { tabLabel: 'recipient_address1', x: '151', y: '71', width: '184', height: '15', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '420', y: '71', height: '15', pageNumber: '2' },
  { tabLabel: 'disclosure_date2', x: '415', y: '42', height: '15', pageNumber: '2' },
];

const VIRGINIA_PAGE2_FEES_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'deal_id_prefix', x: '337', y: '266', width: '21', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '226', y: '314', width: '18', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '477', y: '411', width: '18', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '394', y: '427', width: '24', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '76', y: '459', width: '18', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '109', y: '475', width: '18', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '509', y: '475', width: '27', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '448', y: '635', width: '23', height: '15', pageNumber: '2' },
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
  { tabLabel: 'recipient_name', x: '450', y: '63', height: '15' },
  { tabLabel: 'recipient_address', x: '345', y: '112' },
  { tabLabel: 'funder_name', x: '426', y: '126', height: '15' },
  { tabLabel: 'funder_address', x: '346', y: '167' },
  { tabLabel: 'funder_phone', x: '468', y: '191', height: '15' },
  { tabLabel: 'funder_email', x: '344', y: '229' },
  { tabLabel: 'total_amount_commercial_financing', x: '267', y: '40', width: '74', height: '15' },
  { tabLabel: 'deducted_at_disbursement', x: '267', y: '75', width: '74', height: '15' },
  { tabLabel: 'total_commerical_financing', x: '267', y: '111', height: '15' },
  { tabLabel: 'finance_charge', x: '267', y: '165', width: '74', height: '15' },
  { tabLabel: 'total_repayment_amount', x: '267', y: '195', width: '74', height: '15' },
  { tabLabel: 'estimated_time_periodic_paymement', x: '264', y: '240', height: '15' },
  { tabLabel: 'disclosure_broker_fee', x: '392', y: '663', height: '15' },
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
  { tabLabel: 'deducted_at_disbursement', x: '267', y: '75', width: '74', height: '15' },
  { tabLabel: 'total_commerical_financing', x: '267', y: '111', height: '15' },
  { tabLabel: 'finance_charge', x: '267', y: '165', width: '74', height: '15' },
  { tabLabel: 'total_repayment_amount', x: '267', y: '195', height: '15' },
  { tabLabel: 'estimated_time_periodic_paymement', x: '264', y: '240', height: '15' },
  { tabLabel: 'disclosure_broker_fee', x: '392', y: '663', height: '15' },
];

const CONNECTICUT_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'recipient_name2', x: '144', y: '38', width: '196', height: '15', pageNumber: '2' },
  { tabLabel: 'recipient_address2_line1', x: '154', y: '57', width: '186', height: '15', fontSize: '8', pageNumber: '2' },
  { tabLabel: 'recipient_address2_line2', x: '155', y: '67', fontSize: '8', pageNumber: '2' },
  { tabLabel: 'disclosure_date2', x: '428', y: '38', height: '15', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '430', y: '57', height: '15', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '68', y: '176', width: '91', height: '15', fontSize: '9', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '282', y: '244', width: '18', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '410', y: '275', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '502', y: '338', width: '19', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '330', y: '352', width: '18', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '339', y: '365', width: '24', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '270', y: '379', width: '24', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '99', y: '392', width: '26', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '274', y: '493', pageNumber: '2' },
  {
    tabLabel: 'connecticut_review_field_1',
    x: '281',
    y: '524',
    height: '15',    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_2',
    x: '281',
    y: '555',
    height: '15',    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_3',
    x: '280',
    y: '599',
    height: '15',    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_4',
    x: '275',
    y: '629',
    height: '15',    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
];

/** Weekly variant - aligned to the weekly template PDF. */
const CONNECTICUT_WEEKLY_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'recipient_name2', x: '144', y: '38', width: '196', height: '15', pageNumber: '2' },
  { tabLabel: 'recipient_address2_line1', x: '154', y: '57', width: '186', height: '15', fontSize: '8', pageNumber: '2' },
  { tabLabel: 'recipient_address2_line2', x: '155', y: '67', fontSize: '8', pageNumber: '2' },
  { tabLabel: 'disclosure_date2', x: '428', y: '38', height: '15', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '430', y: '57', height: '15', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '90', y: '176', width: '119', height: '15', pageNumber: '2' },
  { tabLabel: 'remittance', x: '173', y: '211', width: '55', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '293', y: '241', width: '18', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '410', y: '268', width: '22', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '502', y: '335', width: '18', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '330', y: '349', width: '19', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '350', y: '362', width: '34', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '334', y: '375', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '131', y: '388', width: '26', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '273', y: '488', pageNumber: '2' },
  {
    tabLabel: 'connecticut_review_field_1',
    x: '281',
    y: '524',
    height: '15',    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_2',
    x: '281',
    y: '555',
    height: '15',    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_3',
    x: '281',
    y: '599',
    height: '15',    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_4',
    x: '275',
    y: '629',
    height: '15',    pageNumber: '2',
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
  { tabLabel: 'funding_provided', x: '182', y: '99', width: '102', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '345', y: '141', width: '46', height: '15' },
  { tabLabel: 'estimated_annual_percentage_rate', x: '178', y: '233', width: '106', height: '15' },
  { tabLabel: 'avarage_monthly_income', x: '330', y: '316', width: '56', height: '15' },
  /** Merchant business legal name (not owner / client person name). */
  { tabLabel: 'disclosure_merchant_name', x: '381', y: '302', width: '96', height: '15' },
  { tabLabel: 'funder_name', x: '433', y: '374', height: '15' },
  { tabLabel: 'finance_charge', x: '182', y: '422', width: '102', height: '15' },
  { tabLabel: 'payment_total', x: '182', y: '443', width: '102', height: '15' },
  { tabLabel: 'estimated_monthly_cost', x: '182', y: '477', width: '102', height: '15' },
  { tabLabel: 'funder_name', x: '348', y: '491', width: '135', height: '15' },
  { tabLabel: 'estimated_payment', x: '182', y: '539', width: '40', height: '15' },
  { tabLabel: 'funder_name', x: '174', y: '556', width: '126', height: '15' },
  { tabLabel: 'payement_exceeded_percent', x: '423', y: '621', width: '60', height: '15' },
  { tabLabel: 'client_name', x: '180', y: '635', width: '172', height: '15' },
  { tabLabel: 'monthly_income', x: '357', y: '648', width: '56', height: '15' },
  { tabLabel: 'payement_exceeded_percent', x: '404', y: '679', width: '48', height: '15' },
  { tabLabel: 'estimated_term', x: '198', y: '69', width: '18', height: '15', pageNumber: '2' },
  { tabLabel: 'disclosure_merchant_name', x: '363', y: '83', height: '15', pageNumber: '2' },
  { tabLabel: 'avarage_monthly_income', x: '453', y: '110', width: '61', height: '15', pageNumber: '2' },
  { tabLabel: 'finance_charge', x: '354', y: '158', width: '58', height: '15', pageNumber: '2' },
  { tabLabel: 'disclosure_recipient_funds', x: '446', y: '89', height: '15', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '445',
    y: '111',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '446',
    y: '143',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'disclosure_page3_subtotal', x: '447', y: '166', height: '15', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '447', y: '184', height: '15', pageNumber: '3' },
  { tabLabel: 'disclosure_page3_net', x: '447', y: '207', height: '15', pageNumber: '3' },
];

/** California weekly disclosure — distinct page 1 / page 3 x positions from daily. */
const CALIFORNIA_WEEKLY_DISCLOSURE_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'funding_provided', x: '182', y: '99', width: '102', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '345', y: '140', width: '59', height: '15' },
  { tabLabel: 'funder_name', x: '416', y: '99', height: '15' },
  { tabLabel: 'estimated_annual_percentage_rate', x: '178', y: '233', width: '106', height: '15' },
  { tabLabel: 'avarage_monthly_income', x: '333', y: '316', width: '62', height: '15' },
  /** Merchant business legal name (not owner / client person name). */
  { tabLabel: 'disclosure_merchant_name', x: '381', y: '302', width: '96', height: '15' },
  { tabLabel: 'funder_name', x: '433', y: '374', height: '15' },
  { tabLabel: 'finance_charge', x: '182', y: '408', width: '102', height: '15' },
  { tabLabel: 'payment_total', x: '182', y: '429', width: '102', height: '15' },
  { tabLabel: 'estimated_monthly_cost', x: '182', y: '463', width: '102', height: '15' },
  { tabLabel: 'funder_name', x: '348', y: '477', height: '15' },
  { tabLabel: 'estimated_payment', x: '182', y: '525', width: '64', height: '15' },
  { tabLabel: 'funder_name', x: '240', y: '542', width: '102', height: '15' },
  { tabLabel: 'payement_exceeded_percent', x: '423', y: '607', width: '72', height: '15' },
  { tabLabel: 'client_name', x: '180', y: '621', width: '198', height: '15' },
  { tabLabel: 'monthly_income', x: '360', y: '634', width: '47', height: '15' },
  { tabLabel: 'payement_exceeded_percent', x: '404', y: '665', width: '42', height: '15' },
  { tabLabel: 'estimated_term', x: '198', y: '69', width: '18', height: '15', pageNumber: '2' },
  { tabLabel: 'disclosure_merchant_name', x: '363', y: '83', height: '15', pageNumber: '2' },
  { tabLabel: 'avarage_monthly_income', x: '453', y: '110', width: '61', height: '15', pageNumber: '2' },
  { tabLabel: 'finance_charge', x: '353', y: '158', width: '50', height: '15', pageNumber: '2' },
  { tabLabel: 'disclosure_recipient_funds', x: '432', y: '90', height: '15', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '433',
    y: '109',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '432',
    y: '144',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'disclosure_page3_subtotal', x: '432', y: '165', height: '15', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '433', y: '186', height: '15', pageNumber: '3' },
  { tabLabel: 'disclosure_page3_net', x: '433', y: '205', height: '15', pageNumber: '3' },
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
  { tabLabel: 'funding_provided', x: '182', y: '99', width: '102', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '345', y: '141', width: '46', height: '15' },
  { tabLabel: 'funder_name', x: '416', y: '99', height: '15' },
  { tabLabel: 'estimated_annual_percentage_rate', x: '178', y: '278', width: '106', height: '15' },
  { tabLabel: 'avarage_monthly_income', x: '330', y: '360', width: '62', height: '15' },
  { tabLabel: 'disclosure_merchant_name', x: '419', y: '347', width: '117', height: '15' },
  { tabLabel: 'funder_name', x: '433', y: '419', height: '15' },
  { tabLabel: 'finance_charge', x: '182', y: '467', width: '102', height: '15' },
  { tabLabel: 'payment_total', x: '182', y: '487', width: '102', height: '15' },
  {
    tabLabel: 'disclosure_page1_line_1',
    x: '440',
    y: '213',
    height: '15',    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'estimated_payment', x: '182', y: '522', width: '43', height: '15' },
  { tabLabel: 'funder_name', x: '173', y: '538', width: '142', height: '15' },
  { tabLabel: 'payement_exceeded_percent', x: '423', y: '603', width: '45', height: '15' },
  { tabLabel: 'client_name', x: '180', y: '617', width: '201', height: '15' },
  { tabLabel: 'monthly_income', x: '363', y: '631', width: '53', height: '15' },
  { tabLabel: 'payement_exceeded_percent', x: '404', y: '662', width: '36', height: '15' },
  { tabLabel: 'estimated_term', x: '198', y: '70', width: '22', height: '15', pageNumber: '2' },
  { tabLabel: 'disclosure_merchant_name', x: '363', y: '83', height: '15', pageNumber: '2' },
  { tabLabel: 'avarage_monthly_income', x: '453', y: '110', width: '61', height: '15', pageNumber: '2' },
  { tabLabel: 'finance_charge', x: '362', y: '158', width: '40', height: '15', pageNumber: '2' },
  { tabLabel: 'estimated_monthly_cost', x: '182', y: '375', width: '102', height: '15', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '348', y: '389', height: '15', pageNumber: '2' },
  { tabLabel: 'disclosure_recipient_funds', x: '446', y: '89', height: '15', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '446',
    y: '111',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '446',
    y: '143',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'disclosure_page3_subtotal', x: '438', y: '163', height: '15', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '447', y: '184', height: '15', pageNumber: '3' },
  { tabLabel: 'disclosure_page3_net', x: '444', y: '205', height: '15', pageNumber: '3' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const NEW_YORK_WEEKLY_DISCLOSURE_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'funding_provided', x: '182', y: '99', width: '102', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '345', y: '141', width: '46', height: '15' },
  { tabLabel: 'funder_name', x: '416', y: '99', height: '15' },
  { tabLabel: 'estimated_annual_percentage_rate', x: '178', y: '278', width: '106', height: '15' },
  { tabLabel: 'avarage_monthly_income', x: '330', y: '360', width: '62', height: '15' },
  { tabLabel: 'disclosure_merchant_name', x: '419', y: '347', height: '15' },
  { tabLabel: 'funder_name', x: '433', y: '419', height: '15' },
  { tabLabel: 'finance_charge', x: '182', y: '467', width: '102', height: '15' },
  { tabLabel: 'payment_total', x: '182', y: '487', width: '102', height: '15' },
  { tabLabel: 'estimated_payment', x: '182', y: '522', width: '43', height: '15' },
  { tabLabel: 'funder_name', x: '173', y: '538', width: '142', height: '15' },
  { tabLabel: 'payement_exceeded_percent', x: '420', y: '602', width: '72', height: '15' },
  { tabLabel: 'client_name', x: '177', y: '615', width: '201', height: '15' },
  { tabLabel: 'monthly_income', x: '354', y: '632', width: '51', height: '15' },
  { tabLabel: 'payement_exceeded_percent', x: '401', y: '663', width: '36', height: '15' },
  { tabLabel: 'estimated_term', x: '198', y: '70', width: '22', height: '15', pageNumber: '2' },
  { tabLabel: 'disclosure_merchant_name', x: '363', y: '83', height: '15', pageNumber: '2' },
  { tabLabel: 'avarage_monthly_income', x: '453', y: '110', width: '61', height: '15', pageNumber: '2' },
  { tabLabel: 'finance_charge', x: '362', y: '158', width: '37', height: '15', pageNumber: '2' },
  { tabLabel: 'estimated_monthly_cost', x: '182', y: '375', width: '102', height: '15', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '348', y: '389', height: '15', pageNumber: '2' },
  { tabLabel: 'disclosure_recipient_funds', x: '446', y: '89', height: '15', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '446',
    y: '111',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '446',
    y: '143',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'disclosure_page3_subtotal', x: '443', y: '167', height: '15', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '448', y: '185', height: '15', pageNumber: '3' },
  { tabLabel: 'disclosure_page3_net', x: '444', y: '205', height: '15', pageNumber: '3' },
];

/** Louisiana disclosure (La. R.S. 3138.4) — daily + weekly share page 1 amounts and page 2 signatures. */
const LOUISIANA_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '246', y: '99', width: '170', height: '15' },
  { tabLabel: 'client_name', x: '249', y: '150', width: '167', height: '15' },
  { tabLabel: 'funder_name', x: '208', y: '188', width: '140', height: '15' },
  { tabLabel: 'total_amount_business_fund', x: '427', y: '99', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '150', height: '15' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '427', y: '188', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '427', y: '239', height: '15' },
  { tabLabel: 'estimated_payment_amount', x: '438', y: '314', height: '15' },
  { tabLabel: 'funder_name', x: '239', y: '351', width: '141', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '446', y: '434', width: '27', height: '15' },
  { tabLabel: 'client_name', x: '276', y: '468', width: '162', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '475', y: '533', height: '15' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const LOUISIANA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '246', y: '99', width: '170', height: '15' },
  { tabLabel: 'client_name', x: '249', y: '150', width: '167', height: '15' },
  { tabLabel: 'funder_name', x: '208', y: '188', width: '140', height: '15' },
  { tabLabel: 'total_amount_business_fund', x: '427', y: '99', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '150', height: '15' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '427', y: '188', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '427', y: '239', height: '15' },
  { tabLabel: 'estimated_payment_amount', x: '438', y: '314', height: '15' },
  { tabLabel: 'funder_name', x: '239', y: '351', width: '141', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '446', y: '434', width: '27', height: '15' },
  { tabLabel: 'client_name', x: '276', y: '468', width: '162', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '475', y: '533', height: '15' },
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
  { tabLabel: 'total_amount_business_fund', x: '427', y: '99', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '137', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '427', y: '174', height: '15' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '427', y: '211', height: '15' },
  { tabLabel: 'estimated_term', x: '452', y: '250', width: '25', height: '15' },
  /** Method cell: funder name before "provides revenue-based" (gap 239-392). */
  { tabLabel: 'funder_name', x: '242', y: '300', width: '141', height: '15', fontSize: '9' },
  { tabLabel: 'estimated_payment_amount', x: '402', y: '369', width: '62', height: '15' },
  { tabLabel: 'estimated_monthly_cost', x: '427', y: '403', height: '15' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const TEXAS_WEEKLY_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'total_amount_business_fund', x: '427', y: '99', height: '15' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '137', height: '15' },
  { tabLabel: 'total_dollar_cost', x: '427', y: '174', height: '15' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '427', y: '211', height: '15' },
  { tabLabel: 'estimated_term', x: '452', y: '250', width: '25', height: '15' },
  { tabLabel: 'funder_name', x: '242', y: '300', width: '141', height: '15', fontSize: '9' },
  { tabLabel: 'estimated_payment_amount', x: '402', y: '369', width: '62', height: '15' },
  { tabLabel: 'estimated_monthly_cost', x: '427', y: '403', height: '15' },
];

const TEXAS_DISCLOSURE_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'deal_id_prefix', x: '513', y: '69', width: '24', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '353', y: '138', width: '24', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '334', y: '276', width: '27', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '443', y: '290', width: '30', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '454', y: '317', width: '27', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '392', y: '345', width: '27', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '480', y: '359', width: '30', height: '15', pageNumber: '2' },
  /** "The finance charge [merchant] will be required to pay" rows - merchant name. */
  { tabLabel: 'client_name', x: '154', y: '407', width: '201', height: '15', pageNumber: '2' },
  { tabLabel: 'client_name', x: '137', y: '496', width: '230', height: '15', pageNumber: '2' },
  { tabLabel: 'total_dollar_cost', x: '492', y: '462', height: '15', pageNumber: '2' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const TEXAS_WEEKLY_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'deal_id_prefix', x: '513', y: '69', width: '24', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '353', y: '138', width: '24', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '334', y: '276', width: '27', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '443', y: '290', width: '30', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '454', y: '317', width: '27', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '392', y: '345', width: '27', height: '15', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '480', y: '359', width: '30', height: '15', pageNumber: '2' },
  { tabLabel: 'client_name', x: '154', y: '407', width: '201', height: '15', pageNumber: '2' },
  { tabLabel: 'client_name', x: '138', y: '496', width: '228', height: '15', pageNumber: '2' },
  { tabLabel: 'total_dollar_cost', x: '492', y: '462', height: '15', pageNumber: '2' },
];

const TEXAS_DISCLOSURE_PAGE3_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'deal_id_prefix', x: '506', y: '196', width: '21', height: '15', pageNumber: '3' },
  { tabLabel: 'funder_name', x: '368', y: '258', width: '87', height: '15', fontSize: '9', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '511', y: '258', height: '15', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '320',
    y: '309',
    width: '57',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '265',
    y: '337',
    width: '24',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_net',
    x: '432',
    y: '350',
    width: '41',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'total_dollar_cost', x: '475', y: '399', height: '15', pageNumber: '3' },
];

/** Weekly variant - aligned to the weekly template PDF. */
const TEXAS_WEEKLY_PAGE3_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'deal_id_prefix', x: '506', y: '179', width: '21', height: '15', pageNumber: '3' },
  { tabLabel: 'funder_name', x: '368', y: '258', width: '87', height: '15', fontSize: '9', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '508', y: '258', height: '15', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '320',
    y: '309',
    width: '57',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '287',
    y: '337',
    width: '24',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_net',
    x: '486',
    y: '350',
    width: '40',
    height: '15',    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'total_dollar_cost', x: '475', y: '399', height: '15', pageNumber: '3' },
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
