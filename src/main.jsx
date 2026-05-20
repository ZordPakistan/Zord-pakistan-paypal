import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import TrustBar from './components/TrustBar.jsx'
import WhatsAppButton from './components/WhatsAppButton.jsx'
import SEO from './components/SEO.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <ScrollToTop />
        <SEO />
        <App />
        <WhatsAppButton />
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>,
)
