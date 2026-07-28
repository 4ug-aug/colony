# popover

2026-07-28, transformation engine for legacy `new-york` style, migrated to Base UI.

## Changed

- `src/components/ui/popover.tsx`: mapped Content to Portal → Positioner → Popup and rewired Title to the Base UI primitive.
- `src/features/members/members-panel.tsx`, `src/features/shell/room-sidebar.tsx`: migrated trigger consumers to `render`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` is clean for this component's files.

## Left alone

- `PopoverAnchor` remains a plain exported passthrough because Base UI has no equivalent part; it is unused here.

## Behavior changes

- Base UI uses transition-state attributes instead of Radix open/closed animation attributes.
- PopoverAnchor is inert and must be revisited if a consumer starts using it.

## Verify by hand

Open room creation and members popovers, test outside click/Escape/focus return, and confirm right/start alignment.
