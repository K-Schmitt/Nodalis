import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { onExtensionMessage } from './lib/vscode';
import { useGraphStore } from './stores/useGraphStore';

onExtensionMessage((msg) => {
  if (msg.type === 'refresh') void useGraphStore.getState().fetchGraph();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
