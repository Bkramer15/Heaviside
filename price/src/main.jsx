import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
import TradingDashboard from './App.jsx'
import PDUFACalendar from './PDUFACalendar.jsx'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TradingDashboard />
  </StrictMode>,
)
