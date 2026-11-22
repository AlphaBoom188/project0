# QA runbook

Two kinds of QA for the LIFF app:

| When | Command | What |
|---|---|---|
| Before every deploy | `npm run qa:smoke` | ~25 s: every panel, add + Undo, Export / Import sheet, theme, screenshots |
| Before every release | `npm test` | all api + liff suites (~20 min) |
| On request ("run QA per docs/QA.md") | this runbook | exploratory QA through the Playwright MCP |

All commands run from `backend/`. Everything runs against the real Supabase project in `.env`, so the rules in `CLAUDE.md` (Tests) apply: only `test_` users, never a job's all-users entry point, delete what you create.

## One-time setup (the owner)

```bash
claude mcp add --scope user playwright -- npx @playwright/mcp@latest
```

Restart Claude Code; `/mcp` should list **playwright** as connected. Google Chrome must be installed. If it isn't listed, stop: don't install it any other way.

## How the QA browser signs in

`npm run qa:serve` starts a second instance on port 3100 with `DISABLE_CRON=1` (no duplicate LINE pushes) and `DEV_LIFF_STUB=1`. Then `http://localhost:3100/liff/?devuser=test_qa` serves the app with the LINE SDK swapped for a stub that signs in as `test_qa` (`services/devLiffStub.js`). API calls use the existing loopback `test_` bypass.

The stub only works on direct loopback (no `X-Forwarded-For`/`Forwarded`, so never through the ngrok tunnel), only for ids matching `test_[a-z0-9_]{1,40}`, and only with the flag. Otherwise you get the untouched page and a 404 for the stub script; `tests/api/dev_liff_stub.test.js` proves it. Never set `DEV_LIFF_STUB` in production.

## Exploratory run

1. `npm run qa:reset && npm run qa:seed && npm run qa:serve` (leave the server running). The seed is synthetic: budgets on 5 categories (Food over, Transport at 85%), 4 accounts, ~60 transactions over 3 cycles (incl. 2 transfers and a `=SUM(1)` description), 3 recurring rules (one with a pay window), a savings goal, the emergency fund, 2 holdings (THB + USD), reminders, to-dos, a note and a 2569 salary income.
2. With the Playwright MCP, open `http://localhost:3100/liff/?devuser=test_qa` at **390×844**. Run the checklist in light mode, then again after Settings › Appearance › Dark.
3. Record pass or fail for every check. On a failure, take a screenshot and copy the console errors.
4. Write the report to `backend/tests/.output/qa/QA-<YYYY-MM-DD-HHmm>.md` (gitignored), with screenshots next to it.
5. For each bug: fix it per `CLAUDE.md` (bump `?v=` if `liff-app/` changes), add a regression test in `tests/liff/` that fails before the fix and passes after, and run `TEST_BASE_URL=http://localhost:3100 npm test`.
6. Finish with `npm run qa:reset`.

**Don'ts:**
- Don't trigger paid calls: receipt OCR, voice, statement categorisation, 50 ทวิ scans. Their UI is covered by stubbed suites (`liff/voice_entry`, `liff/statement_import`, `liff/tax_documents`, `liff/uxui_refresh`).
- Never confirm a destructive action, except on data this run created for `test_qa`.

### Checklist (per theme)

- **Shell:**
  - The 5 nav tabs open the right panels and highlight correctly: Money for Budgets and Wealth; More for Tax, Settings and More.
  - The Add button shows only on Home, History, Tasks and Tax.
  - No horizontal scroll anywhere: `document.documentElement.scrollWidth <= 390`.
  - No console errors.
- **Home:**
  - The hero figures match Money › Budgets.
  - Scan, Speak and Split open the right sheets (close them without scanning or recording).
  - Budgets to watch lists Food (over) and Transport (85%).
  - The Tax row isn't cut off.
  - Recent shows 3 rows with "Category · Account".
- **Add entry:**
  - An empty amount shows the error.
  - An expense saves, the toast's Undo removes it, and History and Home update.
  - An expense that pushes a category over budget shows the red toast.
  - Income and Transfer save.
  - The ✕ button, Escape and a backdrop tap all close the sheet.
- **History:**
  - Search, the type, account and category filters, and the period switch and arrows all change the list and totals.
  - Export / Import sheet: Download CSV opens a signed link, and the file has `'=SUM(1)`.
  - Import CSV opens its preview (cancel before importing).
  - The error state when `/api/transactions` fails is covered by `liff/uxui_refresh`.
- **Money › Budgets:**
  - Category rows and bars use the warn and over colours.
  - Set budget works.
  - The repeat-payment card shows 3 options; Accept and Not a repeat each give a toast (Undo where offered).
  - The subscriptions total is right.
  - Recurring rules: the ⋯ sheet's Active toggle shows "Paused", Edit saves, Delete asks to confirm and shows a toast with Undo.
- **Money › Wealth:**
  - Net worth equals accounts plus holdings.
  - Holding values are in ฿, and the USD fund says "· USD".
  - Goals and income rows open their sheets.
  - The Add goal chooser works.
  - Transfer saves.
- **Tasks:**
  - The week strip works.
  - The chips open their lists.
  - Times sit outside the cards.
  - A reminder can be marked done and undone.
  - The New reminder sheet saves, with quick times, repeat and importance.
  - A note can be added.
- **Tax:**
  - The jump chips scroll.
  - The year switch changes the figures.
  - Add income saves and the figures update.
  - Deductions "Browse all" works.
  - The filing card exports: Summary and CSV open signed links.
- **More / Settings:**
  - Every More row opens its target.
  - The Settings back button works.
  - Switches toggle and are still set after a reload.
  - The theme applies at once and is still set after a reload.
  - Delete account shows the confirm; then cancel.
- **Accessibility spot checks:**
  - Every visible button has a name.
  - Text inputs are at least 16px font and 44px tall.
  - No emoji.
  - Focus is visible when tabbing through a sheet.

### Report format

```md
# QA run <date> — <commit sha>
Result: <n> passed, <n> failed (light) · <n> passed, <n> failed (dark)

| # | Area | Check | Light | Dark | Notes / screenshot |
|---|------|-------|-------|------|--------------------|

## Bugs
### B1 <short title>  — severity: blocker | major | minor
Steps: 1. … 2. …
Expected: … · Actual: … · Console: …
Screenshot: ./B1.png
Fix: <commit> · Regression test: tests/liff/<file>.test.js
```
