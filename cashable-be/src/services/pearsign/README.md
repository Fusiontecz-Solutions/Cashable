# PearSign (replacing Dropbox Sign) — Cashable

## What Dropbox Sign did here

Dropbox Sign (`services/dropboxsign/`) is the **send/sign provider**, not a template store.
Template PDFs live in Cloudinary (`BoldSignTemplate.pdfUrl`, keyed `funder_<funderProfileId>[_<type>]`)
plus bundled layout PDFs (`services/docusign/layouts/assets/`). Field positions come from the
coordinate layouts (`services/docusign/layouts/*.layout.json`). On every send the CRM builds
the package and uploads it to Dropbox Sign's embedded editor.

## Template inventory (production, Nov 2026)

| Document | CASHABLE FUND LLC | CASHABLE LLC | Trigger / selection | Provider |
|---|---|---|---|---|
| Main contract (Future Receivables Agreement) | ✓ | ✓ | Create Contract, funder profile `mainContractLayoutKey`; coordinate layout `contract` | **PearSign** |
| ACH Authorization | ✓ | ✓ | addendum picker / standalone ACH | **PearSign** (template + package) |
| COJ — Iowa | ✓ | ✓ | addendum picker | **PearSign** (template + package) |
| COJ — NY General / Business only / Individual only | – | ✓ | addendum picker (NY deals) | **PearSign** (template + package) |
| Deposit Control (all other states) | ✓ | – | addendum picker | **PearSign** (template + package) |
| Deposit Control (NY & TX) | – | ✓ | addendum picker | **PearSign** (template + package) |
| Prepay Discount | ✓ | ✓ | addendum picker | **PearSign** (template + package) |
| Waiver of Personal Service (NY) | – | ✓ | addendum picker | **PearSign** (template + package) |
| State disclosures, daily + weekly × CA CT FL GA KS LA MO NY TX UT VA (22) | ✓ | – | merchant state + payment frequency | **PearSign** (template + package) |

All 43 documents have a verified PearSign template registered in `PearSignTemplate` (4 contract, 17 addendum/ACH incl. 1/2-owner variants, 22 disclosures — daily and weekly separate). Re-run `createPearSignDocumentTemplates.ts --register` after uploading a new PDF in Settings.

**Production data bug:** BoldSignTemplate "CASHABLE FUND LLC virginia daily disclosure" points at the WEEKLY Virginia PDF. The PearSign template uses DOCS/disclosures/Daily_Virginia; the CRM send path still loads the production row until that row is fixed. COJ NY layouts have no signature placements (notarized forms).

Notes: the CASHABLE LLC contract in `DOCS/` differs from the production Cloudinary PDF — templates were
built from the Cloudinary file. COJ Iowa and Prepay Discount are in use but not in `DOCS/`.

## PearSign contract templates

One template per funder × owner count (`PearSignTemplate` table, `manual_pearsign_templates.sql`):

| Funder | 1 owner | 2 owners |
|---|---|---|
| CASHABLE FUND LLC | `5612cb08-5714-4638-9e75-9c98a2f57ff1` (112 fields) | `916928ee-15f4-40d6-9db9-014b1767099d` (160) |
| CASHABLE LLC | `68e92655-63cc-4db1-b58e-4fd9a03b8514` (112) | `dd0ae428-95fb-4652-99d8-db1fdd3b7b64` (160) |

The layout's only condition is `owners >= 2` (Owner 2's initials/signatures/names), so the two
variants replace it. Roles: `signer-1` = Owner 1, `signer-2` = Owner 2.

## Field contract

- CRM-filled fields are named `<layoutVariable>_p<page>[b|c…]` (e.g. `client_legal_name_p1`, `signature_date_p2b`).
  `pearSignBaseKey()` strips the suffix; one CRM value fills every field sharing the variable.
- Signer fields: `signature_o<n>_p<page>`, `initials_o<n>_p<page>`; fill-at-signing bank-portal fields
  (`ach_authorization_*`, page 15) are Owner 1 text fields left blank for the signer.
- Values are **not** mapped a second time: `pearsign-values.service.ts` runs the Dropbox Sign envelope
  builder for the main contract and reads each tab's value, so PearSign prints exactly what Dropbox Sign did.
  Verified against both PDFs: every box sits under its printed label (MERCHANT'S LEGAL NAME, PURCHASE PRICE,
  PURCHASED AMOUNT, ORIGINATION FEE, BANK NAME / ROUTING # / ACCOUNT # / TAX ID #, …).

## One envelope: contract + addendums + disclosure

PearSign sends from a single template, so **Review & send in PearSign** (Create Contract) does:

1. `POST /docusign/merge-and-send` with `signingProvider: "pearsign"` — the SAME package build as Dropbox Sign
   (selected addendums, state disclosure, order, per-document values) — staged on
   `contractPrefillOverrides.pearsignPackage` (merged PDF in Cloudinary `ih-crm/pearsign-packages`, every tab → positioned field).
2. Review modal (`GET /pearsign/contracts/:id/package`, edits `PUT …/package/overrides`, preview `POST …/package/preview`).
3. `POST …/package/send` → per-send PearSign template from the merged PDF → ONE envelope. The template is deleted
   once the envelope is completed/voided/expired (status job). Verified: envelopes survive template deletion.

## Contract-only flow (same as Meridian)

Create Contract → **Review & send in PearSign** → Review modal (PDF with values drawn live + editable
values, edits saved to `Contract.contractPrefillOverrides.pearsignMainContract.overrides`) →
**Review done — Send via PearSign** → confirm → `POST /pearsign/contracts/:id/send`.
Status: cron `pearSignContractStatusJob` (5 min) + **Refresh status**; void / view from the modal footer.
`Document.envelopeId` holds `env-<uuid>`; the DocuSign controller routes those ids to PearSign.

Not supported by a fixed template: the reverse disbursement schedule page — such contracts are blocked
from PearSign and stay on Dropbox Sign. PearSign has no CC or reminder API.

## Re-provisioning

```bash
npx ts-node --transpile-only src/scripts/createPearSignContractTemplates.ts --dry-run
npx ts-node --transpile-only src/scripts/createPearSignContractTemplates.ts --register   # idempotent; repairs drift
```
Positions must be sent as the nested `position` object — flat `page/x/y` keys are accepted but ignored by the API.
