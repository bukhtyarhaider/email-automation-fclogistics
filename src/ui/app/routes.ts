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
export const trackingSections = ['trackingSeedStudio', 'trackingDomainHealth'] as const;
export type TrackingSection = (typeof trackingSections)[number];
export function isTrackingSection(value: string): value is TrackingSection {
  return trackingSections.some((section) => section === value);
}
export function resolveView(value: string): ViewName {
  if (isTrackingSection(value)) return 'tracking';
  return viewNames.find((view) => view === value) ?? 'dashboard';
}
