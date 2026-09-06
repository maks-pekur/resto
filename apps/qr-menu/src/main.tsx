import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource-variable/nunito';
import './styles.css';

// A phone has no console to open, so in dev a boot failure paints itself onto the page
// instead of leaving a white screen. Dropped from production builds with the branch.
if (import.meta.env.DEV) {
  const paint = (message: string): void => {
    const root = document.getElementById('root');
    if (!root) return;
    const pre = document.createElement('pre');
    pre.style.cssText =
      'margin:0;padding:16px;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;color:#b00020;background:#fff';
    pre.textContent = message;
    root.replaceChildren(pre);
  };
  window.addEventListener('error', (event) => {
    paint(`${event.message}\n${event.filename}:${String(event.lineno)}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    paint(String(event.reason instanceof Error ? event.reason.stack : event.reason));
  });
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found.');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
