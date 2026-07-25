import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { DemoEnvironmentGate } from './demo/components/DemoEnvironmentGate';
import { DemoErrorBoundary } from './demo/components/DemoErrorBoundary';
import './index.css';
import './shared/i18n/i18n';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoErrorBoundary>
      <DemoEnvironmentGate>
        <App />
      </DemoEnvironmentGate>
    </DemoErrorBoundary>
  </StrictMode>,
);
