import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { initTheme } from './lib/theme.js';
import { installGlobalErrorReporting } from './lib/errorReporting.js';
import './index.css';

initTheme(); // apply saved theme/accent before first paint
installGlobalErrorReporting(); // catches errors ErrorBoundary can't (outside React's render tree)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
