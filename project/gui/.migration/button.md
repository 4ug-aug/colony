# button

2026-07-28, transformation engine for legacy `new-york` style, migrated to Base UI.

## Changed

- `src/components/ui/button.tsx`: replaced Radix Slot with Base UI's real Button primitive; `asChild` is now `render`.
- `src/components/ui/sidebar.tsx`: migrated local button polymorphism to Base UI `render`.
- `src/components/mode-toggle.tsx`, `src/features/members/members-panel.tsx`, `src/features/shell/room-sidebar.tsx`: migrated custom trigger consumers to `render`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` is clean for this component's files.

## Left alone

- Button variants and existing classes were preserved.

## Behavior changes

- None known.

## Verify by hand

Check every button variant, keyboard focus, disabled state, and the mode toggle trigger.
