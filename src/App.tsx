import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Approvals } from './pages/Approvals'
import { Dashboard } from './pages/Dashboard'
import { NewRequest } from './pages/NewRequest'
import { ProjectDetail, ProjectsList } from './pages/Projects'
import { RequestDetail, RequestsList } from './pages/Requests'
import { Rules } from './pages/Rules'
import { Upcoming } from './pages/Upcoming'
import { Accounts } from './pages/finance/Accounts'
import { Advances } from './pages/finance/Advances'
import { Close } from './pages/finance/Close'
import { Journal } from './pages/finance/Journal'
import { FinanceOverview } from './pages/finance/Overview'
import { Rates } from './pages/finance/Rates'
import { FinanceReports } from './pages/finance/Reports'
import { Vouchers } from './pages/finance/Vouchers'

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<ProjectsList />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/requests" element={<RequestsList />} />
          <Route path="/requests/new" element={<NewRequest />} />
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/settings/approval-rules" element={<Rules />} />
          <Route path="/finance" element={<FinanceOverview />} />
          <Route path="/finance/accounts" element={<Accounts />} />
          <Route path="/finance/vouchers" element={<Vouchers />} />
          <Route path="/finance/advances" element={<Advances />} />
          <Route path="/finance/journal" element={<Journal />} />
          <Route path="/finance/rates" element={<Rates />} />
          <Route path="/finance/close" element={<Close />} />
          <Route path="/finance/reports" element={<FinanceReports />} />
          <Route path="*" element={<Upcoming />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}
