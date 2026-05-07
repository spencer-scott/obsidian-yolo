# `src/styles/` Organization Conventions

## 1. Organize by responsibility, not by "who used it first"

Historically, `panels/smart-space.css` accumulated popover, dropdown, and scrollbar
shared styles that had nothing to do with the SmartSpace panel (simply because SmartSpace
was the first consumer of those styles). This is the classic "named after the first caller"
anti-pattern that forces everyone who comes later to work around it or get tripped up.

**Decision order when adding new styles:**
1. Does it belong to a cross-component **visual system** (popover, button, form, etc.)? ->
   Find or create a dedicated directory (existing: `popover/`).
2. Does it belong to a specific **feature module** (chat, settings, a specific panel under panels/)? ->
   Place it in the corresponding subdirectory.
3. **Do not** put generic styles into `smart-space.css` just because "the feature I am working on right now is SmartSpace."

## 2. Naming Prefixes

- New CSS classes -> always use the `yolo-` prefix.
- Existing `smtcmp-*` -> do not mass-rename (external themes / CSS snippets may target them).
- When an old component is **fully replaced** by a new abstraction, delete the related `smtcmp-*` dead code (delete, not rename).

## 3. Popover / Dropdown Specific Conventions

See the header comment in [`popover/surface.css`](./popover/surface.css) -
it covers visual/sizing separation, variant file ownership, the new-popover checklist, etc.
Read that comment before modifying or adding any popover.

## 4. Build

`styles.css` is the PostCSS output compiled from `index.css` - **do not edit it directly**.
After modifying source files, run `npm run styles:build` (or `npm run styles:watch`).
