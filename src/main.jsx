import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App.jsx';

const root = document.getElementById('root');
const year = Number(root.dataset.year) || new Date().getFullYear();
const app = <App pathname={window.location.pathname} year={year} />;
if (root.dataset.prerendered === 'true') hydrateRoot(root, app);
else createRoot(root).render(app);
