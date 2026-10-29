---
name: layercents
description: Layer by layer, cent by cent. A calm, warm place to work out what a 3D print really costs.
colors:
  night-workshop: "#161619"
  graphite-panel: "#212125"
  raised-graphite: "#2A2A30"
  seam-grey: "#36363D"
  seam-grey-hover: "#4A4A53"
  soft-chalk: "#E9E9EC"
  fog: "#8E8E98"
  layer-gold: "#F2B33D"
  lit-gold: "#F7C96A"
  on-gold: "#161619"
  loss-red: "#E5484D"
  quote-paper: "#FFFFFF"
  ink: "#1B1B1F"
  soft-ink: "#5E5E68"
  paper-rule: "#E3E3E8"
  paper-track: "#F1F1F4"
  print-gold: "#B7791F"
  chart-power: "#12A594"
  chart-wear: "#3E8FD0"
  chart-failures: "#6E74C4"
  chart-labor: "#A3A3B1"
  chart-packaging: "#6C6C7A"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Inter, system-ui, sans-serif"
    fontSize: "4.6rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Bricolage Grotesque, Inter, system-ui, sans-serif"
    fontSize: "clamp(1.55rem, 4.4vw, 2.2rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.12rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.76rem"
    fontWeight: 600
    lineHeight: 1.3
  label-caps:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 500
    letterSpacing: "0.04em"
rounded:
  hairline: "2px"
  sm: "4px"
  control: "5px"
  md: "8px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  inset: "15px"
  lg: "18px"
  xl: "22px"
components:
  button:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.soft-chalk}"
    rounded: "{rounded.control}"
    padding: "6px 13px"
  button-hover:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.lit-gold}"
  button-primary:
    backgroundColor: "{colors.layer-gold}"
    textColor: "{colors.on-gold}"
    rounded: "{rounded.control}"
    padding: "6px 13px"
  button-primary-hover:
    backgroundColor: "{colors.lit-gold}"
    textColor: "{colors.on-gold}"
  button-row:
    textColor: "{colors.soft-chalk}"
    rounded: "{rounded.control}"
    padding: "3px 9px"
  input-number:
    backgroundColor: "{colors.night-workshop}"
    textColor: "{colors.soft-chalk}"
    rounded: "{rounded.control}"
    padding: "6px 11px"
    width: "92px"
  input-text:
    backgroundColor: "{colors.night-workshop}"
    textColor: "{colors.soft-chalk}"
    rounded: "{rounded.control}"
    padding: "6px 9px"
  tab:
    textColor: "{colors.fog}"
    rounded: "{rounded.control}"
    padding: "5px 11px"
  tab-active:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.soft-chalk}"
  panel:
    backgroundColor: "{colors.graphite-panel}"
    rounded: "{rounded.md}"
  panel-heading:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.fog}"
    typography: "{typography.label}"
    padding: "10px 15px"
  chip-badge:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.soft-chalk}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  hero-price:
    textColor: "{colors.lit-gold}"
    typography: "{typography.display}"
    padding: "20px 20px 18px"
  paper-sheet:
    backgroundColor: "{colors.quote-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "36px 40px"
---

# Design System: layercents

## Overview

**Creative North Star: "The Quiet Workshop"**

layercents is the calm corner of a maker's workshop at the end of the day: the printers are humming, the room is dark and warm, and the one thing lit up is the number that matters. The interface should feel peaceful and comfortable to sit with, elegant rather than technical, so that working out money (a task most makers dislike) becomes something people want to come back to. Dark graphite surfaces stack like print layers; gold is the light on the bench, reserved for the answer and the next action.

Density is moderate and desk-first: a two-column calculator beside the slicer, where inputs sit on the left and the answer stays in view on the right. Numbers are always tabular, aligned and unhurried. Paper is the other material: the customer quote and the report are white sheets with ink and a deeper print gold, identical on screen and in the PDF, because they leave the workshop.

The incumbent components are sober and precise (thin seams, 5px corners, dark buttons that light up gold on hover). The stated direction is **warmer and more tactile**: when components are refined, they should gain physical presence (softer corners, fuller fills, a sense of something you can press) without losing the calm. Treat that as the direction of travel, not a reason to restyle untouched screens.

**Key Characteristics:**
- Dark, warm graphite in three tonal layers; no light theme for the app itself.
- Gold is light, not decoration: the recommended price, the one primary action, focus and live state.
- Bricolage Grotesque for the brand voice and the big number; Inter for everything you read and type.
- Tabular figures everywhere money or time appears.
- Paper sheets (quote, report) as a second, printable world.
- Calm motion: values slide, nothing bounces; everything stops under reduced motion.

## Colors

A warm-dark graphite palette lit by a single brand gold, with a white paper set for documents that leave the app.

### Primary
- **Layer Gold** (`layer-gold`): the brand. The logo layers, the one primary button per screen, focus rings, active dots (backup due, agent connected), progress fill, the dropzone when a file hovers over it. Also the Material slice of the cost chart.
- **Lit Gold** (`lit-gold`): gold that is "on": hover state of gold elements, and highlighted text such as the hero price, gains, success notes and links in the footer.
- **On Gold** (`on-gold`): text sitting on a gold fill. Always dark; white does not read on this gold.

### Neutral
- **Night Workshop** (`night-workshop`): page background, and the recessed well inside inputs, dropzones and printer cards.
- **Graphite Panel** (`graphite-panel`): panels, top bar, stat tiles, the mobile total bar.
- **Raised Graphite** (`raised-graphite`): panel headings, default button fill, active tab, help callouts, table row hover.
- **Seam Grey** (`seam-grey`): every border and divider; **Seam Grey Hover** (`seam-grey-hover`) is the input border on hover.
- **Soft Chalk** (`soft-chalk`): primary text, never pure white.
- **Fog** (`fog`): secondary text, labels, units, hints, inactive tabs.

### Semantic
- **Loss Red** (`loss-red`): real losses and real errors only (a negative margin, a failed import, a failed print, destructive hover on Delete).

### Paper
- **Quote Paper** (`quote-paper`), **Ink** (`ink`), **Soft Ink** (`soft-ink`), **Paper Rule** (`paper-rule`), **Paper Track** (`paper-track`): the customer quote and report sheets.
- **Print Gold** (`print-gold`): the brand gold darkened so it reads on white; bars and logo on paper. The Excel export uses an even darker gold (#9A6514) for the same reason.

### Cost Chart
Each cost layer has its own hue, stacked bottom-up in the ¢ symbol like a print: Material in Layer Gold, then **Power Teal** (`chart-power`), **Wear Blue** (`chart-wear`), **Failure Indigo** (`chart-failures`), **Labor Grey** (`chart-labor`), **Packaging Slate** (`chart-packaging`). These hues live only in the chart and its legend.

### Named Rules
**The Light-on-the-Bench Rule.** Gold marks the answer and the next action. One gold-filled button per screen; everything else is graphite that lights up gold on hover.

**The Calm Warning Rule.** Reminders and "attention" states use a soft gold wash (gold at 7% fill, 42% border), never red. Red means something actually went wrong.

## Typography

**Display Font:** Bricolage Grotesque 700 (with Inter, system-ui)
**Body Font:** Inter 400/500/600 (with system-ui, -apple-system)
**Mono:** ui-monospace stack, only for terminal commands in the Printers tab.

**Character:** Bricolage brings a friendly, slightly crafted personality to the brand name, page titles and the big price; Inter keeps every label, input and table quiet and legible. Tight negative tracking on the display face, none on the body.

### Hierarchy
- **Display** (`display`): the recommended price only. Cents drop to 2rem and the currency to 1rem in Fog, so the whole number reads first. 3.6rem on phones.
- **Headline** (`headline`): page titles (h1) and the brand name in the top bar (at 1.05rem).
- **Title** (`title`): the verdict sentence and other one-line conclusions; printer and section names sit near it at 0.9 to 0.98rem/600.
- **Body** (`body`): everything else, at 15px with 1.45 line height. Prose blocks cap at 40 to 46em.
- **Label** (`label`): panel headings in Fog, sentence case. Field labels are body-size (0.89rem) in Soft Chalk.
- **Label Caps** (`label-caps`): table column headers only, uppercase with 0.04em tracking.

### Named Rules
**The Tabular Money Rule.** Every amount, weight, time and percentage uses `font-variant-numeric: tabular-nums`, right-aligned in tables and inputs.

## Layout

A centered column, max 1060px, with 18px side gutters and 26px top padding. The calculator splits into two equal columns (18px gap); the result column is sticky at the top while the viewport is taller than 880px, and becomes static below that so the save form stays reachable. Under 860px the columns stack and a fixed bottom bar shows cost and price, sliding away once the result panel is on screen. Under 520px the top bar wraps into two rows (brand and currency, then tabs).

Rhythm inside panels: 15px horizontal inset, fields separated by 1px seams with 7px vertical padding. Grids of stat tiles run 4 across, 2 under 700px. Tables drop low-priority columns under 600px rather than scrolling sideways; the hidden facts move into a sub-line under the row name.

Paper sheets are max 900px, A4 with 14mm margins in print, and drop all chrome (`.no-print`).

## Elevation & Depth

Flat by design. Depth comes from tonal layering, not shadows: Night Workshop (the floor and recessed wells) below Graphite Panel (surfaces) below Raised Graphite (headings, active and hovered things). Every surface edge is a 1px Seam Grey line. The only box-shadow in the system is the focus halo on inputs (`0 0 0 2px` gold at 22%).

### Named Rules
**The Layered-Not-Lifted Rule.** A surface reads as higher by being one graphite step lighter, not by casting a shadow. If tactile depth is introduced in a refinement, it should come from fill and edge, and stay subtle.

## Shapes

Gently rounded and consistent. Surfaces (panels, stat tiles, cards, dropzone, paper on screen) use 8px. Controls (buttons, inputs, selects, tabs) use 5px. Pills (filament chips, status badges, Beta tag, tab counters) are fully rounded. Dots are circles (7 to 8px). Callouts (help text, import errors, restore confirmation) have a 2px colored left edge with the left corners square and the right corners at 5px. Chart bars round only their free end (4px).

## Components

### Buttons
Calm and quiet at rest, lit when touched.
- **Shape:** gently rounded (5px), 1px Seam Grey border.
- **Default:** Raised Graphite fill, Soft Chalk text, 0.86rem/500, 6px 13px padding.
- **Hover:** border turns Layer Gold and text Lit Gold; the fill stays.
- **Primary:** Layer Gold fill with On Gold text; hover moves to Lit Gold. One per screen (Save quote, Print / Save as PDF, Download backup).
- **Row buttons:** transparent, 0.78rem, 3px 9px; Delete turns red on hover.
- **Focus:** 2px Layer Gold outline, 2px offset, keyboard only (`:focus-visible`).
- **Disabled:** 50% opacity, wait cursor while busy.

### Inputs / Fields
- **Style:** recessed into Night Workshop, 1px Seam Grey border, 5px corners. Number inputs are 92px wide, right-aligned, tabular, with no spinner arrows (arrow keys still work); a unit in Fog sits after them.
- **Hover:** border Seam Grey Hover.
- **Focus:** border Layer Gold plus a 2px gold halo at 22%; no outline.
- **Help:** each label can carry a round (i) button that opens a callout with a gold left edge.
- **Error:** inline text in Loss Red at 0.8rem.

### Navigation
Top bar on Graphite Panel with a bottom seam: logo and wordmark, then text tabs (Fog, 0.84rem; hover Soft Chalk; active on Raised Graphite), then the currency select pushed right. Tabs can carry a count pill or a gold dot (backup due).

### Cards / Containers
- **Panel:** Graphite Panel, 1px seam, 8px corners, overflow hidden. Its h2 is a Raised Graphite band with a Fog label; a figure can sit on the right of the heading.
- **Stat tile:** same surface, label in Fog above a 1.25rem/600 value.
- **Recessed card:** printer cards and the dropzone sit in Night Workshop inside a panel.

### Chips
Fully rounded. Filament chips are outlined (seam border); status badges are filled tints: gold at 15% for busy, Raised Graphite for idle, red at 14% for errors, always with a text label so color is never the only signal.

### Hero Price (signature)
The answer to the whole calculator: a panel with a faint gold border (35%), a Fog label, the price in Lit Gold Bricolage at 4.6rem with smaller cents and currency, and a Fog line underneath with what you keep.

### Cost Symbol Chart (signature)
The layercents ¢ logo drawn as a stacked chart, filling bottom-up like a print, one hue per cost. Boundaries slide (0.35s ease) when a number changes; an empty track in Raised Graphite keeps the shape readable at zero. 176px, 118px on phones, with a legend of names in Fog and tabular values.

### Paper Sheet (signature)
White sheet with an Ink rule under the header, Print Gold for logo and bars, uppercase small headings in Soft Ink, and tables with ink header rules. What you see is what prints.

## Do's and Don'ts

### Do:
- **Do** keep every color as a variable in `src/index.css` and reference it; never hard-code a hex in a component.
- **Do** keep one gold-filled button per screen and let everything else light up gold on hover.
- **Do** use tabular numerals for every amount, and right-align them.
- **Do** show state with text plus color (badges, verdicts), never color alone.
- **Do** keep motion short and easing-based (0.15 to 0.4s), and disable it under `prefers-reduced-motion`.
- **Do** move toward warmer, more tactile components when refining: softer, fuller, pressable, still calm.

### Don't:
- **Don't** use Bambu Lab green anywhere.
- **Don't** use pure white text on the dark app or put white text on gold.
- **Don't** use Loss Red for reminders or neutral attention; that is the soft gold wash.
- **Don't** add shadows to show elevation; step the graphite instead.
- **Don't** put the cost-chart hues outside the chart and its legend.
- **Don't** make the quote or report depend on dark styles; they must print on white.
