import './styles.css';
import { FeatureRegions } from '../shared/regions';
import { ErrorBoundary } from './ErrorBoundary';
import { RuntimeHost } from './RuntimeHost';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ImportExperiment } from './ImportExperiment';
import { mountExperiment } from '../features/imports/controller';
import '../features/imports/styles.css';
flushSync(() =>
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <ImportExperiment />
      <FeatureRegions />
      <RuntimeHost start={mountExperiment} />
    </ErrorBoundary>,
  ),
);
