---
name: Home HQ
description: A family's always-on kitchen dashboard on a 1280x800 Android photo frame, read from across the room.
colors:
  silver-paper: "#EEF0F1"
  silver-pressed: "#E2E5E7"
  card-white: "rgba(255, 255, 255, .88)"
  raise-white: "#FFFFFF"
  walnut-ink: "#2A2018"
  walnut-ink-2: "#55483D"
  walnut-mute: "#6E6054"
  hairline: "#D8D3CD"
  copper: "#C2410C"
  on-copper: "#FFFFFF"
  copper-on-photo: "#FF8A57"
  amber-ink: "#8A5200"
  evening-paper: "#2A1C14"
  evening-pressed: "#3B2A1F"
  evening-card: "rgba(255, 205, 165, .085)"
  evening-ink: "#FBF6EF"
  evening-ink-2: "#E3D3C2"
  evening-mute: "#C2AD98"
  evening-hairline: "rgba(255, 220, 190, .16)"
  evening-copper: "#FF8A57"
  on-evening-copper: "#2B2420"
  person-fauzan: "#2D5BFF"
  person-amanda: "#E4007C"
  person-family: "#7A6A5D"
typography:
  display:
    fontFamily: "Instrument Serif, Noto Serif, Georgia, serif"
    fontSize: "168px"
    fontWeight: 400
    lineHeight: 0.78
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Instrument Serif, Noto Serif, Georgia, serif"
    fontSize: "52px"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Instrument Serif, Noto Serif, Georgia, serif"
    fontSize: "34px"
    fontWeight: 400
    lineHeight: 1
  item:
    fontFamily: "Archivo, Roboto, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 500
    lineHeight: 1.15
  body:
    fontFamily: "Archivo, Roboto, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.2
  label:
    fontFamily: "Droid Sans Mono, Roboto Mono, ui-monospace, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.01em"
  numeral:
    fontFamily: "Archivo, Roboto, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    fontFeature: "\"tnum\""
    letterSpacing: "-0.01em"
rounded:
  tag: "6px"
  tile: "12px"
  card: "16px"
  toast: "20px"
  sheet: "24px"
  pill: "999px"
spacing:
  gap: "14px"
  pad: "14px"
  card-x: "18px"
  card-y: "16px"
  tap-floor: "48px"
  tap: "64px"
components:
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.walnut-ink}"
    rounded: "{rounded.card}"
    padding: "16px 18px"
  button-solid:
    backgroundColor: "{colors.walnut-ink}"
    textColor: "{colors.silver-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "64px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.walnut-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "64px"
  segment:
    backgroundColor: "transparent"
    textColor: "{colors.walnut-ink-2}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "56px"
  segment-on:
    backgroundColor: "{colors.walnut-ink}"
    textColor: "{colors.silver-paper}"
    rounded: "{rounded.pill}"
  chip:
    backgroundColor: "{colors.silver-pressed}"
    textColor: "{colors.walnut-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "56px"
  pill:
    textColor: "{colors.walnut-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  pill-soon:
    backgroundColor: "{colors.copper}"
    textColor: "{colors.on-copper}"
    rounded: "{rounded.pill}"
  tag-soon:
    backgroundColor: "{colors.copper}"
    textColor: "{colors.on-copper}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "2px 8px"
  rail-item-active:
    backgroundColor: "{colors.raise-white}"
    textColor: "{colors.walnut-ink}"
    width: "76px"
    height: "68px"
  input-field:
    textColor: "{colors.walnut-ink}"
    typography: "{typography.item}"
    rounded: "14px"
    padding: "0 20px"
    height: "68px"
  sheet:
    backgroundColor: "{colors.raise-white}"
    textColor: "{colors.walnut-ink}"
    rounded: "{rounded.sheet}"
    width: "620px"
  toast-error:
    backgroundColor: "{colors.copper}"
    textColor: "{colors.on-copper}"
    rounded: "{rounded.toast}"
    height: "72px"
---

# Design System: Home HQ

## Overview

**Creative North Star: "Silver & Walnut"**

Home HQ is a household object before it is an app. It hangs where the family cooks and is read from across the room, at about 3 m for the clock and 1.5 m for counts and titles, and touched at arm's length with busy hands. The system is built for that distance: big type, calm surfaces, and colour that only appears when it means something. By day the ground is a cool silver with near-white cards and walnut-brown ink. From sunset to 07:00 the clock switches to Walnut Evening: the same layout on a deep, warm brown with cream ink and a brighter copper. Nothing is themed by hand. Both palettes are one token set with two values.

The feel is quiet and legible at 3 m. Instrument Serif carries the voice (the clock, view titles, people's names, empty states in italics), and narrow Archivo carries the facts (times, counts, item names). Cards are near-flat, separated by a hairline and a whisper of shadow by day and by tint alone at night. Lists are ruled rows, not boxed items. Motion is almost absent: a press scales a control a few percent and that's all, because an always-on frame cannot afford animation that never ends.

The page is a fixed 1280×800 stage at 1 CSS px per device pixel (160 ppi), so every size below is a physical size: 16 px is 2.5 mm, the smallest text anywhere.

**Key Characteristics:**
- One token set, two palettes (Silver & Walnut by day, Walnut Evening at night), switched by the clock.
- Serif voice, narrow-sans data, mono labels with a dot.
- Copper means today, selection, or "act soon". Person colours mean who. Everything else is ink and paper.
- Near-flat cards and ruled lists; depth only for things that float (sheets, toasts, banners).
- Nothing below 16 px; nothing tappable below 48 px; primary controls 64 px.

## Colors

A cool silver-and-walnut neutral field with a single copper voice and two person colours.

### Primary
- **Copper** (`copper` by day, `evening-copper` at night): the one accent. It marks today (the Calendar day header, today's month cell, the Meals strip), the selected item when it is also today, counts that need doing (Shopping and Chores totals), and anything time-critical: "Leave in 12 min", rain coming, "Tomorrow" and "Overdue" tags, a finished timer, the now-line. It sits on silver as text and as solid fill with white text.
- **Copper on Photo** (`copper-on-photo`): the same orange lifted for text laid over photographs and the black Photos view, in every theme, because day copper is too dark there.

### Secondary
- **Person colours** (`person-fauzan` blue, `person-amanda` magenta, `person-family` warm grey): identity, never emphasis. They colour event blocks, lane underlines, avatar discs, chore checkboxes and the dots that say who else is in an event. Text on them is white.

### Neutral
- **Silver Paper** (`silver-paper`) and **Evening Paper** (`evening-paper`): the stage ground, with a faint radial light top-left and a copper warmth at the bottom.
- **Silver Pressed** (`silver-pressed`) and **Evening Pressed** (`evening-pressed`): the rail, pressed states and quiet fills such as unselected chips.
- **Card White** (`card-white`) and **Evening Card** (`evening-card`): module cards. At night the card is a warm translucent tint, because the panel greys out low-saturation browns and a white tint read as slate.
- **Raise White** (`raise-white`; `evening-pressed` at night): surfaces that float above the page: sheets, toasts, banners.
- **Walnut Ink, Ink 2, Mute** (`walnut-ink`, `walnut-ink-2`, `walnut-mute`, and their `evening-` counterparts): primary text, secondary text, and tertiary text plus past or inactive items. Mute still clears 4.5:1 on its ground.
- **Hairline** (`hairline`, `evening-hairline`): card edges, row rules, outlines.
- **Amber Ink** (`amber-ink`): only the "Updated N min ago" stale-feed badge.

### Named Rules
**The Copper Means Now Rule.** Copper is spent on today, the current selection, and what needs doing soon. Good news is never copper: "No rain today" is ink, "Rain from 16:00" is copper.

**The Who Not What Rule.** Person colours say whose something is. They never mark status or importance.

**The rgba Rule.** Translucent colours are written `rgba()`, never 4- or 8-digit hex: the frame's WebView rejects those, and `cssTarget: 'chrome61'` exists to stop the minifier producing them.

## Typography

**Display Font:** Instrument Serif (with Noto Serif, Georgia)
**Body Font:** Archivo, self-hosted as static width instances at 62, 70, 75, 80 and 100% (with Roboto, system-ui)
**Label/Mono Font:** Droid Sans Mono (with Roboto Mono)

**Character:** A soft, high-contrast serif for anything you read as a phrase, against a condensed, sturdy grotesque for anything you scan as data. The serif's italic is the house's quiet aside ("*Free* the rest of the day", "*All stocked up.*").

### Hierarchy
- **Display** (Instrument Serif 400, 168 px, line-height 0.78): the Home clock, about 19 mm tall. Ambient and Night use 230–260 px.
- **Headline** (Instrument Serif 400, 52 px): view titles (Groceries, Chores, Meals, Fridge), big counts, sheet titles.
- **Title** (Instrument Serif 400, 34 px): people's names over their lanes, card statements, recipe and column heads, the date under the clock.
- **Item** (Archivo 500, 26 px, line-height 1.15): list rows that are read from a distance: events on Home, shopping and chore items.
- **Body** (Archivo 500, 20 px): everything else read at arm's length: meta lines, buttons, toasts.
- **Label** (Droid Sans Mono 400, 16 px, +0.01em): section labels, each led by a 6 px dot ("● Transit · Gleisdreieck").
- **Numeral** (Archivo 800 at 62% width, tabular): counts and times in data positions; the countdown and big clocks use the serif instead.

### Named Rules
**The 2.5 mm Rule.** Nothing on the page is smaller than 16 px, including avatar initials and badges. `test/type-floor.test.mjs` enforces it for CSS.

**The Static Width Rule.** Archivo is loaded only as the static width/weight pairs in `tokens.css`. The frame ignores variable-font axes, so a weight or width outside those files renders in the fallback.

## Layout

A fixed 1280×800 stage, scaled with a CSS transform on other screens (wider than 16:10 widens the stage, narrower letterboxes). A 76 px rail on the left holds eight sections, the stale-data note and the clock. The content box is 1176×772 inside 14 px padding. Views are absolute layers switched with `content-visibility`; only Calendar's time grid and long lists scroll.

Home never scrolls: a 12-column grid in three rows (236 px, 252 px, then the rest) with a 14 px gap. Row 1 is the clock, weather and transit. Row 2 is "next up" and the people. Row 3 holds equal cards for shopping, fridge, chores and the photo tile, and a disabled view's card drops out so the others widen. List views pair a list with a side panel (Shopping 1fr + 420 px, Fridge 372 px + 1fr). Long lists run in two columns because the stage is too wide for one.

Rhythm is tight inside a group and wider between groups: 14 px gaps, 16×18 px card padding, 48 px minimum row height for anything tappable and 64 px for primary controls.

### Named Rules
**The Fits Or Truncates Rule.** Fixed cards never overflow. When content can grow, the less important part gives way: names truncate with an ellipsis, and tags and counts stay whole. Overflow links such as "+2 more" sit in an existing row, never in a row of their own.

## Elevation & Depth

Tonal layering with a minimal shadow by day and none at night. Cards are separated from the ground by a 1 px inset hairline plus a 1–3 px warm shadow; Walnut Evening drops the shadow and relies on the tint. Real elevation is reserved for things that float over the page and must be dismissed.

### Shadow Vocabulary
- **Card rest** (`box-shadow: 0 1px 3px rgba(70, 45, 25, .10)`): module cards, by day only.
- **Toast** (`box-shadow: 0 18px 40px rgba(0, 0, 0, .25)`): the single bottom toast.
- **Banner** (`box-shadow: 0 16px 40px rgba(0, 0, 0, .22)`): amber alert banners.
- **Sheet** (`box-shadow: 0 30px 80px rgba(0, 0, 0, .35)`): modal sheets, over a 60% black scrim.

### Named Rules
**The Float Earns Shadow Rule.** Only sheets, toasts and banners carry a real shadow. A card that needs to stand out uses copper or a person colour, never a bigger shadow.

## Shapes

Soft, generous rounding that grows with the size of the surface: 6 px tags, 12 px tiles and day cells, 16 px cards, 20 px toasts and banners, 24 px sheets, and full pills for every button, segment, chip and status pill. Circles are kept for avatars, icon buttons and the dots of the label and lane language. Edges are hairlines drawn as inset box-shadows, so borders never change a box's size. Lists use ruled rows, a 1 px rule under each row, rather than separate boxes.

## Components

### Buttons
Quiet, pill-shaped, sized for a thumb.
- **Shape:** full pill (999 px), 64 px tall, 28 px side padding.
- **Solid:** ink fill with paper text, for the one primary action in a sheet.
- **Ghost:** transparent with a hairline, for secondary actions.
- **Press:** scales to 96% instantly, with no transition. Keyboard focus shows a 3 px copper outline offset 2 px, and touch never shows it.
- **Icon buttons:** 64 px circles with a hairline; 52 px inside the Calendar header.

### Segmented controls
- **Style:** a pill track tinted 6% ink with a hairline; segments 56 px tall (46 px in the Calendar header).
- **Selected:** ink fill, paper text, `aria-pressed="true"`. The glass variant (white on 55% black) is used over photos.

### Chips
- **Style:** 56 px pills in the pressed fill; event chips use a 14% tint of the person colour with the avatar at the leading edge.
- **Selected:** ink fill, paper text.

### Status pills and tags
- **Pill:** 40 px, mono label type, 12% ink tint ("Leave in 1 hr 45 min"). Copper fill when it is soon, and copper with "Leave now" when it is due.
- **Tag:** 6 px corners, 16 px. Copper fill with white for "eat it soon"; outline only for "past estimate, check it".
- **Stale badge:** amber ink on a 10% ink tint pill in a card's top-right corner, "Updated 75 min ago".

### Cards / Containers
- **Corner Style:** 16 px.
- **Background:** Card White by day, Evening Card at night.
- **Shadow Strategy:** card rest by day, none at night (see Elevation & Depth).
- **Border:** 1 px inset hairline.
- **Internal Padding:** 16 px top and bottom, 18 px sides; a mono label first, then a serif statement or a count.

### Lists
- **Rows:** ruled, at least 48 px (64–70 px on Shopping, Chores and Fridge), with the name on the left and the time, tag or quantity on the right.
- **Done / past:** muted text and a strikethrough, or a neutral fill in place of the person tint. Never faded with opacity below 4.5:1.

### Inputs / Fields
- **Style:** 68 px tall, 14 px corners, 6% ink tint, hairline; 26 px Archivo text with a mute placeholder.
- **Focus:** the field wrapper shows a 2 px inset copper ring.

### Navigation
- **Rail:** 76 px wide; 68 px items with a 26 px stroke icon over a 16 px label in Ink 2.
- **Active:** raised fill, ink text, a 3 px copper bar on the inner left edge, `aria-current="page"`. Tabs switch on finger-down.
- **Foot:** the stale-data note ("Sample data", "Updated N min ago") and a 30 px serif clock; holding the clock opens the About sheet.

### Sheets
- **Style:** a centred 620 px panel (1020 px for a recipe) on Raise White, 24 px corners, sheet shadow over a 60% scrim, a 64 px round close button top-right.
- **Behaviour:** `role="dialog"`, named by its heading; tapping the scrim closes it. Event sheets lead with a person-coloured band holding a 68 px serif title.

### Photo surfaces (signature)
Photos, Ambient and the Home tile are full-bleed images under a bottom black gradient, with white serif captions and Copper on Photo for the kicker. Images are requested at the width they are shown (640 px for the tile, 1280 px full screen) as JPEG, and the tile only cycles while Home is visible in day mode.

## Do's and Don'ts

### Do:
- **Do** use the token pairs in `tokens.css` and let the theme switch carry both palettes; check every new surface in Silver & Walnut and Walnut Evening.
- **Do** keep text at 16 px or larger and tap targets at 48 px or larger (64 px for primary controls).
- **Do** spend copper only on today, selection and what's due soon (The Copper Means Now Rule).
- **Do** use the serif for phrases and names, and narrow Archivo for times, counts and items.
- **Do** show a stale feed's age with the amber badge rather than hiding the card.
- **Do** write translucent colours as `rgba()` (The rgba Rule).

### Don't:
- **Don't** use opacity to mark past or done items when it drops text below 4.5:1; use Mute instead.
- **Don't** add an animation that never ends (a loading spinner, a pulsing dot, an animated SVG icon): one keeps the frame's cores busy.
- **Don't** use `oklch()`, `color-mix()`, native CSS nesting, `dvh` or 4/8-digit hex: the frame's WebView 106 doesn't support them.
- **Don't** load fonts, images or scripts from third-party hosts in the page; serve them from the Worker.
- **Don't** use a person colour for status, or copper for a person.
- **Don't** give a card a bigger shadow to make it stand out (The Float Earns Shadow Rule).
- **Don't** design a two-finger hold: it opens the kiosk menu.
