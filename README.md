# PHF Sudan — Resource Management System (demo)

Clickable frontend demo of an ERP for the Kuwait Patients Helping Fund (Sudan): HQ in Khartoum plus 11 offices.
Everything runs in the browser on sample data; there is no backend yet. **Reset demo** in the top bar restores the starting data.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (Netlify uses netlify.toml)
```

## What milestone 1 covers

| Screen | Shows |
|---|---|
| Dashboard | Both funding streams (cash support to Finance, in-kind replenishment to Supply Chain), Sudan map with matching status per office, items needing action, project burn |
| Projects & budgets | Project, pillar and line tree; ceiling, spent, committed, in approval and available on every line; hard-stop or tolerance mode per project |
| New spend request | Live ceiling check on the line, pillar and project; blocked or extra-approval verdict; predicted approval route |
| Reallocation | Move money between lines with its own approval route; ceilings update once approved |
| Awaiting my approval | Queue for the current role; approve or reject with a note |
| Approval rules | Edit amount bands, office scope and approver order; gap/overlap warnings; rule tester |

Amounts in approval are reserved on the line, so two pending requests cannot both pass over a ceiling.

### Finance (milestone 2, part 1)

| Screen | Shows |
|---|---|
| Overview | Cash at bank, office cash boxes, advances held by staff, unposted FX difference, payment queue, close progress |
| Chart of accounts | NGO account tree with live balances, account statements, add account, budget line → expense account mapping, accounting-equation check |
| Vouchers | Pay approved requests by cash, bank, Bankak or as a staff advance; receipt vouchers for grants and donations; each voucher posts its own journal entry |
| Cash advances | Advances held by staff; settlement is only possible once the activity's field report is in, so technical and financial reports are matched at settlement |
| Journal entries | Every automatic entry with its dimensions (project, line, office) and a balance check |
| Exchange rates | Dated SDG/USD rate log, rate chart, revaluation of SDG balances with one-click FX entry |
| Monthly close | Per-office checklist: due advances settled, every expense has a field report, cash count; then lock the month |
| Financial reports | Trial balance (filter by office or project), budget vs actual, cash position by office |

The ledger is generated from the same sample data as the budgets, so the trial balance balances and budget vs actual ties to the journal.

## Demo script (about 10 minutes)

Use the role switcher (top corner) to play every role.

1. **Dashboard** as the Finance & Admin Manager: the two funding streams, the map (El Fasher, Gedaref and Port Sudan show gaps between field reports and spending), and the action list.
2. **Projects → Project A**: 4 pillars × 10 lines, each with a ceiling. Open pillar 1: line 1.1 *Mobile medical days* has only $1,000 left.
3. Switch to the **Field officer (Kassala)** → **New spend request** → *Fill demo example* (4,500,000 SDG on line 1.1). The system **blocks it**: the line is $837 short.
4. Click **Request reallocation**. The system suggests a line in the same pillar with room to give. Send it.
5. Switch to the **Finance Manager** → *Awaiting my approval* → approve the reallocation. Switch to the **Executive Director** → approve. The line ceiling is updated.
6. Back as the **Field officer** → New request → *Fill demo example* → now **within the ceiling** → send.
7. **Supervisor** approves, then the **Finance Manager** approves and records payment. The amount moves from committed to spent and waits for its field report.
8. **Approval rules** as the Finance Manager: change the 500 USD threshold live, add the Executive Director to a band, or create a Kassala-only rule. Use the tester to show the new route.
9. **Finance → Cash advances** as the Finance Manager: ADV-0020 (Kassala) has its field report, so it can be settled. Open it: the report and the receipts sit side by side; approve, and $90 goes back to the Kassala cash box. ADV-0018 (El Fasher) has no report, so it can't be settled, only reminded.
10. **Finance → Vouchers**: pay an approved request and show the journal entry it will post. **Chart of accounts**: open the Kassala cash box statement. **Reports → Trial balance**: it balances.
11. **Exchange rates**: the SDG lost value this month; post the FX entry. **Monthly close**: Kassala is now green and can be locked; Gedaref and El Fasher are blocked and show why.
12. Optional: on **Project B**, switch to *tolerance* mode to show an over-ceiling request going to the Executive Director instead of being blocked.

## Next milestones

- Activities and offline field reports (mobile), technical–financial matching screen (milestone 2, part 2)
- Excel template download/upload with validation preview
- Alerts and deadlines calendar, donor report
- Supply chain, logistics, HR, beneficiaries

## Notes

- Exchange rates are sample values (rising from about 2,050 to 2,450 SDG per USD over six months).
- Project names, donors, staff names and figures are sample data.
- Fonts are bundled locally (no Google Fonts) so the app works on weak connections.
