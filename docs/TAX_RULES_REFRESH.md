# Yearly tax rules refresh

The Tax tab's numbers come from `backend/services/tax/rules/<year>.js`. Thai rules change every year, mostly through the year-only measures. This is the routine to keep them right. The owner gets a LINE message on **10 January** and **1 March** when something below is still open (`backend/jobs/taxRulesCheck.js`, needs `OWNER_LINE_USER_ID`). The same list comes from `rulesIssues()` in `services/tax/rulesCheck.js`.

## When

| When | What |
|---|---|
| December | The RD publishes the instruction booklets for the year that's ending (Ins90, Ins91). Start the check. |
| Early January | The year that ended becomes the **filing year**. Its rules must be verified. Add the new **current year** (for planning). |
| January-February | The Ministry of Finance announces the **online filing deadline**. Set it. |
| June | The RD publishes Ins94 (half-year return) for the current year. Check the PND 94 allowances in `services/tax/taxHalfYear.js`. |

## Steps for a new filing year (e.g. 2569, in January 2570)

1. Download Ins90, Ins91 and (in June) Ins94 for the year from rd.go.th > ภาษีเงินได้บุคคลธรรมดา > แบบ ภ.ง.ด. and คู่มือ. Keep the extracted text out of the repo.
2. Open `rules/<year>.js`:
   - Brackets, the 0.5% method and the 190,000 exemption are in `common.js`. Change them there only if the booklet changed them; otherwise give the year its own copy.
   - **Allowances:** compare every cap and percentage with the booklet. Add the year's new measures (e.g. Easy E-Receipt). Remove ended ones.
   - **Verification:** set `verified: true` and `source` on each rule you checked against the booklet. Leave `verified: false` on anything you couldn't confirm; the app badges it "Unverified".
   - **Carried over:** remove `carriedOver: true` once the year is checked.
   - **Filing dates:** set `filing.paperDeadline` and, once announced, `filing.onlineDeadline` (Buddhist-era dates).
3. Add `rules/<next year>.js` for planning: a copy of the filing year with `carriedOver: true`, `filing.onlineDeadline: null`, and the year's known new measures marked `verified: false`. Register it in `rules/index.js`.
4. Add worked examples for anything that changed to `tests/api/tax_math.test.js`. Run `npm test -- tax`.
5. Update `docs/TAX_RESEARCH.md` with a short "Rules <year>" note: what changed and which booklet it came from.

## Things that have changed before

- The 40(6) fine-arts rate (30% to 60%, Decree 803).
- ThaiESG's limit and holding period (100k and 8 years from 2570).
- The ESGX LTF switch spread over 2569-2572.
- Year-only measures (Easy E-Receipt, เที่ยวดีมีคืน, new-home construction, solar rooftop).
