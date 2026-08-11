# Complete thread rail interactions

Status: ready-for-agent

Type: AFK

User stories: 5–19

## Parent

[Room threads PRD](../PRD.md)

## What to build

Complete the thread surface so it behaves like the existing Room and Run
Activity surfaces across pointer, keyboard, touch, wide, and narrow layouts.
Preserve drafts and scroll position, transition cleanly between roots, and use
the single side surface for nested Run Activity navigation.

## Acceptance criteria

- [ ] **Reply in thread** is available on hover, keyboard focus, and a tap-accessible message action.
- [ ] Wide windows use one right rail and narrow windows use one full-height sheet, without requiring identical Run Activity styling.
- [ ] Selecting another root transitions the current thread out before the next enters.
- [ ] One in-memory draft is preserved per root across rail switching/closing and cleared after successful submission.
- [ ] Incoming replies auto-scroll only near the bottom; otherwise position is preserved and **New replies** jumps down.
- [ ] Opening Run Activity replaces the thread in the same surface, and Back restores the originating thread.
- [ ] Existing app-history Back/Forward behavior restores or closes side-surface state without stacking rails.
- [ ] Pure client-state regression tests cover drafts, navigation, and live-scroll decisions.

## Blocked by

- [01 — Reply to a Room message in a basic thread](./01-human-room-thread.md)
