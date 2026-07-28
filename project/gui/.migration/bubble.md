# bubble

2026-07-28, transformation engine for legacy `new-york` style, migrated to Base UI.

## Changed

- `src/components/ui/bubble.tsx`: replaced Radix Slot with `useRender`/`mergeProps`; `asChild` is now `render`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` is clean for this component's files.

## Left alone

- Bubble layout and variants remain local markup and CVA styles.

## Behavior changes

- None known.

## Verify by hand

Render default, aligned-end, link, and custom rendered bubble content and confirm classes/focus behavior.
