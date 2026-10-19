import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App.jsx';

// Build-time only; no server renderer is shipped to the browser.
export function render(pathname, year) {
  return renderToString(<App pathname={pathname} year={year} />);
}
