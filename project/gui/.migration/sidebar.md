# sidebar

2026-07-28, transformation engine for legacy `new-york` style, migrated local Slot compositions to Base UI rendering.

## Changed

- `src/components/ui/sidebar.tsx`: replaced all local Radix Slot/asChild usages with `useRender`/`mergeProps`; updated the nested TooltipProvider to Base UI's `delay` prop.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` is clean for this component's files.

## Left alone

- Sidebar state, cookies, responsive behavior, and custom data attributes remain local application behavior.

## Behavior changes

- None known.

## Verify by hand

Toggle desktop collapsed/icon mode, open the mobile sidebar, test keyboard shortcut, tooltip visibility, and custom rendered menu links.
