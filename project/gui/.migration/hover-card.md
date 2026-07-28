# hover-card

2026-07-28, transformation engine for legacy `new-york` style, migrated to Base UI Preview Card.

## Changed

- `src/components/ui/hover-card.tsx`: mapped Hover Card to Preview Card and added Positioner → Popup composition.
- `src/components/avatar.tsx`: migrated trigger to `render`.
- `src/features/runs/active-agents.tsx`: moved `openDelay`/`closeDelay` from Root to Trigger `delay`/`closeDelay` and migrated `asChild` to `render`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` is clean for this component's files.

## Left alone

- Existing card content and sizing classes were preserved.

## Behavior changes

- Base UI Preview Card's trigger is an anchor by default; existing custom rendered triggers retain their original elements.

## Verify by hand

Hover an avatar and active-agent summary, confirm the 150/100 ms delay, positioning, and keyboard/focus behavior.
