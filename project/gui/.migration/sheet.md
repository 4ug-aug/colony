# sheet

2026-07-28, transformation engine for legacy `new-york` style, migrated to Base UI Dialog.

## Changed

- `src/components/ui/sheet.tsx`: mapped Dialog Overlay/Content to Backdrop/Popup and rewrote side transitions to Base UI transition-state attributes.
- Left alone: `src/components/ui/drawer.tsx` does not exist; vaul/drawer is not part of this migration.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` is clean for this component's files.

## Left alone

- Sheet's local side layout and close button remain unchanged in intent.

## Behavior changes

- Entry/exit animation hooks now use `data-starting-style`/`data-ending-style`.

## Verify by hand

Open mobile sidebar and run activity sheet, verify each side's slide, backdrop dismissal, Escape, title, and focus return.
