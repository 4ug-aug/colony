# project

2026-07-28, whole-project transformation engine for legacy `new-york` style, Base UI runtime migration complete.

## Changed

- `project/gui/package.json`: removed `radix-ui`; Base UI was already declared and is now the active primitive dependency.
- `project/gui/bun.lock`: removed Radix packages and retained Base UI dependency graph.
- `project/gui/components.json`: retained legacy `new-york` style because no supported `base-new-york` registry style exists. The CLI's `base` field is not valid for this legacy style.
- `project/gui/src/components/ui/*.tsx`: migrated every Radix-backed wrapper and local Slot composition listed in the component reports.
- App consumers were swept for `asChild`, tooltip delay, hover-card delay, and select/menu migration props.
- Leftover sweep: no `radix-ui` or `@radix-ui` imports remain; 0 UI wrappers remain on Radix.

## Left alone

- `input.tsx`, `message.tsx`, and `skeleton.tsx` have no Radix dependency.
- `cmdk`, `vaul`, `sonner`, `input-otp`, `react-day-picker`, and `recharts` are intentionally untouched per migration scope; none are used by this GUI wrapper set.

## Behavior changes

- Legacy `new-york` styling is preserved, but future shadcn CLI additions still need manual Base UI migration because the style has no Base UI registry pair.
- Base UI uses Positioner/Popup composition and transition-state attributes for overlays.

## Verify by hand

Run the project and manually exercise dropdown, popover, select, tooltip, hover card, sidebar, sheet, avatar fallback, and custom rendered button paths.

Verification: `bun run typecheck` passed; `bun run build` passed. `bun test` reached 42 passing tests but 24 socket-based tests were blocked by sandbox port-bind permissions.
