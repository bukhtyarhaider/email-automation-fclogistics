import { mountLeads } from '../features/leads/controller';
import { mountTemplates } from '../features/templates/controller';
import { mountCampaigns } from '../features/campaigns/controller';
import { mountSettings } from '../features/settings/controller';
import { mountHistory } from '../features/history/controller';
import { mountCatalog } from '../features/catalog/controller';
import { mountDrawer } from '../features/drawer/controller';
import { mountLiveActivity } from '../features/live-activity/controller';
import { mountTracking } from '../features/tracking/controller';
import { mountSuppression } from '../features/suppression/controller';
import { mountNavigation } from './navigation';
import { mountExperiment } from '../features/imports/controller';
import { mountConversations } from '../features/conversations/controller';
import { mountCarrierWorkspace } from '../features/conversations/capture';
import { mountConversationAssistant } from '../features/conversations/assistant';
import { mountMailroom } from '../features/conversations/mailroom';
import { mountBoot } from './runtime/polling';
import { notice } from '../shared/runtime';
import { errorMessage } from '../shared/utils';

export function bootstrap() {
  for (const mount of [
    mountLeads,
    mountTemplates,
    mountCampaigns,
    mountSettings,
    mountHistory,
    mountCatalog,
    mountDrawer,
    mountLiveActivity,
    mountTracking,
    mountSuppression,
    mountNavigation,
    mountExperiment,
    mountConversations,
    mountCarrierWorkspace,
    mountConversationAssistant,
    mountMailroom,
  ])
    mount();
  void mountBoot().catch((error: unknown) =>
    notice(`Could not start the UI: ${errorMessage(error)}`),
  );
}
