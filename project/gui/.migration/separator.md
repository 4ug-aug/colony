# separator

2026-07-28, transformation engine for legacy `new-york` style, migrated to Base UI.

## Changed

- `src/components/ui/separator.tsx`: switched from Radix Root to callable Base UI Separator and dropped the unsupported `decorative` prop.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` is clean for this component's files.

## Left alone

- Existing orientation and class behavior was preserved.

## Behavior changes

- `decorative` is no longer exposed by the wrapper.

## Verify by hand

Check horizontal and vertical separators in the sidebar and confirm their dimensions and semantics.
