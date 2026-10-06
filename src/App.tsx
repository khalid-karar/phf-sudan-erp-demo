import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Approvals } from './pages/Approvals'
import { Dashboard } from './pages/Dashboard'
import { NewRequest } from './pages/NewRequest'
import { ProjectDetail, ProjectsList } from './pages/Projects'
import { RequestDetail, RequestsList } from './pages/Requests'
import { Rules } from './pages/Rules'
import { Upcoming } from './pages/Upcoming'

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
          <Route path="*" element={<Upcoming />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}
