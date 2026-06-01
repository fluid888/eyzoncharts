import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LoadingScreen from './components/LoadingScreen.jsx'

function Root() {
  const [ready, setReady] = useState(false);
  return (
    <StrictMode>
      <LoadingScreen onReady={() => setReady(true)}>
        <App ready={ready} />
      </LoadingScreen>
    </StrictMode>
  );
}

createRoot(document.getElementById('root')).render(<Root />)
