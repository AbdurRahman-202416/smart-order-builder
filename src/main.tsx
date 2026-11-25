import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { startMockServer } from './mockServer/startMockServer'

// The mock API must be ready before the first request, so start it, then render.
startMockServer().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
