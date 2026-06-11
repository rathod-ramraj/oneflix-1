import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initDevToolsGuard } from './utils/devToolsGuard';
import App from './App.jsx';

initDevToolsGuard();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
