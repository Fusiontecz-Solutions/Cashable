import { APP_EMAIL_LOGO_SRC } from "@/constants/appLogo";
import type { TemplateValues } from "./types";
import {
  CLIENT_PROVIDED_STIPS,
  COMPANY_HANDLED_STIPS,
  escapeHtml,
  escapeHrefAttribute,
  resolveApplicationApprovalEmailFields,
} from "./applicationApprovalEmailShared";

const EMAIL_WIDTH = 600;
const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";

/** Server fills this with the approved amount + offer terms (services/approvalOfferTerms). */
const OFFER_TERMS_SLOT = "<!--__APPROVAL_OFFER_TERMS__-->";

/**
 * One "Next steps" card: a numbered badge, the step title and hint, then one row per stip with a
 * tick box. Step 1 is highlighted (filled badge, green border): it is what the ISO sends first.
 */
function stipStepHtml(
  step: number,
  title: string,
  hint: string,
  items: readonly string[],
  primary: boolean,
): string {
  const badge = primary
    ? "background-color:#166534;color:#FFFFFF;border:2px solid #166534;"
    : "background-color:#FFFFFF;color:#166534;border:2px solid #47A86F;";
  const rows = items
    .map(
      (item, i) => `
              <tr>
                <td width="22" valign="top" style="padding:6px 0 6px 10px;${i ? "border-top:1px solid #EEF3F0;" : ""}">
                  <div style="width:12px;height:12px;border:2px solid #47A86F;border-radius:3px;margin-top:2px;font-size:0;line-height:0;">&nbsp;</div>
                </td>
                <td valign="top" style="padding:5px 10px 5px 6px;font-size:12px;line-height:1.45;color:#1F2A24;${i ? "border-top:1px solid #EEF3F0;" : ""}">${escapeHtml(item)}</td>
              </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;border:1px solid ${primary ? "#9FD3B4" : "#DDE7E1"};border-radius:12px;">
          <tr>
            <td colspan="2" style="padding:9px 10px 8px 10px;background-color:${primary ? "#F0F8F3" : "#F7F9F8"};border-radius:12px 12px 0 0;border-bottom:1px solid ${primary ? "#CFE6D8" : "#E6ECE8"};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="middle" style="${badge}width:20px;height:20px;border-radius:999px;text-align:center;font-size:11px;font-weight:700;line-height:20px;">${step}</td>
                <td valign="middle" style="padding-left:8px;">
                  <div style="font-size:13px;font-weight:700;color:#0B3D22;line-height:1.3;">${escapeHtml(title)}</div>
                  <div style="font-size:11px;color:#4B5F55;line-height:1.3;margin-top:1px;">${hint}</div>
                </td>
              </tr></table>
            </td>
          </tr>${rows}
        </table>`;
}

/**
 * Gmail / Outlook-safe HTML for the ISO application-approval email (Cashable design):
 * approved pill, green approval card (amount + terms + calculator button),
 * required stips, sign-off. Business, brand and link come from the deal.
 */
export function renderApplicationApprovalEmailHtml(
  values: TemplateValues,
): string {
  const fields = resolveApplicationApprovalEmailFields(values);
  const companyName = escapeHtml(fields.companyName);
  // Header/footer add "FUNDING" themselves, so drop it from the name if present.
  const brandRaw = String(fields.companyNameBrand || "Cashable")
    .trim()
    .replace(/\s+funding$/i, "") || "Cashable";
  const brand = escapeHtml(brandRaw);
  const isoApprovalHref = escapeHrefAttribute(fields.isoApprovalUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Application Approved</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F2;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#F1F5F2;">
Good news – ${companyName} has been approved by ${brand} Funding. Calculate your approval now.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F2;">
<tr><td align="center" style="padding:20px 10px;">
  <table role="presentation" width="${EMAIL_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${EMAIL_WIDTH}px;font-family:${FONT};background-color:#FFFFFF;border:1px solid #DDE7E1;border-radius:14px;">
    <tr>
      <td align="center" style="padding:16px 20px 12px 20px;">
        <img src="${APP_EMAIL_LOGO_SRC}" alt="${escapeHtml(brandRaw)} Funding" width="120" border="0" style="display:block;width:120px;max-width:120px;height:auto;margin:0 auto;" />
      </td>
    </tr>
    <tr>
      <td height="4" bgcolor="#166534" style="height:4px;line-height:4px;font-size:0;background-color:#166534;background-image:linear-gradient(90deg,#0B3D22 0%,#166534 55%,#47A86F 100%);">&nbsp;</td>
    </tr>
    <tr>
      <td align="center" style="background-color:#F4FAF6;padding:18px 28px 16px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background-color:#166534;color:#FFFFFF;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:6px 14px;border-radius:999px;">&#10003;&nbsp; APPROVED</td>
          </tr>
        </table>
        <h1 style="margin:10px 0 4px 0;font-size:20px;line-height:1.3;color:#0B3D22;font-weight:700;">Application Approved</h1>
        <p style="margin:0;font-size:13px;line-height:1.5;color:#4B5F55;">Congratulations! Your application has been successfully processed.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 4px 28px;">
        <p style="margin:0 0 8px 0;font-size:14px;line-height:1.5;color:#1F2A24;">Hi Team,</p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#1F2A24;">
          We're pleased to let you know that <strong>${companyName}</strong> has been <strong style="color:#166534;">approved</strong> by ${brand} Funding.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 28px 0 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0F8F3;border:1px solid #CFE6D8;border-radius:12px;">
          <tr>
            <td align="center" style="padding:14px 12px 16px 12px;">
              ${OFFER_TERMS_SLOT}
              <div style="font-size:13px;color:#4B5F55;margin:10px 0 10px 0;">No ${brand} login needed &middot; Anyone on your team can use this link</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#166534" style="background-color:#166534;background-image:linear-gradient(90deg,#0B3D22 0%,#166534 60%,#1F8A4C 100%);border-radius:10px;">
                    <a href="${isoApprovalHref}" target="_blank" style="display:inline-block;padding:10px 26px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">Calculate Your Approval &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 0 28px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#166534;">NEXT STEPS</div>
        <div style="font-size:15px;font-weight:700;color:#0B3D22;margin:2px 0 2px 0;">Send us these to keep the deal moving</div>
        <div style="font-size:12px;line-height:1.5;color:#4B5F55;margin:0 0 10px 0;">Reply to this email with the documents attached &mdash; no portal or login needed.</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="50%" valign="top" style="padding-right:5px;">${stipStepHtml(1, "To request contracts", "Send these for the contract.", CLIENT_PROVIDED_STIPS, true)}</td>
          <td width="50%" valign="top" style="padding-left:5px;">${stipStepHtml(2, "Before funding", "Needed to fund the deal.", COMPANY_HANDLED_STIPS, false)}</td>
        </tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
          <tr>
            <td style="background-color:#F0F8F3;border-left:4px solid #166534;padding:8px 12px;font-size:12px;line-height:1.6;color:#1F2A24;">
              <strong style="color:#0B3D22;">Tip:</strong> send Step 1 now to get the contract out fastest. Step 2 can follow while the merchant reviews it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 18px 28px;">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#1F2A24;">Best regards,<br><strong style="color:#0B3D22;">${brand} Team</strong></p>
      </td>
    </tr>
    <tr>
      <td align="center" bgcolor="#0B3D22" style="background-color:#0B3D22;padding:12px 20px;border-radius:0 0 13px 13px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#CFE6D8;"><strong style="color:#FFFFFF;">${brand} Funding</strong> &middot; Questions? Simply reply to this email.</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
