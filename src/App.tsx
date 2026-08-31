import { Navigate, Route, Routes } from 'react-router-dom'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { DailyPlanPage } from './pages/DailyPlanPage'
import { LoginPage } from './pages/LoginPage'
import { OperatorBoardPage } from './pages/OperatorBoardPage'
import { RobotSelectionPage } from './pages/RobotSelectionPage'
import { StaffPlannerPage } from './pages/StaffPlannerPage'
import { SupervisorHomePage } from './pages/SupervisorHomePage'
import { WeeklyPlannerPage } from './pages/WeeklyPlannerPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/supervisor" element={<SupervisorHomePage />} />
      <Route path="/robots" element={<RobotSelectionPage />} />
      <Route path="/robots/:robotId/operator" element={<OperatorBoardPage />} />
      <Route path="/robots/:robotId/day" element={<DailyPlanPage />} />
      <Route path="/planner/weekly" element={<WeeklyPlannerPage />} />
      <Route path="/planner/staff" element={<StaffPlannerPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
