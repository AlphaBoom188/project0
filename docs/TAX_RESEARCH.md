# Tax Section: Research and Breakdown (inspired by iTAX)

Research date: 2026-11-19. Goal: add a Thai personal income tax section to the app, learning from iTAX ("iTAX คำนวณและวางแผนภาษี"), and using what our app already knows about the user to go further.

> **Status of the tax rules below:** compiled from secondary sources (iTAX's 2569 deduction list, Forvis Mazars Oct 2025, finance sites). They are not yet checked against the Revenue Code or Revenue Department (rd.go.th) announcements. Every rule goes into a per-year table with its source and a `verified` flag (see Architecture); nothing ships as "verified" until it's checked against a primary source.

---

## 1. What iTAX is

| | |
|---|---|
| Product | iTAX Inc. A tax calculator and planner (iOS and Android), plus the itax.in.th web tools, the "iTAX pedia" knowledge base and the shop.itax.in.th insurance/fund comparison |
| Traction | App Store 4.8 stars from about 30k ratings |
| Promise | "รองรับการคำนวณภาษีของรายได้ทุกประเภท และวางแผนภาษีอย่างละเอียด"; "accurate to the satang, same standard as the Revenue Department" |
| Money | Free, with in-app purchases (coins ฿99/฿499, storage 200 MB to 5 GB for document uploads, tip tiers). Plus the **iTAX shop**, which ranks tax-deductible insurance and RMF/ThaiESG funds; the commercial model behind it isn't public. |

**Features we could confirm** (store listing, version history, website):
- **Income of all eight types** (section 40(1) to 40(8)), with dividend income including **uploading TSD/Wiset dividend files** and the new dividend rate, and Security Token dividends.
- **The deduction catalogue,** updated every year with government measures (Easy E-Receipt 1.0/2.0, ช้อปดีมีคืน with the e-tax-invoice vs paper split, เที่ยวดีมีคืน, เที่ยวเมืองรอง, new-home construction, ThaiESG at 300k, ThaiESGX, artwork purchases).
- **Multiple tax years** side by side (2567, 2568, 2569).
- **Document attachments** on income and deduction items (PDF/JPG/PNG), with paid storage.
- **e-Filing** support for the current year.
- **Withholding tools** (web): withholding calculator, PND 1/1ก files, social-security forms, payslips/50 ทวิ.
- **Onboarding flow** (from iTAX pedia): Home, enter the first income, tap "รับสิทธิ์" on the personal allowance, enter birth date, sex and status, then tax recalculates automatically. Every deduction is a card you "claim".

### 1b. iTAX flows, from the owner's screenshots (14 screens, tax year 2569)

1. **Home (empty):**
   - Dark hero showing **"จ่ายภาษีเพิ่ม ฿0"** (amount to pay); it becomes "refund" when negative.
   - A **year pill** ("2569") with an avatar in the corner.
   - One card: "เริ่มคำนวณภาษี: กรอกรายได้ก้อนแรกของคุณ" with **START**.
   - Bottom nav: Home, Shop, **+**, Notifications, More.
2. **"+" sheet: "เพิ่มรายได้ / ค่าลดหย่อน":**
   - **รายได้** (income).
   - **ค่าลดหย่อน** (deductions), *disabled* until the first income is entered and the personal allowance claimed.
   - A banner: **"Import เงินเดือนอัตโนมัติ"** (pull income and deductions from the employer's payroll; a partner integration).
3. **Add income ("รายได้ก้อนใหม่"):**
   - A **6-tile shortcut grid** for the common cases: salary & bonus, freelance, online selling, food & drinks, deposit interest, dividends.
   - Then the **full catalogue grouped 40(1) to 40(8)**, each row with a "?" help.
   - Plain-language rows, e.g. 40(2) "คอมมิชชั่น, เบี้ยประชุม, ค่านายหน้า, ฟรีแลนซ์".
   - 40(4) has about 20 investment rows: deposit and bond interest; Thai and foreign dividends; and gains on selling LTF, RMF, SSF/SSFX and ThaiESG, each split **"ถูกเงื่อนไข / ผิดเงื่อนไข"** (meets / breaks the holding conditions). Also unlisted shares, shareholder bonuses, capital reduction and increase, debt instruments, **crypto/digital token** gains and dividends, and Security Token dividends.
   - 40(5) has five asset rows; 40(6) has six professions (medicine, law, engineering, architecture, accounting, fine arts); 40(7) contracting.
   - 40(8) is the **business list (about 45 rows)** in everyday words: buy-and-sell trading, restaurants/cafés/noodle shops, **"ขนส่งหรือรับจ้างด้วยยานพาหนะ (Grab, LINE Man, Lalamove…)"**, salons and nails, pets, crypto mining, yield farming/staking, performers, inherited property sales…
4. **Amount entry:** a full-screen **calculator keypad** (÷ × − + =, AC) for "รายได้ (ก่อนถูกหักภาษี) ฿ ต่อปี", then Next. It's followed by withheld tax and the payer.
5. **Home with data:**
   - The hero updates live: **"จ่ายภาษีเพิ่ม ฿12,500"**.
   - **Income card:** rows per type (เงินเดือน และโบนัส ฿500,000 >), "รวมทั้งปี 2569 ฿500,000", and a round **+**.
   - **Deductions card:** "กรุณารับสิทธิ ค่าลดหย่อนส่วนตัว" with a **[รับสิทธิ]** button.
   - Then a donate-to-iTAX banner and an **iTAX shop** promo.
6. **Income type detail:**
   - Badge **"เงินได้ประเภท 40(1)"**, the title, and the year's income and withheld totals.
   - An insurance-shop banner.
   - One **card per payer** (บริษัท ฿500,000) with editable rows: รายได้ / ภาษีหัก ณ ที่จ่าย / รายละเอียด (payer), plus **Delete** and **เอกสารแนบ (0)**.
   - **"+ รายได้ก้อนใหม่"**.

**Worked example, for our test suite:** salary 500,000 with 5,000 withheld and no deductions claimed: 500,000 − 100,000 expense (50%, cap 100k) = 400,000; tax = 7,500 (5% of 150k) + 10,000 (10% of 100k) = 17,500; minus 5,000 withheld = **pay 12,500**. This matches iTAX exactly. Note that iTAX applies **no allowance, not even the personal 60,000, until you claim it**.

**What this means for our design:**
- **The data model:** each income entry is {type and sub-type (catalogue row), payer, gross, withheld, attachments}.
- **The catalogue** is a user-facing list of plain-language rows mapped to legal types and expense rules. We'll ship the same breadth, in English, with Thai legal names in the help.
- **We pre-fill** what iTAX makes you type:
  - salary and its withholding from income transactions and 50 ทวิ OCR;
  - dividends and withholding from the portfolio;
  - **RMF/ThaiESG sale gains with the "meets conditions?" check computed from lot dates**, which iTAX can't know.
- **We claim the personal allowance by default** once the profile exists (iTAX makes it a gate), and show every deduction as a checklist with its remaining room, rather than a blank list.
- **No ads or shop banners;** recommendations come only from the planner.

**Not visible without using the app:** the exact screens (income form, result screen, planning suggestions), how it compares the actual-expense and flat-rate methods, and how it presents "refund vs pay". Next step: screenshots of the iTAX app from the owner's phone to map the flows one-to-one.

**Patterns worth copying:**
1. A **live tax figure** that recalculates as you add each item.
2. **Deductions as a checklist of claimable items** with "claimed X / max Y".
3. **Year-specific government measures** appear and disappear by tax year.
4. **Documents attached to the item** they prove.
5. **Planning:** how much more to put into each deduction to save how much tax.

**Where they're weak, and where we win:** iTAX knows nothing about you until you type it in. **We already have the user's money data**: income deposits, salary, insurance premiums, donations, investments (RMF/ThaiESG holdings and lots), dividends with withholding, and bank statements. Our tax section can fill itself in.

---

## 2. Thai personal income tax: the model to implement

**Computation pipeline** (one tax year, one person):
1. **Assessable income** by type 40(1) to 40(8).
2. **Minus expenses** per type:
   - 40(1)+(2): 50%, capped at 100,000 combined.
   - 40(5) rent: 30% for houses and buildings, 30% vehicles, 15% non-agricultural land, 10% other (to verify).
   - 40(6) professions: 60% for medicine, 30% others, or actual (sources conflict).
   - 40(8): actual, or the flat rate from the 43-business-type table (60% on the first 300,000, 40% above, per the RD guide; to verify per type).
3. **Minus allowances** (items 1-21 below).
4. **Minus donations:** education/sports/social/state hospitals at 2x, capped at 10% of net income after allowances; then general donations, capped at 10% of net income after that.
5. **= Net income**, then apply the **progressive rates**:

| Net income (THB) | Rate |
|---|---|
| 0-150,000 | 0% |
| 150,001-300,000 | 5% |
| 300,001-500,000 | 10% |
| 500,001-750,000 | 15% |
| 750,001-1,000,000 | 20% |
| 1,000,001-2,000,000 | 25% |
| 2,000,001-5,000,000 | 30% |
| 5,000,001+ | 35% |

6. **Alternative method** for non-salary income: 0.5% of assessable income excluding 40(1); the higher of the two applies when it exceeds 5,000. **Not confirmed by any source read; verify on rd.go.th before implementing.**
7. **Minus tax already withheld** (50 ทวิ, dividend withholding) and the **dividend tax credit** if chosen. The result is **refund** or **pay**.
8. **Exemptions** applied before all this: 65+ or disabled, the first 190,000 is exempt; severance (to verify).

**Allowances and deductions for tax year 2569** (iTAX list; Forvis for 2568):

| Group | Item | Cap / rule | Notes |
|---|---|---|---|
| Family | Personal | 60,000 | |
| | Spouse with no income | 60,000 | |
| | Child | 30,000; 60,000 for the 2nd+ child born 2018 or later | Income condition (Forvis) to verify |
| | Parents (60+) | 30,000 each | Income ≤ 30,000 (Forvis) to verify |
| | Disabled dependant | 60,000 each | |
| | Maternity | Actual, up to 60,000 per pregnancy | |
| Insurance | Life (10y+) | Actual, up to 100,000 (combined with own health) | |
| | Own health | Up to 25,000 (inside the 100k above) | |
| | Parents' health | Up to 15,000 | Spouse's parents? to verify |
| | Spouse life (spouse with no income) | Up to 10,000 | |
| Retirement (**combined cap 500,000**) | Provident fund / GPF / teachers' fund | 15% of salary (GPF up to 30%?) | **Conflict**: salary vs income base, GPF 15 vs 30% |
| | RMF | 30% of assessable income | |
| | Pension insurance | 15% of income, up to 200,000 | |
| | National savings fund (กอช.) | Up to 30,000 | |
| Investment (outside the 500k) | ThaiESG | 30% of income, up to 300,000; hold 5 years | Combined with ThaiESGX in 2569 |
| | ThaiESGX (from LTF) | 50,000 per year, 2569-2572 | For the amount converted above 300k in 2568 |
| | SSF | Ended after 2567 (no new deductions) | |
| | Social enterprise investment | Up to 100,000 | |
| Other | Social security | Actual (cap 10,500 per iTAX vs "actual" per Forvis) | **Conflict** |
| | Home loan interest | Up to 100,000 | |
| | Political party donation | Up to 10,000 | |
| | Artwork purchase | Up to 100,000 (2568-2570?) | Date window conflict |
| | Solar rooftop | Up to 200,000 (2569-2571) | iTAX only |
| 2568 only | Easy E-Receipt 2.0 | Up to 50,000 (30k VAT sellers + 20k OTOP/local), 16 Jan-28 Feb 2025 | |
| | เที่ยวดีมีคืน | Up to 20,000 (1.5x in secondary cities, up to 30,000), 29 Oct-15 Dec 2025 | |
| | New-home construction | 10,000 per 1M baht, up to 100,000 | |

**Filing:**
- PND 91 (salary only) or PND 90 (other income); PND 94 is the half-year return for some non-salary income (to verify).
- Tax year 2568: paper by 31 Mar 2026, e-filing by 7-8 Apr 2026.
- Pay in 3 instalments if tax ≥ 3,000.
- Late fine up to 2,000; surcharge 1.5% a month.

**Conflicts to resolve with primary sources before shipping:** provident/GPF base and cap; social-security cap; child and parent income conditions; donation recipient categories; artwork window; life insurance 10-year condition; ThaiESGX holding period; the 0.5% method; 40(3)-40(8) rates; PND 90/94 rules; 2569 filing dates.

---

## 3. Our Tax section: feature breakdown

**Principle:** reuse what the app already knows, so the user confirms rather than types.

| # | Feature | What it does | Uses what we have |
|---|---|---|---|
| T1 | **Tax profile** | Tax year, birth year (65+ exemption), marital status, spouse income yes/no, children (birth years), parents supported, disabled dependants | Settings-style sheet |
| T2 | **Income by type** | Salary 40(1), freelance 40(2), rent 40(5), professions 40(6), business 40(8), interest and dividends 40(4); each with tax withheld | **Auto-suggest** from transactions in income categories and from recurring salary; **dividends and their withholding** from the portfolio (Phase C data) |
| T3 | **Deduction checklist** | Every allowance for the year as a card: claimed / cap / remaining, grouped (Family, Insurance, Retirement, Investment, Other, This year's measures) | **Auto-fill** from categorized transactions (insurance premiums, donations, home-loan interest), **RMF/ThaiESG lots** from the portfolio, social security from payslip deposits |
| T4 | **Live tax result** | Net income, tax by bracket, minus withheld = **refund or pay**; effective and marginal rate | Pure calculator (like goalMath) |
| T5 | **Planner** | "Put ฿X more into ThaiESG to save ฿Y" ranked by tax saved per baht, respecting caps and the 500k retirement cap; year-end countdown | Marginal rate from T4; link to Net Worth for buying funds |
| T6 | **Documents** | Attach 50 ทวิ, insurance certificates, donation receipts, fund statements to the item they prove; **OCR of 50 ทวิ** fills income and withheld tax | Existing receipt OCR pipeline, private storage, thumbnails |
| T7 | **Filing guide** | Which form (PND 90/91), a line-by-line mapping of our numbers to the RD e-filing fields, a deadline countdown and LINE reminders; export a PDF/CSV summary | Existing cron reminders and LINE push |
| T8 | **Mid-year check** (later) | Projection from year-to-date income; PND 94 guidance for 40(5)-(8) | Monthly Pulse data |

**Out of scope for now:**
- **Filing on the user's behalf:** there's no public RD API, and it raises liability.
- **Selling funds/insurance:** in Thailand that needs SEC/OIC licences. Any shop would be referral links, a business decision for later.

---

## 4. Architecture

**Rules as data, per tax year** (`backend/services/tax/rules/2568.js`, `2569.js`):

```js
{ year: 2569, brackets: [...],
  expenses: { '40(1)+(2)': { rate: 0.5, cap: 100000 }, ... },
  deductions: [
    { key: 'life_insurance', group: 'insurance', cap: 100000, combinedWith: 'life_health_100k',
      source: 'iTAX 2569 list', verified: false }, ... ],
  combinedCaps: { retirement_500k: { cap: 500000, members: ['provident', 'rmf', 'pension_insurance', 'nsf'] } } }
```

- **Pure calculator** `services/tax/taxMath.js`: profile + incomes + claimed deductions + rules gives the full breakdown. It has its own exhaustive test suite (like `goalMath`/`lotMath`), covering worked examples from RD guides once verified.
- **Suggestion engine** `services/tax/taxSuggest.js`: reads transactions, recurring items, portfolio lots and dividends, and proposes incomes and deductions with confidence and source rows. The user accepts or edits; nothing is assumed silently.
- **Tables (migration 019):**
  - `tax_profiles` (one per user per year);
  - `tax_incomes` (type, payer, amount, withheld, source = manual | suggested | ocr);
  - `tax_deductions` (key, amount, source, linked transaction/lot ids);
  - `tax_documents` (storage path, kind, linked item).
- **Endpoints** under `/api/tax/:u/:year`: profile, incomes, deductions, documents, `result`, `suggestions`, `plan`.
- **LIFF:** a new **Tax** area (a sixth tab, or inside Net Worth; owner's call). It's built to the new UI rules: shadcn tokens, the 4/8/16/24 grid, Lucide icons, one accent, and beautifului-style loading/streaming/approval states for OCR and suggestions.

**UI screens:**
1. Tax home: refund or pay hero number, progress of deductions, next deadline.
2. Profile sheet.
3. Income list and editor.
4. Deduction checklist with a detail sheet per item.
5. Result breakdown (brackets).
6. Planner.
7. Documents.
8. Filing guide.

---

## 5. Suggested phases

1. **Rules and calculator:** verify the rules for 2568 and 2569 against rd.go.th; build `taxMath` and its tests. No UI yet; the hardest correctness work.
2. **Tax MVP UI:** profile, income, deductions checklist, live result (T1-T4).
3. **Auto-fill:** suggestions from transactions, the portfolio and dividends (T2/T3 auto). This is our differentiator.
4. **Planner** (T5) and **filing guide plus reminders** (T7).
5. **Documents and 50 ทวิ OCR** (T6).
6. **Mid-year check** (T8) and the yearly rules refresh routine.

## 6. Open questions for the owner

1. Where does Tax live: a new bottom tab, or a section in Net Worth?
2. Which year comes first: 2568 (filing now, Jan-Apr 2026) or 2569 (the current year, for planning)? Recommend both, with 2568 first.
3. Who is it for: salaried users only (PND 91, simplest), or freelancers and landlords too (PND 90)?
4. Can you share iTAX screenshots (income, deductions, result, planner) for a one-to-one flow comparison?
5. Will the tax rules get a professional check before launch?

## Sources

- [iTAX App Store](https://apps.apple.com/th/app/itax-%E0%B8%84%E0%B8%B3%E0%B8%99%E0%B8%A7%E0%B8%93%E0%B9%81%E0%B8%A5%E0%B8%B0%E0%B8%A7%E0%B8%B2%E0%B8%87%E0%B9%81%E0%B8%9C%E0%B8%99%E0%B8%A0%E0%B8%B2%E0%B8%A9/id1050984347) and [Google Play](https://play.google.com/store/apps/details?id=com.ld.itax_pro_android&hl=en_SG)
- [itax.in.th](https://www.itax.in.th/), [iTAX lite](https://www.itax.in.th/lite/), [iTAX pedia: deductions](https://www.itax.in.th/pedia/%E0%B8%84%E0%B9%88%E0%B8%B2%E0%B8%A5%E0%B8%94%E0%B8%AB%E0%B8%A2%E0%B9%88%E0%B8%AD%E0%B8%99/), [personal allowance](https://www.itax.in.th/pedia/%E0%B8%84%E0%B9%88%E0%B8%B2%E0%B8%A5%E0%B8%94%E0%B8%AB%E0%B8%A2%E0%B9%88%E0%B8%AD%E0%B8%99%E0%B8%AA%E0%B9%88%E0%B8%A7%E0%B8%99%E0%B8%95%E0%B8%B1%E0%B8%A7/), [Thai ESGX](https://www.itax.in.th/media/thai-esgx/), [iTAX shop](https://shop.itax.in.th/)
- [Forvis Mazars: PND 91, Nov 2025](https://www.forvismazars.com/th/en/insights/doing-business-in-thailand/payroll/personal-income-tax-return-pnd-91)
- [PwC Thai Tax 2025/26 booklet](https://www.pwc.com/th/en/tax/assets/thai-tax/2025-2026/thai-tax-booklet-2025-26.pdf) (not readable by our fetcher)
- [Revenue Department PIT guide](https://www.rd.go.th/region/07/fileadmin/065/003_newsactivity/2565/guideline50_50.pdf), [RD personal income tax](https://www.rd.go.th/fileadmin/download/insight_pasi/personalincome_61.pdf), [PND 90 form](https://www.rd.go.th/fileadmin/tax_pdf/pit/2565/271265PIT90.pdf)
- [PEAK: 8 income types](https://www.peakaccount.com/blog/tax/corporate-income-tax/income-tax), [PEAK: PIT 2569](https://www.peakaccount.com/blog/tax/personal-income-tax/calculation-of-personal-income-tax)
- [HLB 2025 deductions](https://www.hlbthai.com/personal-income-tax-deductions-and-allowances-in-thailand-for-2025-what-you-need-to-know/), [Acclime](https://thailand.acclime.com/guides/personal-income-tax/), [Kalberry 2026 guide](https://www.kalberry.com/en/thailand/blog/thailand-income-tax-guide-2026/)
- [Krungthai 2568 deductions](https://krungthai.com/th/financial-partner/learn-financial/1220), [Sanook 2568](https://www.sanook.com/money/946084/), [Sanook 2569](https://www.sanook.com/money/957511/), [CIMB 2569 funds](https://www.cimbthai.com/th/personal/blog/financial-guru/tax-deduction-investment.html), [Finnomena ThaiESG](https://www.finnomena.com/finnomenafunds/what-is-tesg/)
