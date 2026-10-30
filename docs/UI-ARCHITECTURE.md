# React / TypeScript UI architecture

This branch migrates the complete browser UI to React and TypeScript. It preserves the current product design and local-server protocol. Server modules, sending, pacing, suppression, workbook processing, Firebase synchronization, and saved customer data keep their existing implementations.

## Source ownership

```text
src/ui/
  app/
    main.tsx                       Main application entry
    *-entry.tsx                    Standalone experiment entries
    App.tsx, RuntimeHost.tsx        Stable page tree and mounted resource lifetime
    ErrorBoundary.tsx              Recoverable rendering failure screen
    routes.ts, navigation.ts       Typed existing hash routes
    layout/                        Sidebar, title bar, drawers and shell styles
    runtime/                       Bootstrap state rendering, controls and polling
  features/
    campaigns/                     Upload and campaign configuration
    catalog/                       Release catalog and local notes
    conversations/                 Inbox, capture setup, reply assistant, mailroom
    dashboard/                     Overview and carrier activity
    drawer/                        Lead and tracking inspector interactions
    history/                       Send reporting, filters, review and exports
    imports/                       Mapping, reviewed revisions, activation and undo
    leads/                         Search, selection, pagination and preview
    live-activity/                  Runner telemetry and event history
    settings/                      Mailboxes, pacing, Firebase and recovery
    suppression/                   Do Not Contact controls
    templates/                     Template library, editor and preview
    tracking/                      Signals, deliverability, seed tests and domain checks
  design-system/
    tokens.css                     Existing colors, typography, radii and transitions
    global.css, primitives.css     Foundations and shared component styles
    primitives.tsx                 Ref-forwarding native controls, panel and badge
  shared/
    api.ts, types/                 HTTP boundary, DTOs and reusable utility types
    dom-elements.ts, dom.ts        Typed inventory of native control IDs
    events.d.ts                    Typed cross-feature event details
    session.ts                    Shared frontend session, never persisted by the UI
    lifecycle.ts                  Requests, timers and listener disposal
    regions.tsx                   React portal store for dynamic content
    utils.ts, styles/              Shared formatting and presentation
  build.mjs                       Three bundled entries; existing public URLs retained
```

## React ownership and compatibility

Pages and their uncontrolled native forms stay mounted when navigating. This retains drafts, selections, focus handling, modal behavior and settings edits while background polling continues. Routes use the existing hashes, including `#activity` for send history and the fallback to `#dashboard`.

Feature adapters are TypeScript modules. They coordinate the existing native fields and workflow transitions. All generated markup is JSX rendered by React. Dynamic tables, thread messages, option lists and inspectors are portals managed by `FeatureRegions` and `useSyncExternalStore`. A replacement increments the region's revision to retain the former replacement/focus semantics. Clipboard feedback snapshots native content as React nodes. There is no `innerHTML`, `insertAdjacentHTML`, `dangerouslySetInnerHTML`, string-evaluated event handler, or concatenated script path.

Keep React-owned page structure stable while an adapter owns its native fields. Do not add state-driven rerenders to a page that would overwrite adapter-managed fields. New isolated features can use normal React hooks and props; replace the relevant adapter as a complete unit when moving existing fields to controlled state. Do not let both systems control the same value or child list.

`RuntimeHost` starts adapters after the initial commit. Its generation check prevents a discarded Strict Mode mount from installing resources. `UIScope` owns event subscriptions, native handlers, requests, polling and debounces; unmount aborts/cancels them. The rendering error boundary gives the operator a reload path. The API client preserves the `X-FC-Request` header and server-side validation.

The approval dialog retains the draft ID, version and conversation context that the operator opened. Background evidence refreshes do not replace that review snapshot or clear its confirmation. Approval submits those exact versions, allowing the unchanged server to reject stale evidence. A fresh review uses the latest version. Copy and reported-sent checks still use the existing backend gates.

## Types and design system

`tsconfig.json` enables strict checking, unused-local/parameter checks, explicit overrides, isolated modules and consistent casing. UI sources have no explicit `any` or TypeScript suppression directives. API DTOs describe the existing HTTP boundary; runtime business validation remains on the server. Update the relevant DTO whenever its owning response changes. Generic decoding at the HTTP boundary is a type assertion, not a replacement for server validation.

Use primitives from `design-system/primitives` so refs and native semantics remain available. Inputs use `defaultValue`/`defaultChecked` while an adapter owns the field. Buttons retain their existing form submission types. Native dialogs keep keyboard/Escape behavior. Color, radius, typography and transition values retain the existing CSS token definitions; this migration is not a visual redesign.

## Development and packaging

- `npm run typecheck`: all UI TypeScript and TSX.
- `npm run format:ui` / `npm run format:check`: frontend formatting.
- `npm run build:ui`: typecheck and build all three production entries.
- `npm run check:ui`: typecheck, formatting and build.
- `npm start` plus `npm run dev:ui`: local server and rebuild watcher; reload after rebuilding.
- `npm test`: frontend checks followed by the Node/Python regressions.
- `FC_BROWSER_TESTS=1 npm test`: include Chrome tests against temporary synthetic workspaces.
- `npm run bundle`: frontend checks then package sources, generated assets and TypeScript configuration.
- `python3 scripts/bundle.py --output /tmp/outreach-ui-validation.zip`: choose a separate package-validation output after building.

Build output keeps `/app.js`, `/style.css`, `/experiment.js`, `/experiment.css`, `/conversations.js` and `/conversations.css`. The production server's static allowlist and CSP need no changes. There are no CDNs, new runtime services or frontend API endpoints. Node 20+ remains the supported application runtime. The portable archive includes generated assets, source and lockfile, and excludes `.env`, customer data, browser profiles and `node_modules`.

## Regression evidence

`tests/fixtures/ui-contract.json` records the original main UI's control IDs and twelve routes. `tests/ui-react.test.mjs` and `tests/live-activity-ui.test.mjs` verify that inventory, native primitives, safe text rendering, teardown/remount resource ownership, absence of legacy rendering paths, and retained edits across all routes and desktop/mobile widths. The existing integration/browser tests remain the behavior baseline, including import repairs, conversations, stale approvals, read markers, tracking, Firebase diagnostics, send insights, mailbox recovery and wait reset.

Synthetic tests cannot establish that every possible real mailbox/provider state is covered. This branch does not deploy, send customer email, migrate customer state or change installed PCs. Rollout requires the usual per-PC backups, retained `.env`/`data`, dependency installation and real-environment verification.

The visual follow-up and regression repairs are recorded in [UI visual QA](UI-VISUAL-QA.md).
