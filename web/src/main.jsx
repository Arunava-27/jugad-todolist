import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { initTheme } from './lib/theme.js';
import './index.css';

initTheme(); // apply saved theme/accent before first paint

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
