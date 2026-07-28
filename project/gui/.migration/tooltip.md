# tooltip

2026-07-28, transformation engine for legacy `new-york` style, migrated to Base UI.

## Changed

- `src/components/ui/tooltip.tsx`: mapped Provider delay, Portal → Positioner → Popup, and Arrow to Base UI; migrated state/animation hooks.
- `src/components/ui/sidebar.tsx`: migrated TooltipProvider from `delayDuration` to `delay` and internal trigger composition to `render`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` is clean for this component's files.

## Left alone

- Tooltip usage remains wrapped by the existing project provider.

## Behavior changes

- `disableHoverableContent` has no Base UI equivalent; no current consumer used it.

## Verify by hand

Hover collapsed sidebar controls, confirm the default delay/arrow positioning, keyboard focus, and dismissal behavior.
