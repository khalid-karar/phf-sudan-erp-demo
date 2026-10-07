# PHF Sudan ERP — API server

The backend for the Patients Helping Fund (Sudan) ERP. This first phase covers the core that everything else builds on:

- sign-in, roles and permissions
- offices, users and roles administration
- projects with pillars, budget lines and spending ceilings
- spend requests, reallocations and the approval engine
- field activities and field reports, including offline re-sends
- the accounting ledger: chart of accounts, vouchers, cash advances, exchange rates, revaluation, month close and reports
- file attachments: receipts, photos and PDFs on activities, field reports, requests, vouchers and advances
- alerts and notifications: rules, deadlines with an "X days before" warning, in-app inbox, email / WhatsApp / SMS delivery
- patients: the beneficiary register, services received, duplicate detection and statistics
- people: employees with project salary shares, leave, and the monthly payroll run
- supply chain and logistics: item catalogue, stock per store, in-kind receipts, issues to activities, write-offs, shipments between offices, fleet and fuel

Stack: Node 22, NestJS 11, PostgreSQL 16, Drizzle ORM. Everything is plain JavaScript plus PostgreSQL, so nothing extra has to be downloaded on the server.

## Run it locally

```bash
cp .env.example .env              # set DATABASE_URL and JWT_SECRET
npm install
npm run build
npm run db:migrate                # creates the tables and the ledger guards
npm run db:seed                   # demo data: same organisation as the clickable demo
npm run dev                       # http://localhost:3000/health
npm test                          # 123 tests against a real database (phf_erp_test)
```

All seeded demo users sign in with the password `Phf-Demo-2026` (change it with `SEED_PASSWORD`). Their emails are in `../src/data/seed.ts`, for example `finance@phfsudan.org` (Finance & Admin Manager), `m.osman@phfsudan.org` (field officer, Kassala) and `it@phfsudan.org` (system administrator).

## Deploy on the Saudi server

The server needs Docker, and a domain name (e.g. `erp.phfsudan.org`) whose DNS points at it. The same address serves the web app and the API.

```bash
git clone https://github.com/khalid-karar/phf-sudan-erp-demo.git && cd phf-sudan-erp-demo/server
cp .env.example .env              # set DB_PASSWORD, JWT_SECRET, SECRETS_KEY, APP_DOMAIN, BOOTSTRAP_ADMIN_EMAIL (and BOOTSTRAP_SDG_RATE)
docker compose up -d --build      # web app + API + PostgreSQL + nightly backups + HTTPS (Caddy)
docker compose exec api node dist/db/bootstrap.js
```

The last command runs once. It sets up the organisation, the HQ office, the standard roles, the chart of accounts and the approval rules, then prints a temporary password for the administrator. The administrator must change that password at first sign-in.

- **Upgrades:** `git pull && docker compose up -d --build`. Pending migrations are applied when the API starts.
- **Backups:** a compressed dump is written to `./backups` every day, and dumps older than 30 days are deleted. Copy that folder off the server too.
- **Restore a backup:** `docker compose exec -T db pg_restore -U phf -d phf_erp --clean < backups/phf_erp_YYYY-MM-DD.dump`.

## How it works

### Money

Amounts are stored as exact decimals, never floating point:
- USD as `numeric(18,2)`
- SDG as `numeric(20,2)`
- exchange rates as `numeric(14,4)`

The API sends and receives amounts as strings such as `"1836.73"`. Calculations use integer cents (`src/lib/money.ts`).

The books are kept in USD. Every line posted to an SDG cash box or bank also stores the exact SDG amount that moved. That is what makes the monthly revaluation correct.

### The ledger cannot be corrupted

Everything that touches the books goes through one function, `post()` in `src/ledger/posting.ts`. On top of that, the database enforces the rules itself (`migrations/0001_ledger_guards.sql`), so no script or manual SQL can get around them:

- every entry balances (checked at commit) and has at least two lines
- posted entries and lines cannot be edited or deleted; corrections are made with a reversing entry
- header accounts and inactive accounts take no postings
- SDG accounts must carry their SDG amount
- a month that is closed for an office takes no new lines for that office (an advisory lock makes closing and posting wait for each other)

On top of the database rules, the application layer adds a few more:
- SDG lines must carry their SDG amount in the same direction as the USD side
- manual entries can't touch the staff advances account
- manual entries can't push a budget line over its ceiling

### Month close

A month can be closed for an office when all of these hold:
- the month has ended
- advances due in it are settled
- every expense tied to an activity has its field report
- the cash has been counted
- nothing is left to revalue at the month-end rate

### Budgets and ceilings

For each budget line, **available = ceiling − spent − committed − in approval**:

| Term | What it includes |
|---|---|
| ceiling | the original ceiling, plus or minus approved reallocations |
| spent | cash spending posted to expense accounts and tagged with the line |
| committed | approved requests not yet paid, plus open cash advances |
| in approval | pending requests, plus pending reallocations out of the line |

The same check runs at the line, pillar and project level:
- **Hard mode:** anything over a ceiling is blocked.
- **Soft mode:** up to the tolerance percentage over is allowed, with the Executive Director added to the approval chain.

Requests are checked while their project is locked. Two people requesting the last of a line's money at the same moment cannot both get it; a test covers this.

In-kind supplies issued to an activity are shown on the line (`inKind`), but they do not count against the cash ceiling.

### Approvals

An approval rule is a band of amounts plus a chain of roles. The band includes its minimum and excludes its maximum (`[min, max)`), and a rule for a specific office wins over a general one.

The engine enforces the following:
- only the role whose step is pending can act
- office-scoped approvers only act for their own office
- nobody can approve their own request
- a rejection needs a reason

The rule editor flags gaps and overlaps between bands.

### Cash advances and field reports

An advance can only be issued for a field activity. It can only be settled once that activity's field report is in, which is how the timing gap between technical and financial reports is closed.

An advance remembers the currency it was handed out in, the amount and the issue rate. Receipts at settlement are entered in that currency. Settlement:
- books the actual spending to the line, valued at the issue rate
- puts the exact pounds returned back into the office cash box
- pays any top-up at today's rate; a top-up must fit under the line ceiling

Field reports are idempotent by `clientId`. A phone that re-sends the same offline report does not create a duplicate.

### Supply chain and stock

Stock is kept per item per store (an office). Every change is a stock movement, and `stock_levels` has a database check that it can never go negative. Taking stock out is one guarded update, so two people issuing the last cartons at the same moment cannot both succeed.

| Action | Stock | Books (source `stock` / `transfer`) |
|---|---|---|
| Receipt (in-kind replenishment) | + at the receiving store | Dr Inventory, Cr In-kind revenue |
| Issue to an activity | − at the store | Dr item's expense account (tagged to the activity's project and budget line), Cr Inventory |
| Write-off (damage, expiry) | − at the store | Dr item's expense account, Cr Inventory |
| Shipment dispatched | − at the sending store | nothing yet: the goods are on the road |
| Shipment received | + at the receiving store, for what actually arrived | Dr Inventory (receiving office) and Dr expense for any shortage, Cr Inventory (sending office) |

Items are valued at their book value per unit. An in-kind issue shows on the budget line as `inKind` and never counts against the cash ceiling.

Because books move on receipt, **stock value on hand + value of shipments in transit = the inventory account**. A test checks this after every kind of movement.

Only the sending office can dispatch a shipment and only the receiving office can confirm it. A vehicle on a trip is set free when its shipment is received. Quantities are whole units.

The alerts endpoint lists items below their minimum, received batches nearing expiry while the store still holds that item (batches are not tracked separately), and vehicles close to their service mileage.

### People and payroll

Each employee can have shares of their salary charged to project budget lines (for example 60% to one line and 40% to another). Whatever is not allocated is charged to the office with no project.

**Payroll run** (one per month):
- Part months are paid by the day (a joiner or leaver is paid for the days they were employed).
- Approved unpaid leave is not paid; overlapping requests count each day once.
- The employee insurance share (`payrollDeductionPct` in the organisation settings, 8% by default) is withheld.
- Each salary is split by its allocations in pounds, and the last share takes the rounding remainder.
- The entry is Dr Salaries (by office, project and line), Cr Insurance withheld, Cr the SDG cash box or bank (net pay, in pounds). It goes through the same posting path as everything else.

Before posting, every project share is checked against its budget line, pillar and project ceiling, running through all employees. If any would be exceeded, nothing is posted and the response says which lines (change the shares or move money between lines first). `GET hr/payroll/preview` shows the same check beforehand.

A month can be posted once. Two people pressing "post" together take turns, and the second gets a clear "already posted" message. A wrong run is cancelled with **void**, which posts the full reversing entry and frees the month to be run again. Payroll entries cannot be reversed from the journal, so the run and the books never disagree.

Salaries are visible only to people who can edit HR records; people with view access see everything else about an employee. Anyone with a linked employee record can request their own leave. Leave approval needs HR edit access, cannot be done by the requester, and deducts the annual balance (refused if it is short). A future approved leave can be cancelled and the days come back. "On leave" is worked out from approved leave, not stored.

### Patients

The register holds personal data, so every route needs the `patients` permission and office-scoped users only see and change people registered at their own office.

**Duplicates.** When someone is registered, the system compares them with everyone at every office. It warns (`DUPLICATE_SUSPECTED`) when:
- the phone number matches (compared by its last nine digits, so `+249 912 000 111` and `0912000111` are the same), or
- the name matches, or the first two names match, and the birth years are within two years.

Names are compared in a loose form (Arabic variants such as أ/ا, ة/ه, ى/ي and diacritics are treated as the same). The warning lists only what is needed to recognise the person (number, name, birth year, office). The clerk can confirm they are different people and register anyway. Registrations of the same name take turns, so two clerks cannot both slip past the check at the same moment.

**Merging.** A manager can fold a duplicate into the record to keep: services move across, blanks (phone, English name, locality) are filled from the duplicate, the earliest registration date is kept, and the removed number is recorded in the audit log.

**Services.** A service has a type, a date (not in the future, not before registration) and optionally the activity it belongs to, which must be one of the user's own office. Staff can record services for people registered at their own office; numbers run per office (`BEN-KSL-01234`).

**Statistics** (`GET patients/stats`): people registered (women, men, children under 18, over 60, displaced), services by type, by office and by month, and how many different people were served. The parts always add up to the total.

### Alerts and notifications

**Rules.** Each rule watches for one kind of situation, says who to tell and by which channels (in the app, email, WhatsApp, SMS), and can be switched off. Eleven rules come with a new installation and all can be changed, duplicated with another number, or deleted:

| Event | Number it takes |
|---|---|
| A request reaches someone's approval step | |
| A request is stuck with an approver | hours |
| A request is approved, rejected or paid | |
| A deadline is coming | set on each deadline (days before) |
| A deadline is missed | |
| An advance is past its settle-by date | |
| A field report is overdue | days after the activity |
| A budget line is near its ceiling | percent of the ceiling |
| Spending with no field report | days |
| The monthly close is not finished | day of the month |
| Stock is below its minimum | |

**Who is told.** "The person concerned" (the approver at that step, the requester, the deadline's owner role, the office team…) plus any roles and named people the rule lists. An office-scoped role only counts for the office the event is about.

**Deadlines.** Each has a due date, an owner role, and how many days before it to warn (`notifyDaysBefore`). The warning goes out once the due date is within that many days, and a missed deadline raises a critical alert. Marking a recurring deadline done creates the next one (monthly, quarterly or yearly; the 31st becomes the last day of a shorter month) with its own warning.

**The engine.** It runs every five minutes (and a few seconds after a request or payment changes), evaluates every enabled rule, and announces each situation once (so a restart or a second server never repeats an alert). Only one server instance evaluates at a time. `POST notification-rules/run` runs it immediately.

**Delivery.** Each message to each person is queued, and a worker sends it:
- It is claimed first, so two servers never send the same message twice.
- A failure is retried after 1, 5, 30 and 120 minutes, then marked failed with the reason.
- A channel that is off, not set up, or a person with no valid email or mobile number gives a "skipped" entry with the reason, so the log always explains why something did not arrive (`GET deliveries`).
- Email goes through your SMTP server; WhatsApp through the Cloud API with an approved template (two variables: title and text); SMS through Twilio or any HTTPS service. In click-to-chat mode WhatsApp messages are left for a person to send.
- Links inside messages need `APP_URL`.

**Channel passwords** are encrypted (AES-256-GCM) before they are stored and are never sent back to the screen. Set `SECRETS_KEY` and keep it with your backups; without it, `JWT_SECRET` is used, and changing that would make saved passwords unreadable. A test message can be sent from the settings screen with saved or not-yet-saved settings. The SMS service address must be public https (addresses inside the server's network are refused).

### Attachments

Receipts, photos and PDFs can be attached to an activity, a field report, a spending request, a voucher or an advance (`POST attachments`, a multipart form with `file`, `ownerType`, `ownerId` and an optional `note`).

- **Judged by content.** The type is detected from the file's first bytes, so a program renamed `photo.jpg` is refused whatever the browser claims. Allowed: JPG, PNG, WebP, HEIC and PDF, up to `MAX_UPLOAD_MB` (10 by default), 50 files per record.
- **Same visibility as the record.** Uploading needs edit access to the record's module and viewing needs view access. Office-scoped users only reach files on their own office's records, so another office gets "not found", not "forbidden".
- **Removal.** The uploader, or a manager of that module, can remove a file. It is hidden and the removal is in the audit log; the stored bytes are kept.
- **Storage.** Files are stored once per content under `UPLOAD_DIR` (a docker volume), written then renamed so a half-written file is never visible. The compose file's backup service copies new files to `./backups/uploads` every day, next to the database dump. Downloads need the sign-in token, so the app fetches them and shows them from memory.
- Files are not scanned for viruses; they are only ever shown as images or downloaded, never executed.

### Offline Excel template

For offices with weak internet. `GET activities/excel/template?officeId=ksl` downloads that office's workbook (office-limited accounts get their own office's; `sample=1` adds example rows for training). It lists the office's activities still waiting for a report in a dropdown, checks numbers and dates as people type, and carries a hidden stamp with the office and template version. The office fills it in without internet and uploads it later with `POST activities/excel/import` (a multipart form with `file`).

- **Checked row by row.** Each row must name an activity of that office, have a valid date that is not in the future, whole-number counts for men, women and children (not all zero) and a description; the cost is optional. Rows are reported back with the reason in both languages. `?dryRun=1` only checks and saves nothing, so the screen can show a preview first.
- **Good rows go in, bad rows are listed.** One bad row never blocks the others. Each good row is filed as an ordinary field report (marked "via Excel"), through the same path as an online report, so every rule there applies and each filing is in the audit log.
- **Safe to upload twice.** A row's idempotency key is made from the file's contents and the activity number, so re-uploading the same file after a dropped connection reports "duplicate" and files nothing twice. An activity that already has a report from anywhere else is refused with a clear message.
- **Safe to open.** The file must be a real .xlsx within 2 MB, whose table of contents does not claim to unpack into more than 50 MB; at most 200 rows. A template for another office, or an old template version, is refused.
- Needs edit access to Activities. Office-limited accounts can only use their own office's template.

### Monthly report to headquarters

`GET reports/monthly?period=YYYY-MM` returns every number the report needs, computed from the ledger and the operational tables (nothing is typed in): money received and spent in the month, exchange gain or loss, each office's spending, activities, beneficiaries and month-close state, how many expenses are matched to a field report, approval volume and average decision time, each project and pillar against its ceiling (with how much of the project's time has passed), cash received and spent to date, open and overdue advances, mismatches between the technical and financial sides, in-kind supplies received and issued, staff, upcoming deadlines and next month's planned activities. Amounts are exact decimal strings in USD. A first-draft summary is written from the numbers in Arabic and English, and the author can edit it.

- **Draft and approval.** `PUT reports/hq/:period/draft` keeps the summary, challenges and plan text. `POST reports/hq/:period/approve` is for the approver role chosen in the report settings (or a settings manager). Editing the text of an approved report sends it back to draft, so what is sent is what was approved.
- **Delivery settings.** `GET/PUT report-settings` hold, for headquarters and for each project's donor, the recipients, copies, subject and text in both languages (with fields such as `{month}`, `{hq}`, `{org}`, `{sender}`, `{project}`, `{period}`, `{donor}`), whether approval is required and by which role, and which sections to include. `GET reports/delivery?kind=hq|donor&period=&projectId=&lang=` returns them with the fields filled in, ready to pre-fill the "Send by email" window.
- **Send by email.** The app makes the PDF (it already draws Arabic correctly), uploads it as an attachment with owner type `report` and owner id `hq:2026-09` (or `donor:2026-09:<projectId>`), then calls `POST reports/send` with the file's id and the final recipients, subject and text. The server checks that the file is that report's PDF, that approval has been given when required, and that email is set up, then sends it through the configured email account. Every attempt, successful or failed, is kept in the sent log (`GET reports/sent`) with who sent it. A second click within a minute does not send twice; a failed send can be retried.
- Reports cover the whole organisation, so office-limited accounts do not get them.
- **Not done yet:** sending automatically on the chosen day (`autoSendDay` is saved but nothing acts on it), because making the PDF on the server needs a headless browser to draw Arabic well. Until then the person presses the button.

### Permissions

Every route declares the module and access level it needs, e.g. `@Perm('finance', 'edit')`. On every request, the user and their role are reloaded from the database, so deactivating a user or changing a role takes effect immediately.

Office-scoped roles only see and act on their own office's records:
- requests, activities, vouchers and advances
- cash position, journal and trial balance
- month close, payments and manual entries

Reallocations belong to a project, not an office. A field officer can ask for one, and the money stays reserved on the giving line until the Finance Manager and Executive Director decide.

The system always keeps at least one active user who can manage settings, so the organisation cannot lock itself out.

### Security

- Passwords are hashed with argon2id.
- An account locks for 15 minutes after 5 failed sign-ins.
- Access tokens last 15 minutes. Refresh tokens last 30 days and are rotated on each use; re-using an old refresh token signs out that whole session family.
- Users created by an administrator get a temporary password they must change first.
- Sign-in is rate-limited.
- Security headers are set with Helmet, and CORS is restricted to the listed origins.
- Every change is written to `audit_log` in the same transaction as the change itself.
- In production the API refuses to start with a placeholder `JWT_SECRET`.

## API

The base path is `/api/v1`. Send `Authorization: Bearer <accessToken>`.

Errors look like `{ code, message: { ar, en }, details? }`, so the app can show the message in the user's language and react to the `code`.

| Area | Endpoints | Needs |
|---|---|---|
| Sign-in | `POST auth/login`, `auth/refresh`, `auth/logout`, `auth/change-password`, `GET auth/me` | — |
| Organisation | `GET org/settings`, `PUT org/settings` | settings: manage (to change) |
| Offices | `GET offices`, `POST offices`, `PATCH offices/:id` | settings: manage (to change) |
| Roles | `GET roles`, `POST roles`, `PATCH roles/:id`, `DELETE roles/:id` | settings: manage (to change) |
| Users | `GET users`, `POST users`, `PATCH users/:id`, `POST users/:id/reset-password` | settings: manage |
| Projects | `GET projects`, `GET projects/:id` (tree with usage), `POST projects/check` (ceiling check) | projects: view |
| Budget set-up | `POST projects`, `PATCH projects/:id/control`, `PATCH projects/lines/:lineId` | projects: manage |
| Approval rules | `GET approval-rules` (with gap/overlap warnings), `GET approval-rules/preview` | projects: view |
| | `POST`, `PUT`, `DELETE approval-rules` | settings: edit |
| Spend requests | `GET requests`, `GET requests/:id`, `POST requests/:id/decision` | projects: view |
| | `POST requests`, `POST requests/:id/cancel` | projects: edit |
| Reallocations | `GET reallocations`, `POST reallocations/:id/decision` | projects: view |
| | `POST reallocations` | projects: edit |
| Approvals inbox | `GET approvals/inbox` | projects: view, approver role |
| Activities | `GET activities`, `GET activities/:id`, `GET activities/matching` | activities: view |
| | `POST activities`, `POST activities/:id/report` | activities: edit |
| Chart of accounts | `GET finance/accounts` | finance: view |
| | `GET finance/accounts/suggest-code/:parent` | finance: edit |
| | `POST finance/accounts`, `PATCH finance/accounts/:code`, `PUT finance/system-accounts` | finance: manage |
| Journal | `GET finance/journal`, `GET finance/journal/:id` | finance: view |
| | `POST finance/journal` (manual entry) | finance: edit |
| | `POST finance/journal/:id/reverse` | finance: manage |
| Exchange rates | `GET finance/rates` | finance: view |
| | `POST finance/rates` | finance: edit |
| Payments & receipts | `GET finance/vouchers`, `GET finance/awaiting-payment`, `GET finance/cash-position` | finance: view |
| | `POST finance/requests/:id/pay`, `POST finance/receipts` | finance: edit |
| Cash advances | `GET finance/advances`, `GET finance/advances/:id` | finance: view |
| | `POST finance/advances/:id/settle` | finance: edit |
| FX revaluation | `GET finance/revaluation` (preview) | finance: view |
| | `POST finance/revaluation` | finance: manage |
| Month close | `GET finance/close/:period` | finance: view |
| | `PUT finance/close/:period/:office/cash-counted` | finance: edit |
| | `POST finance/close/:period/:office`, `POST finance/close/:period/:office/reopen` | finance: manage |
| Reports | `GET finance/reports/trial-balance`, `GET finance/reports/activities`, `GET finance/reports/budget-vs-actual/:projectId` | finance: view |
| Supply: items | `GET supply/items` | supply: view |
| | `POST supply/items`, `PATCH supply/items/:id` | supply: manage |
| Supply: stock | `GET supply/stock`, `GET supply/moves`, `GET supply/alerts` | supply: view |
| | `POST supply/receipts`, `POST supply/issues`, `POST supply/write-offs` | supply: edit |
| Shipments | `GET supply/shipments`, `GET supply/shipments/:id` | supply: view |
| | `POST supply/shipments`, `POST supply/shipments/:id/dispatch`, `POST supply/shipments/:id/receive` | supply: edit |
| Fleet | `GET logistics/vehicles`, `GET logistics/vehicles/:id`, `GET logistics/consumption` | logistics: view |
| | `POST logistics/vehicles` | logistics: manage |
| | `PATCH logistics/vehicles/:id`, `POST logistics/vehicles/:id/fuel` | logistics: edit |
| People | `GET hr/me` (any signed-in user), `GET hr/employees`, `GET hr/employees/:id` | hr: view |
| | `POST hr/employees`, `PATCH hr/employees/:id` | hr: edit |
| Leave | `GET hr/leave`, `POST hr/leave`, `POST hr/leave/:id/cancel` (own leave, or HR) | signed in |
| | `POST hr/leave/:id/decision` | hr: edit |
| Payroll | `GET hr/payroll`, `GET hr/payroll/preview?period=YYYY-MM` | hr: view |
| | `POST hr/payroll`, `POST hr/payroll/:id/void` | hr: manage |
| Patients | `GET patients`, `GET patients/:id`, `GET patients/stats` | patients: view |
| | `POST patients`, `PATCH patients/:id`, `POST patients/:id/services`, `GET patients/duplicates` | patients: edit |
| | `POST patients/:id/merge` | patients: manage |
| Alerts | `GET notifications`, `GET notifications/unread-count`, `POST notifications/:id/read`, `POST notifications/read-all` (your own) | signed in |
| | `GET notification-rules`, `GET deadlines` | alerts: view |
| | `POST deadlines`, `PATCH deadlines/:id`, `POST deadlines/:id/done` | alerts: edit |
| | `DELETE deadlines/:id` | alerts: manage |
| | `POST/PATCH/DELETE notification-rules` | settings: edit |
| | `POST notification-rules/run` | settings: manage |
| | `GET deliveries`, `GET channels` | settings: view |
| | `PUT channels/:channel`, `POST channels/:channel/test` (`email`, `whatsapp`, `sms`) | settings: manage |
| Offline Excel | `GET activities/excel/template` | activities: view |
| | `POST activities/excel/import` (`?dryRun=1` to only check) | activities: edit |
| Monthly report | `GET reports/monthly`, `GET reports/delivery`, `GET reports/sent`, `GET report-settings` | reports: view (whole-organisation accounts) |
| | `PUT reports/hq/:period/draft`, `POST reports/send` | reports: edit |
| | `POST reports/hq/:period/approve` | reports: edit and the approver role (or settings: manage) |
| | `PUT report-settings` | settings: edit |
| Attachments | `GET attachments?ownerType=&ownerId=`, `GET attachments/:id/file` (`?download=1`) | view access to the record's module |
| | `POST attachments`, `DELETE attachments/:id` (own file, or module manager) | edit access to the record's module |

## Known limits (final review)

Worth knowing before heavy use; none blocks a first deployment.
- **Retries of money documents.** Payments, advances, settlements, payroll and field reports are safe to retry. Receipt vouchers, manual journal entries and stock receipts/issues have no duplicate guard yet, so the app disables the button while sending; a retry after a timeout should be checked in the list first.
- **Large histories.** The app loads the latest 500 requests/activities/stock moves and 5,000 journal lines for its screens. Totals on the dashboard and finance pages are computed from those, so for a long-running installation move them to server-side totals.
- **Excel import** reads the uploaded workbook in memory (2 MB file limit). Only users who can edit activities can upload.
- **Outgoing email/WhatsApp/SMS hosts** are entered by a settings manager and are only lightly validated.
- **Offline photos** are kept in the browser's local storage with the queued report; four compressed photos per report keeps this small, but a nearly full phone can still lose the queue on reload.

## Next phase

These follow the same patterns as the modules above:
- sending the HQ report automatically on a set day (needs a server-side PDF)

The system accounts the ledger needs for stock and payroll (`inventory`, `inkind_revenue`, `salaries`, `payroll_deductions`) are already configured.
