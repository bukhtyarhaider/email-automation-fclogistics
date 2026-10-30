import './styles.css';
import { FeatureRegions } from '../shared/regions';
import { ErrorBoundary } from './ErrorBoundary';
import { RuntimeHost } from './RuntimeHost';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ConversationExperiment } from './ConversationExperiment';
import { mountConversations } from '../features/conversations/controller';
import '../features/conversations/styles.css';
flushSync(() =>
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <ConversationExperiment />
      <FeatureRegions />
      <RuntimeHost start={mountConversations} />
    </ErrorBoundary>,
  ),
);
