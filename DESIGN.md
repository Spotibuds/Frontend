---
name: Spotibuds
description: A restrained dark interface that puts music, artwork, and listening controls first.
colors:
  primary: "#b5a0eb"
  primary-hover: "#cbb8f1"
  primary-foreground: "#191321"
  primary-subtle: "#281e36"
  background: "#121315"
  sidebar: "#0c0d0f"
  surface: "#202226"
  player: "#191a1e"
  surface-hover: "#303238"
  border: "#36383e"
  control-border: "#4c4f58"
  foreground: "#f2f0ed"
  muted-foreground: "#afb1b9"
  secondary-text: "#cecfd4"
  destructive-button: "oklch(70.4% 0.191 22.216)"
  destructive-button-hover: "oklch(80.8% 0.114 19.571)"
  error-border: "oklch(63.7% 0.237 25.331)"
typography:
  page-heading:
    fontFamily: '"Segoe UI", sans-serif'
    fontSize: "2rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Segoe UI", sans-serif'
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  card-title:
    fontFamily: '"Segoe UI", sans-serif'
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  navigation:
    fontFamily: '"Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
rounded:
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  dialog: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  control: "12px"
  md: "16px"
  section: "20px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "8px 16px"
  button-destructive:
    backgroundColor: "{colors.destructive-button}"
    textColor: "{colors.sidebar}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "8px 16px"
  button-outline:
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "8px 16px"
  button-ghost:
    textColor: "{colors.secondary-text}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "44px"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "24px"
  navigation-item:
    textColor: "{colors.secondary-text}"
    typography: "{typography.navigation}"
    rounded: "{rounded.lg}"
    padding: "12px"
  dialog:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.dialog}"
    width: "min(100%, 32rem)"
  player:
    backgroundColor: "{colors.player}"
    padding: "12px 20px max(12px, env(safe-area-inset-bottom))"
---

# Design System: Spotibuds

## Overview

This records the implemented refinement of the existing Spotibuds interface. Preserve the name and `public/logo.svg`. Charcoal surfaces recede behind music artwork and track information; muted lavender marks selected listening states and primary actions. Familiar labels and visible controls support browsing, listening, favorites, and playlists.

The system uses a system sans serif, compact task layouts, and tonal depth. This is an extraction from the current implementation, not a claim that every route has adopted every primitive or that live service workflows have been verified.

**Key Characteristics:**

- Artwork and song information lead the content hierarchy.
- One lavender accent sits within a dark neutral palette.
- Controls have readable labels, visible keyboard focus, and restrained motion.
- Persistent playback adapts to compact screens.

## Colors

### Primary

`primary` is muted lavender for primary buttons, favorites, selected listening controls, selection, range controls, and the global focus outline. `primary-hover` lightens the main button on hover. `primary-foreground` provides dark text on lavender. `primary-subtle` is the related dark purple surface token.

**The Single Accent Rule.** Use lavender for action and selected state; keep artwork as the main source of varied color. Error and destructive states retain their functional red treatment.

### Neutral

`background` anchors page content, `sidebar` makes navigation quieter, `surface` groups content, and `player` distinguishes the persistent playback bar. `surface-hover` supports interactive neutral controls. `border` divides major regions; `control-border` gives fields and dialogs a clearer edge. `foreground`, `secondary-text`, and `muted-foreground` distinguish primary information, supporting labels, and metadata.

The frontmatter preserves the source color formats. Its red control colors come from the installed Tailwind theme. The current authority is `src/app/globals.css` and component styles; older color and font definitions in `tailwind.config.ts` should not be used as a new palette.

## Typography

Use the existing `Segoe UI` sans serif stack throughout interface copy. Keep headings in sentence case and let weight and spacing carry hierarchy. Page headings use the `page-heading` token, becoming (1.75rem) below the compact-player breakpoint. Card titles use `card-title`; dialog titles use `title`. Most controls and navigation use the smaller label roles.

Global headings balance wrapping and use tight tracking; paragraphs use pretty wrapping. Supporting page descriptions stop at (65ch). Player metadata uses (12px) text, and elapsed-time labels use (11px) tabular numerals. Avoid expanding those compact metadata sizes into primary reading text.

## Layout

The shared page shell is centered with a maximum width of (1240px) and padding of (32px). Below (768px), its padding becomes (24px 16px). Section headings leave (28px) before content. Reuse the spacing steps in the frontmatter rather than introducing a competing rhythm.

The app header is (64px) high. Navigation is a fixed sidebar: (256px) below the (640px) breakpoint and (288px) from that breakpoint. At (1024px), open navigation reserves (288px) beside the content; narrower layouts use a dismissible navigation dialog. Main content reserves (112px) beneath it for the fixed player.

The player uses three columns: `minmax(0, 1fr) minmax(240px, 1.25fr) minmax(0, 1fr)`, separated by (24px). Below (768px), it becomes track information plus transport controls with an (8px) gap and a full-width seek line below them. Volume, queue, shuffle, and repeat remain available through the expanded player. Preserve safe-area bottom padding.

## Elevation & Depth

Surfaces use tonal separation by default. The card primitive has no shadow or border at rest. Track rows respond with a faint white overlay on hover and keyboard focus within; the current row uses a faint lavender overlay.

Dialogs use the observed shadow (`0 20px 80px #0008`), a control-strength border, and a black backdrop at (70% opacity). Reserve this depth for overlaid tasks. Global keyboard focus uses a (2px) lavender outline with a (3px) offset; the existing `focus-ring` utility additionally applies a Tailwind purple ring and offset.

## Shapes

Use gently curved controls through `lg`, content cards through `xl`, and dialogs through `dialog`. Compact cover artwork uses `md`; expanded artwork uses `xl`. Circular avatars, search fields, and the central playback button use `full`. Preserve square artwork proportions and clip images inside their existing shapes.

## Components

### Buttons

The shared button supports primary, secondary, destructive, outline, and ghost variants. Default and small sizes are (40px) high; the large size is (48px) high with (24px) horizontal padding and (18px) text. Color transitions last (150ms). Loading disables the button and exposes `aria-busy`; disabled states use half opacity. Shared icon buttons are at least (40px × 40px), increasing to (44px × 44px) for coarse pointers.

### Cards / Containers

The card primitive groups content with a charcoal surface and rounded corners. Header, content, and footer use the (24px) inset, with content/footer omitting top padding. Do not wrap every track or minor label in its own card; track collections use rows.

### Inputs / Fields

Fields are (44px) high with a dark background, clear border, and muted placeholder. Hover strengthens the border. Provide a visible label where the field needs one; link errors to the input with `aria-describedby`, mark invalid fields, and keep the error message beside its field. The existing input primitive implements these relationships.

### Navigation

Use the existing logo and concise route labels. Active navigation uses a charcoal surface and white text, with `aria-current="page"`; hover uses the same tonal treatment. Keep Liked Songs discoverable in the navigation. Preserve the skip-to-content link and keyboard behavior of the compact navigation dialog.

### Dialogs

Use the shared Headless UI dialog for named tasks. It is capped at (32rem), with (20px) padding increasing to (24px) from (640px), a visible title, and an accessible close control. Keep content scrollable when the viewport is short. Preserve focus management and Escape dismissal through the shared primitive.

### Music player and track rows

The fixed player keeps track information, play/pause, previous, and next visible. Opening the track area reveals the expanded player; queue opens a separate dialog. Play/pause is a (44px) circular neutral control. Icon actions expose names and pressed states where relevant; position and volume are labeled native range inputs. Track rows are at least (68px) high, with (14px) gaps and (10px 12px) padding; compact rows use (8px) gaps and (8px 0) padding. Keep song titles and artist names legible when space narrows.

State changes should help people act: show loading, unavailable playback, empty queue guidance, and actionable errors where the existing flows provide them. Reduced-motion preferences shorten animation and transition durations to (0.01ms) and disable smooth scrolling.

## Do's and Don'ts

### Do:

- **Do** preserve the existing Spotibuds logo and music artwork.
- **Do** reuse the shared components and current CSS tokens.
- **Do** keep keyboard focus visible and label icon-only actions.
- **Do** retain the expanded player controls on compact screens.
- **Do** distinguish selected, loading, disabled, empty, and error states with text or semantics as well as color.

### Don't:

- **Don't** introduce another decorative accent palette or ornamental gradients.
- **Don't** add shadows to every card or turn every row into a separate container.
- **Don't** hide essential actions exclusively behind hover.
- **Don't** remove reduced-motion handling, safe-area padding, or focus management.
- **Don't** treat screenshots or component snippets as proof of live backend behavior.
