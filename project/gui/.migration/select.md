# select

2026-07-28, transformation engine for legacy `new-york` style, migrated to Base UI.

## Changed

- `src/components/ui/select.tsx`: mapped Root, GroupLabel, List, ItemText, ItemIndicator, scroll arrows, Positioner, and Popup to Base UI.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` is clean for this component's files.

## Left alone

- No Radix-only select consumer props were present in app code.

## Behavior changes

- `Select` is now the Base UI root directly; its `onValueChange` callback can receive `null` and event details.

## Verify by hand

Open the workspace invitation-lifetime select, use keyboard/typeahead, choose each option, and verify scroll arrows and focus return.
