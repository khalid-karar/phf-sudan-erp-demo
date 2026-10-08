import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LIVE } from './api/http'
import { LiveGate } from './api/LiveGate'
import { Guard } from './components/Guard'
import { Layout } from './components/Layout'
import { Activities, ActivityDetail } from './pages/activities/Activities'
import { FieldReport } from './pages/activities/FieldReport'
import { ImportExcel } from './pages/activities/ImportExcel'
import { Reconciliation } from './pages/activities/Reconciliation'
import { Approvals } from './pages/Approvals'
import { Dashboard } from './pages/Dashboard'
import { Accounts } from './pages/finance/Accounts'
import { Advances } from './pages/finance/Advances'
import { Close } from './pages/finance/Close'
import { Journal } from './pages/finance/Journal'
import { FinanceOverview } from './pages/finance/Overview'
import { Rates } from './pages/finance/Rates'
import { FinanceReports } from './pages/finance/Reports'
import { Vouchers } from './pages/finance/Vouchers'
import { Login } from './pages/Login'
import { NewRequest } from './pages/NewRequest'
import { ProjectDetail, ProjectsList } from './pages/Projects'
import { RequestDetail, RequestsList } from './pages/Requests'
import { Rules } from './pages/Rules'
import { Offices } from './pages/settings/Offices'
import { Organization } from './pages/settings/Organization'
import { Roles } from './pages/settings/Roles'
import { Users } from './pages/settings/Users'
import { NotFound } from './pages/NotFound'
import { HelpCentre } from './pages/Help'
import { Leave, Payroll, Staff } from './pages/hr/Hr'
import { Beneficiaries, PatientStats } from './pages/patients/Patients'
import { Issues, Items, Receipts, Stock } from './pages/supply/Supply'
import { Fleet, Shipments } from './pages/supply/Logistics'
import { DonorReport } from './pages/reports/DonorReport'
import { ExpenditureReport } from './pages/reports/ExpenditureReport'
import { HqReport } from './pages/reports/HqReport'
import { Documents } from './pages/finance/Documents'
import { Procurement } from './pages/supply/Procurement'
import { ProjectsStatement } from './pages/reports/ProjectsStatement'
import { SentReports } from './pages/reports/SentReports'
import { ReportSettings } from './pages/settings/ReportSettings'
import { Calendar } from './pages/alerts/Calendar'
import { Inbox } from './pages/alerts/Inbox'
import { Channels } from './pages/settings/Channels'
import { NotificationRules } from './pages/settings/NotificationRules'

const routes: [string, React.ReactNode][] = [
  ['/', <Dashboard />],
  ['/projects', <ProjectsList />],
  ['/projects/:id', <ProjectDetail />],
  ['/requests', <RequestsList />],
  ['/requests/new', <NewRequest />],
  ['/requests/:id', <RequestDetail />],
  ['/approvals', <Approvals />],
  ['/activities', <Activities />],
  ['/activities/report', <FieldReport />],
  ['/activities/import', <ImportExcel />],
  ['/activities/:id', <ActivityDetail />],
  ['/reconciliation', <Reconciliation />],
  ['/finance', <FinanceOverview />],
  ['/finance/accounts', <Accounts />],
  ['/finance/vouchers', <Vouchers />],
  ['/finance/advances', <Advances />],
  ['/finance/journal', <Journal />],
  ['/finance/rates', <Rates />],
  ['/finance/close', <Close />],
  ['/finance/reports', <FinanceReports />],
  ['/settings/organization', <Organization />],
  ['/settings/offices', <Offices />],
  ['/settings/users', <Users />],
  ['/settings/roles', <Roles />],
  ['/settings/approval-rules', <Rules />],
  ['/settings/notifications', <NotificationRules />],
  ['/settings/channels', <Channels />],
  ['/settings/reports', <ReportSettings />],
  ['/reports/hq', <HqReport />],
  ['/reports/donor', <DonorReport />],
  ['/finance/documents', <Documents />],
  ['/supply/procurement', <Procurement />],
  ['/reports/expenditure', <ExpenditureReport />],
  ['/reports/statement', <ProjectsStatement />],
  ['/reports/sent', <SentReports />],
  ['/supply', <Stock />],
  ['/supply/receipts', <Receipts />],
  ['/supply/issues', <Issues />],
  ['/supply/items', <Items />],
  ['/logistics', <Shipments />],
  ['/logistics/fleet', <Fleet />],
  ['/hr', <Staff />],
  ['/hr/leave', <Leave />],
  ['/hr/payroll', <Payroll />],
  ['/patients', <Beneficiaries />],
  ['/patients/stats', <PatientStats />],
  ['/help', <HelpCentre />],
  ['/alerts', <Inbox />],
  ['/alerts/calendar', <Calendar />],
]

export default function App() {
  const app = (
    <HashRouter>
      <Routes>
        <Route path="/login" element={LIVE ? <Navigate to="/" replace /> : <Login />} />
        <Route
          path="*"
          element={
            <Layout>
              <Routes>
                {routes.map(([path, el]) => (
                  <Route key={path} path={path} element={<Guard>{el}</Guard>} />
                ))}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </HashRouter>
  )
  return LIVE ? <LiveGate>{app}</LiveGate> : app
}
