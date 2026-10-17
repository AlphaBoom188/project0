# Master UX/UI & System Specification — Yahoo Finance Mobile & Portseido

Source spec provided by the product owner (2026-10-18). **How it is adapted to this app** (decided with the owner — these override the spec where they conflict):

- **Stack:** keep the LIFF app's existing CSS design tokens (`liff-app/style.css`) for all styling — no Tailwind. Chart.js (pinned cdnjs URL) only for the new line/bar charts. Plain JS, no build step.
- **Tabs:** the real app has 5 tabs (Home, Transactions, Budgets, Net Worth, Settings); Recurring lives under Budgets → Advanced. Investment features go in **Net Worth** (and Home where noted).
- **Lots:** entered and listed per holding in Net Worth (Add Lot form, My Holdings card); the Transactions tab gets an "Investments" filter that lists Buy/Sell lots, never mixed into income/expense totals or budgets.
- **Currency:** each holding has a currency (THB or USD); portfolio totals, gains, benchmarks and the goal tracker are in THB via the live USD→THB rate.
- **Scope, in order:** A) lots & gains, B) benchmark chart, C) dividends, D) goal tracker.
- **Not built:** News / Markets / Analysis / Financials screens (no data source); emoji icons (the LIFF app has a no-emoji rule — use the inline SVG icons); the spec's brand palettes (keep the app's own tokens).
- **Constraints:** 16px form inputs (iOS auto-zoom), dark + light mode via tokens, all dates on the Asia/Bangkok calendar.

---

## App 1: Yahoo Finance Mobile

**Focus:** high-frequency stock tracking, portfolio lot tracking, market news, key statistics. Dark-first, compact data density.

**Navigation:** floating bottom bar (Home, News, Markets). Core Portfolio views via top segmented control: Share Lots | Transactions | Dividends | Cash Balance.

### Screen 1.1 — Core Portfolio: Transactions Log
- Header: title `Core Portfolio` with `+` action. Segmented row: Share Lots | Transactions (active) | Dividends | Cash balance. Filters: `Ticker` | `Transaction type`. Counter: `46 Transactions (i)`.
- Feed item: left — logo/icon + action badge (`[Action] [Ticker]`, e.g. ELV Sell, AMZN Buy); sub-left — `0.43186 shares • $311.69`; right — transaction total (`$134.456443`); sub-right — date (Asia/Bangkok).

### Screen 1.2 — Asset Detail (e.g. NVDA)
- Top nav: back, search, ticker header, star, alert bell, share. Sub-tabs: Summary | News | Analysis | Financials.
- Price header: market line (`NasdaqGS - Nasdaq Real Time Price (USD)`), name, real-time price with change (`-3.10 (-1.43%)`, red for loss), after-hours card.
- Sparkline chart with ranges 1D | 5D | 1M | 6M | YTD | 1Y | 5Y | ALL; expand + settings.
- **MY HOLDINGS card:** Day's Gain `-3.93 (-1.43%)`, Total Gain `+$29.41 (+12.15%)`, Shares `1.268`, Average Cost `$190.94`, Market Value `$271.51`, link `View holdings ->`.

### Screen 1.3 — Add New Lot (modal)
- Header: close, title `Add New Lot`, asset logo. Inputs: ticker selector, date picker (Asia/Bangkok), shares, cost/share (prefilled with price), comment (optional). Primary: full-width `Add Lot`.

---

## App 2: Portseido Portfolio Intelligence

**Focus:** portfolio analytics, benchmark comparison, dividend projection, trade-level win rates, retirement goal tracking. Light, card-based.

**Tabs:** Home (balance, valuation chart, benchmarks) · Return (TWR vs MWR) · Allocation (donut + performance vs index) · Dividend (cash flow, yield, projections) · Manage (manual transactions, lot editor, accounts) · Menu (settings, Goal Tracker).

### Screen 2.1 — Home & Benchmark Performance
- Total balance callout (`฿736,500`). Gain row: `+฿4,708.08 (+0.64%) TODAY`, `-฿418.27 (-0.06%) YESTERDAY`, `+฿233,219 (+84.39%) ALL`.
- Toggles: calculation MWR | TWR | SR; view Value | Return | Gain; horizon 1m | 3m | 6m | Ytd | 1y | 3y | 5y | All.
- Benchmark chart: Portfolio vs S&P500 vs SET Index vs Deposits; benchmark cards, e.g. S&P500 `7,650.50 (+12.74% / 0.17%)`, SET `1,598.03 (+35.30% / 2.26%)`.

### Screen 2.2 — Trade Breakdown & Position Performance
- Open date, purchase price, total cost basis.
- GAINS: Unrealized, Realized, Dividends, Commissions, Total Gain.
- RETURNS: Total return vs benchmark (S&P500) and the difference ("Beat S&P500 by 35.96%").
- Stats: Win Rate `100.00%`, Lots `1 open / 0 closed`.

### Screen 2.3 — Dividend Insights & Cash-flow Projections
- Annual dividend income (with YoY), portfolio yield, yield on cost, avg monthly income, avg daily income.
- Chart modes Monthly | Quarterly | Annually; dual-tone bars: received (solid) vs upcoming projected (light).

### Screen 2.4 — Retirement Goal Tracker
- Inputs: start date, start value, time horizon (years), expected annual return, additional monthly contribution, contribution growth rate (YoY).
- Projection: growth curve toward the target with current progress %, plus a year-by-year forecast table.

---

## Design comparison (reference only — the app keeps its own tokens)

| Attribute | Yahoo Finance Mobile | Portseido |
| :--- | :--- | :--- |
| Theme | Dark (`#000000`) | Light (`#FFFFFF`) |
| Accent | `#2065D8` | `#5900F7` |
| Gain | `#00B852` | `#10B981` |
| Loss | `#FF3B30` | `#EF4444` |
| Card BG | `#18191B` / `#232528` | `#F8F9FE` |
| Users | Active traders | Long-term investors, dividend / FIRE |
| Granularity | Share fractions to 5 decimals | Portfolio-level (TWR, MWR) |
