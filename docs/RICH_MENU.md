# LINE rich menu: setup

A two-tab menu (Money | Tasks) under the bot chat. It's defined in `backend/config/richmenu.js` and the images are `backend/assets/richmenu/money.png` and `tasks.png`. It's deployed through the Messaging API by `backend/scripts/richmenu.js`, never at server start.

## Deploy (one command)

```bash
cd backend
node scripts/richmenu.js deploy   # creates both menus, uploads images, aliases money/tasks, Money = default, deletes older ones
node scripts/richmenu.js status   # check: 2 menus, 2 aliases, [default] on money
node scripts/richmenu.js remove   # take it all down
node scripts/richmenu.js urls     # print every cell's link (no network)
```

It needs `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` and `LIFF_ID` in `backend/.env`, which are already there. Deploy is safe to run again: it creates fresh menus, points the aliases at them, then deletes the old `expense-tracker-*` menus. Afterwards, exactly two menus and two aliases exist.

**No server restart is needed for the menu itself.** The postback replies (Scan, Summary, Today) and the new deep links do need the new code live, so restart the backend after merging, before or right after deploying.

## Owner checklist (LINE consoles)

1. **LINE Official Account Manager › Rich menus:** if a menu made there is set to display, turn it off or delete it, so only the API menu shows. (An API default normally wins over an OA Manager one, but two menus are confusing to manage.)
2. **LINE Developers › Messaging API channel:** nothing to change. The webhook is already on, and postbacks arrive on the same `/api/line/webhook`.
3. **LIFF app:** no change. The cells open `https://liff.line.me/<LIFF_ID>?...`, the same endpoint.
4. **On the phone:** open the 1:1 chat with the bot, close and reopen it, then tap **Menu** at the bottom. Rich menus can take a minute to appear, and reopening the chat refreshes them.

## The cells (`node scripts/richmenu.js urls` prints them with your LIFF ID)

| Menu | Cell | Action |
|---|---|---|
| both | Tab strip left / right | switch to alias `money` / `tasks` (instant, no message) |
| Money | Add entry | `https://liff.line.me/<LIFF_ID>?action=add` |
| Money | Scan receipt | postback `menu=scan` → "Send a photo of your receipt or slip." with Camera / Photos quick replies |
| Money | Speak | `https://liff.line.me/<LIFF_ID>?action=voice` (sheet opens, tap Speak: the mic needs that tap) |
| Money | Import slips | `https://liff.line.me/<LIFF_ID>?action=slips` |
| Money | Summary | postback `menu=summary` → the chat "summary" reply |
| Money | Open app | `https://liff.line.me/<LIFF_ID>` |
| Tasks | Add reminder | `https://liff.line.me/<LIFF_ID>?tab=tasks&action=add` |
| Tasks | Today | postback `menu=today` → the chat "today" briefing |
| Tasks | Quick note | `https://liff.line.me/<LIFF_ID>?tab=tasks&action=note` |
| Tasks | To-do list | `https://liff.line.me/<LIFF_ID>?tab=tasks` |
| Tasks | Bills and groups | `https://liff.line.me/<LIFF_ID>?tab=groups` (the Groups page) |
| Tasks | Open app | `https://liff.line.me/<LIFF_ID>` |

Postback replies use the reply token, so they cost no push quota. They share the bot free-text rate limit (60 per 10 min).

## Done means

- [ ] `deploy` run twice → `status` shows exactly 2 menus and 2 aliases.
- [ ] On a phone: tabs switch instantly, all 12 cells work, and Scan opens LINE's camera from the quick reply.
- [ ] Summary and Today reply instantly (reply token only).

## Changing the artwork

Images can't be swapped on an existing menu, which is why deploy always creates new ones. Replace the PNGs (2500×1686, under 1 MB; `tests/api/richmenu_config` checks both) and run `deploy` again. If cells move, change `COLS`/`ROWS` or the cell order in `config/richmenu.js` too.
