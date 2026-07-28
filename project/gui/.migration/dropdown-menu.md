# dropdown-menu

2026-07-28, transformation engine for legacy `new-york` style, migrated to Base UI Menu.

## Changed

- `src/components/ui/dropdown-menu.tsx`: mapped Dropdown Menu to Base UI Menu, including Portal → Positioner → Popup, group labels, submenu parts, and checkbox/radio indicators.
- `src/components/mode-toggle.tsx`: migrated the trigger from `asChild` to `render`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` is clean for this component's files.

## Left alone

- No context-menu or menubar wrapper exists in this project.

## Behavior changes

- Base UI checkbox and radio menu items default to `closeOnClick={false}`; no such consumers currently exist.

## Verify by hand

Open the mode menu, navigate with arrows/typeahead, select each theme, and verify focus returns to the trigger.
