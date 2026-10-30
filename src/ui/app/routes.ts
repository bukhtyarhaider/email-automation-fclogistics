export const viewNames = [
  'dashboard',
  'leads',
  'campaigns',
  'imports',
  'conversations',
  'templates',
  'live-activity',
  'activity',
  'catalog',
  'tracking',
  'suppression',
  'settings',
] as const;
export type ViewName = (typeof viewNames)[number];
export function resolveView(value: string): ViewName {
  return viewNames.find((view) => view === value) ?? 'dashboard';
}
