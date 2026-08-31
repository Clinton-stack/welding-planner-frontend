import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { PlanningRequestProvider } from './requests/PlanningRequestProvider.tsx'
import { UserProvider } from './users/UserProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <UserProvider>
        <PlanningRequestProvider>
          <App />
        </PlanningRequestProvider>
      </UserProvider>
    </BrowserRouter>
  </StrictMode>,
)
