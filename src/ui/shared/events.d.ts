import type {
  CaptureStatus,
  ConversationDetail,
  ConversationSelection,
} from './types/conversations';
declare global {
  interface WindowEventMap {
    'fc-import-view': CustomEvent<string>;
    'fc-import-activated': CustomEvent<{ campaignId: string }>;
    'fc-capture-status': CustomEvent<CaptureStatus>;
    'fc-conversation-detail': CustomEvent<ConversationDetail>;
    'fc-open-conversation': CustomEvent<ConversationSelection>;
    'fc-conversation-search': CustomEvent<string>;
    'fc-reply-desk-busy': CustomEvent<boolean>;
    'fc-conversation-action-busy': CustomEvent<boolean>;
  }
}
export {};
