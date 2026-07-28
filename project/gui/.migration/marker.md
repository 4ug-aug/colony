# marker

2026-07-28, transformation engine for legacy `new-york` style, migrated from Radix Slot to Base UI rendering.

## Changed

- `src/components/ui/marker.tsx`: replaced Slot/asChild with `useRender`/`mergeProps` and `render`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` is clean for this component's files.

## Left alone

- Marker variants and child components remain plain local markup.

## Behavior changes

- None known.

## Verify by hand

Render each marker variant with and without a custom element and confirm separator lines and link focus.
