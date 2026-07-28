# avatar

2026-07-28, transformation engine for legacy `new-york` style, migrated to Base UI.

## Changed

- `src/components/ui/avatar.tsx`: rewired Avatar, Image, and Fallback to `@base-ui/react/avatar`; preserved local styling.
- `src/components/avatar.tsx`: migrated the hover-card trigger consumer to `render`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` is clean for this component's files.

## Left alone

- `AvatarBadge`, `AvatarGroup`, and `AvatarGroupCount` remain plain local markup.
- No non-radix components were changed.

## Behavior changes

- Base UI's avatar image delay prop is `delay` rather than Radix's `delayMs`; no current consumer used it.

## Verify by hand

Load avatars with and without images, confirm fallback rendering, and check the hover card still opens from an avatar.
