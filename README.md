# PHF Sudan — Resource Management System (demo)

Clickable frontend demo of an ERP for the Kuwait Patients Helping Fund (Sudan): HQ in Khartoum plus 11 offices.
Everything runs in the browser on sample data; there is no backend yet. **Reset demo** in the top bar restores the starting data.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (Netlify uses netlify.toml)
```

## Modules

Arabic first (RTL) with an English toggle. Every module, page and action is controlled by the user's role, so people only see what they need.

| Module | Pages | Highlights |
|---|---|---|
| Dashboard | — | Both funding streams (cash support to Finance, in-kind replenishment to Supply chain), Sudan map with matching status per office, items needing action, project burn, role-aware “Get started” checklist |
| Projects & spending | Projects, spend requests, new request, awaiting my approval | Project → pillar → line tree, each with a ceiling; available = ceiling − spent − committed − in approval; hard-stop or tolerance mode; reallocations with their own approval chain |
| Field work | Activities, field report (offline), report matching, Excel import | Field reports queue on the device when offline; matching of spending with no report and reports with no spending, with suggested links; Excel template with drop-downs and a validation preview on upload |
| Finance | Overview, chart of accounts, vouchers, cash advances, journal, exchange rates, monthly close, reports | NGO chart of accounts (add/deactivate accounts, map lines to accounts); every voucher, payroll and stock move posts a journal entry tagged with project, line and office; books in USD, SDG revalued at close; trial balance, budget vs actual, cash position |
| Supply chain | Stock, receive supplies, issue stock, items | In-kind receipts post to inventory and in-kind revenue; issues are charged to the activity's project line; low-stock alerts |
| Logistics | Shipments, vehicles & fuel | Shipment board (preparing → in transit → received) with shortage booking; fuel log and consumption |
| Patients | Beneficiary register, statistics | One file per beneficiary with service history linked to activities and projects; duplicate warning on registration; phone numbers hidden from view-only roles; breakdowns by gender, age, office, service |
| Human resources | Staff, leave, payroll | Contracts ending soon; leave approval with balances; payroll split across project lines by allocation and posted by Finance |
| Reports | Monthly HQ report, donor report, sent reports | One-click PDF for HQ Kuwait (finance, projects, activities, beneficiaries, stock, HR, challenges, next month's plan) and **Send by email** using the recipients, subject and body set in Settings |
| Alerts & deadlines | Notifications, deadline calendar | Rule-driven alerts (e.g. X days before a deadline, overdue advances, low stock, missing reports) to the people concerned, in-app and by email/WhatsApp/SMS |
| Settings | Organization, offices, users, roles & permissions, approval rules, notification rules, email/WhatsApp/SMS, report delivery | Fully configurable: create offices, roles with per-module access (none/view/edit/manage) and office or all-office scope, users, approval chains by amount and office, notification rules, one window to set up all three channels with presets and a test button |
| Help centre | — | Step-by-step guide for every page (filtered to the user's role), search, FAQ, glossary, guided tour; a “?” next to every page title opens that page's guide |

## Demo script (about 15 minutes)

Use the user menu (top corner) to switch between demo users. **Reset demo** in the same menu restores the starting data.

1. **First look** as the System administrator (Eng. Khalid): the guided tour starts on first visit. Show the “Get started” checklist, the **?** next to the page title, and **Help centre**. Press **Ctrl K** and type “عهدة”.
2. **Settings → Roles & permissions**: open *Field officer* and show that Finance is set to *none*. Switch to the field officer: Finance is not in the menu. Back as admin, show **Offices**, **Users**, and the **Email, WhatsApp & SMS** window (pick a preset, send a test).
3. **Projects → Project A** as the Finance & Admin Manager: 4 pillars × 10 lines, each with a ceiling. Line 1.1 *Mobile medical days* has only $1,000 left.
4. Switch to the **Field officer (Kassala)** → **New spend request** → *Fill demo example*. The system **blocks it**: the line is short. Click **Request reallocation** and send it.
5. **Finance Manager** → *Awaiting my approval* → approve; **Executive Director** → approve. The ceiling updates. The field officer's request now passes.
6. **Field work → Submit field report** as the field officer: turn on offline mode, submit, show it waiting on the device, go back online and it sends. **Report matching** shows spending with no report and suggested links. **Import from Excel**: download the template and upload it to see the validation preview.
7. **Finance** as the Finance Manager: settle advance ADV-0020 (its field report is in), pay a voucher, post the FX revaluation, then **Reports → Trial balance**: it balances. **Monthly close** shows which offices are blocked and why.
8. **Supply chain** as the Storekeeper: items below minimum; receive in-kind replenishment. As the **Logistics officer**, dispatch and receive a shipment with a shortage.
9. **Human resources** as the HR officer: contracts ending soon, approve a leave request. As the Finance Manager, open **Payroll** and post it: the project shares are charged to their budget lines.
10. **Patients** as the Registrar (Kassala): register someone with a name close to an existing one to see the duplicate warning; open a file and record a service; open **Statistics**.
11. **Reports → Monthly HQ report** as the Finance Manager: pick last month, edit the summary, **Download PDF**, then **Send by email** (recipients and wording from *Settings → Report delivery*). The send appears in **Sent reports**.
12. **Alerts & deadlines**: the bell, the calendar, and *Settings → Notification rules* (e.g. “5 days before the HQ report is due, notify the accountant by email and WhatsApp”).

## Still to build (backend phase)

- Real sign-in, server-side permissions and audit log
- Database and API hosted on the Saudi server; real email/WhatsApp/SMS delivery
- Mobile offline sync against the server; attachments storage

## Notes

- Exchange rates are sample values (rising from about 2,050 to 2,450 SDG per USD over six months).
- Project names, donors, staff names and figures are sample data.
- Fonts are bundled locally (no Google Fonts) so the app works on weak connections.
