import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { MatchNotificationProvider } from './context/MatchNotificationContext';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider><MatchNotificationProvider><App /></MatchNotificationProvider></AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
