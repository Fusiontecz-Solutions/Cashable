import { formatCityStateZip } from "./payoffWireInstructionsShared";
import { PAYOFF_WIRE_INSTRUCTIONS_VARIABLES } from "./payoffWireInstructionsShared";
import type { TemplateValues, TemplateVariable } from "./types";
import { escapeHtml } from "./applicationApprovalEmailShared";
import { APP_COMPANY_LEGAL_NAME } from "@/constants/appBranding";
import {
  DEFAULT_LETTER_EMAIL_BRANDING,
  type LetterEmailBranding,
} from "./letterEmailBranding";
import {
  letterDetailsTable,
  letterParagraph,
  letterStrong,
  letterWireInformation,
  renderLetterDocument,
  todayLongDate,
} from "./letterLayout";

/** Bank address shown under the wire bank name. */
const WIRE_BANK_ADDRESS = "2929 E. Commercial Blvd., Ft. Lauderdale, FL, 33308";

const SIGNATURE_TITLE = "Account Specialist";

const v = PAYOFF_WIRE_INSTRUCTIONS_VARIABLES.reduce<
  Record<string, TemplateVariable>
>((acc, variable) => {
  acc[variable.key] = variable;
  return acc;
}, {});

function pickFirstOrNA(
  values: TemplateValues,
  keys: string[],
  variable?: TemplateVariable,
): string {
  for (const key of keys) {
    const raw = values[key];
    if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  }
  if (variable?.defaultValue?.trim()) return variable.defaultValue.trim();
  return "NA";
}

function pickOrNA(values: TemplateValues, variable: TemplateVariable): string {
  return pickFirstOrNA(values, [variable.key], variable);
}

function omitNa(raw: string): string {
  const t = raw.trim();
  if (!t || t.toUpperCase() === "NA") return "";
  return t;
}

/**
 * Gmail/PDF-safe HTML for Payoff Wire Information (shared letterhead layout,
 * funder branding) — same personalization keys as the Payoff letter. Leftover
 * wire tokens alias to those keys.
 */
export function renderPayoffWireInstructionsHtml(
  values: TemplateValues,
  branding: LetterEmailBranding = DEFAULT_LETTER_EMAIL_BRANDING,
): string {
  const letterDateRaw =
    typeof values.letter_date === "string" ? values.letter_date.trim() : "";
  const letterDate = escapeHtml(letterDateRaw || todayLongDate());
  const merchantName = escapeHtml(
    pickFirstOrNA(
      values,
      ["account_name", "merchant_legal_name"],
      v.account_name,
    ),
  );
  const payoffAmount = escapeHtml(pickOrNA(values, v.payoff_amount));
  const validTill = escapeHtml(pickOrNA(values, v.good_through_date));
  const lenderNameRaw = pickFirstOrNA(
    values,
    ["lender_name", "beneficiary_name"],
    v.lender_name,
  );
  const lenderName = escapeHtml(
    lenderNameRaw === "NA" ? APP_COMPANY_LEGAL_NAME : lenderNameRaw,
  );
  const paymentCompany = escapeHtml(
    pickFirstOrNA(
      values,
      ["payment_company_name", "payment_bank_name", "bank_name"],
      v.payment_company_name,
    ),
  );
  const paymentAddress1 = escapeHtml(pickOrNA(values, v.payment_address_line1));
  const paymentAddress2 = escapeHtml(
    omitNa(
      typeof values.payment_address_line2 === "string"
        ? values.payment_address_line2
        : "",
    ),
  );
  const routing = escapeHtml(
    pickFirstOrNA(
      values,
      ["payment_routing_number", "routing_number"],
      v.payment_routing_number,
    ),
  );
  const accountNumber = escapeHtml(
    pickFirstOrNA(
      values,
      ["payment_account_number", "wire_account_number"],
      v.payment_account_number,
    ),
  );
  const senderName = escapeHtml(pickOrNA(values, v.sender_name));
  const accent = escapeHtml(branding.accentStripDark);

  const bodyRows = [
    letterParagraph(
      `Please find below the payoff and wiring instructions for ${letterStrong(merchantName)}. Wires received after the valid through date may require updated instructions.`,
      20,
    ),
    letterDetailsTable(
      [
        { label: "Merchant Name", value: merchantName },
        { label: "Payoff Amount", value: payoffAmount },
        { label: "Beneficiary Name", value: lenderName },
        { label: "Valid Till", value: validTill },
      ],
      accent,
    ),
    letterParagraph(
      "Please remit the payoff amount to the account below. Ensure payments are received by the good through date to avoid additional interest charges.",
      20,
    ),
    letterWireInformation({
      bank: paymentCompany,
      bankAddress: WIRE_BANK_ADDRESS,
      routing,
      beneficiary: lenderName,
      beneficiaryAddress: [paymentAddress1, formatCityStateZip(paymentAddress2)]
        .filter(Boolean)
        .join(", "),
      account: accountNumber,
      accent,
    }),
  ].join("");

  return renderLetterDocument({
    branding,
    documentTitle: "Payoff Wire Information",
    heading: "Payoff Wire Information",
    letterDate,
    bodyRows,
    signerLine: senderName === "NA" ? SIGNATURE_TITLE : senderName,
    signatureTitle: SIGNATURE_TITLE,
  });
}
