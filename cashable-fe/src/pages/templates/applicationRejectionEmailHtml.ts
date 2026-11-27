import type { TemplateValues } from "./types";
import { APP_EMAIL_LOGO_SRC } from "@/constants/appLogo";
import { APP_COMPANY_NAME } from "./applicationApprovalEmailShared";
import {
  DECLINE_REASONS_DELIMITER,
  escapeHtml,
  resolveApplicationRejectionEmailFields,
} from "./applicationRejectionEmailShared";

const BRAND_NAME = APP_COMPANY_NAME;

const EMAIL_WIDTH = 600;
const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";

/** One reason per chip: the CRM's encoded list, else the resolved primary + other reasons. */
function declineReasonList(
  values: Record<string, string | undefined>,
  fields: { primaryReason: string; otherReasons: string },
): string[] {
  const encoded = String(values.decline_reasons || "").trim();
  if (encoded) {
    const list = encoded
      .split(DECLINE_REASONS_DELIMITER)
      .map((reason) => reason.trim())
      .filter(Boolean);
    if (list.length) return list;
  }
  return [
    fields.primaryReason,
    ...String(fields.otherReasons || "")
      .split(",")
      .map((reason) => reason.trim()),
  ].filter(Boolean);
}

/**
 * Gmail / Outlook-safe HTML for the broker decline email (Cashable design):
 * declined pill, reasons card with one chip per selected reason, info note,
 * thank-you and sign-off.
 */
export function renderApplicationRejectionEmailHtml(
  values: TemplateValues,
): string {
  const fields = resolveApplicationRejectionEmailFields(values);
  // Header/footer add "FUNDING" themselves, so drop it from the name if present.
  const brandRaw = String(BRAND_NAME || "Cashable")
    .trim()
    .replace(/\s+funding$/i, "") || "Cashable";
  const brand = escapeHtml(brandRaw);
  const reasonChips = declineReasonList(values, fields)
    .map(
      (reason) =>
        `<span style="display:inline-block;background-color:#FFF5F5;border:1px solid #F6CACA;border-radius:999px;padding:4px 11px;margin:2px;font-size:12px;font-weight:700;color:#B42318;">${escapeHtml(reason)}</span>`,
    )
    .join("\n              ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Application Declined</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F2;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#F1F5F2;">
Thank you for your submission. After careful review, we're unable to approve this application at this time.
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
      <td align="center" style="background-color:#F7F9F8;padding:18px 28px 16px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background-color:#FDECEC;color:#B42318;border:1px solid #F6CACA;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:5px 14px;border-radius:999px;">&#10005;&nbsp; DECLINED</td>
          </tr>
        </table>
        <h1 style="margin:10px 0 4px 0;font-size:20px;line-height:1.3;color:#0B3D22;font-weight:700;">Application Declined</h1>
        <p style="margin:0;font-size:13px;line-height:1.5;color:#4B5F55;">Thank you for your submission. After careful review, we're unable to approve it at this time.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 4px 28px;">
        <p style="margin:0 0 8px 0;font-size:14px;line-height:1.5;color:#1F2A24;">Hi Team,</p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#1F2A24;">Unfortunately, this application does not meet our current underwriting criteria.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 28px 0 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DDE7E1;border-radius:12px;">
          <tr>
            <td style="padding:7px 14px;border-bottom:1px solid #DDE7E1;background-color:#F4FAF6;border-radius:12px 12px 0 0;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#166534;">REASONS FOR DECLINE</td>
          </tr>
          <tr>
            <td align="center" style="padding:10px 10px 11px 10px;">
              ${reasonChips}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:10px 28px 0 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4FAF6;border-radius:10px;">
          <tr>
            <td style="padding:8px 12px;font-size:12px;line-height:1.5;color:#4B5F55;">
              <span style="color:#166534;font-weight:700;">&#9432;</span>&nbsp; This decision is based on our review of the application and supporting documents. It applies only to this application and does not affect future submissions.
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 28px 0 28px;">
        <p style="margin:0;font-size:13px;line-height:1.5;color:#1F2A24;">
          Thank you for considering ${brand} Funding as your funding partner. We appreciate the opportunity and look forward to your next submission.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 28px 18px 28px;">
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
