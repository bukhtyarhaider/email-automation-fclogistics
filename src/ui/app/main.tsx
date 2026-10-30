import { ErrorBoundary } from './ErrorBoundary';
import { RuntimeHost } from './RuntimeHost';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { FeatureRegions } from '../shared/regions';
import { App } from './App';
import { bootstrap } from './bootstrap';
import './styles.css';
const container = document.getElementById('root');
if (!container) throw new Error('Missing application root.');
flushSync(() =>
  createRoot(container).render(
    <ErrorBoundary>
      <App />
      <FeatureRegions />
      <RuntimeHost start={bootstrap} />
    </ErrorBoundary>,
  ),
);
