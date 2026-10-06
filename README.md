# Text Breath

[![npm](https://img.shields.io/npm/v/%40overpunch%2Ftextbreath.svg)](https://www.npmjs.com/package/@overpunch/textbreath) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![part of liiift type-tools](https://img.shields.io/badge/liiift-type--tools-blueviolet)](https://github.com/over-punch/type-tools)

Each line of a paragraph oscillates its letter-spacing — or variable font axis — at a phase offset from its neighbours. Two modes: `phase` gives each line a fixed ripple at a staggered point in the cycle; `tide` sends a traveling wave through the paragraph from top to bottom. At low amplitudes it reads as living rather than animated.

![Two paragraphs breathing: in phase mode each line oscillates its letter-spacing at a staggered offset; in tide mode a wave travels down the lines](https://raw.githubusercontent.com/over-punch/TextBreath/main/assets/textbreath-demo.gif?v=2)

<sub>Amplitude exaggerated for the demo (`0.05`) — the `0.012` default is far subtler. Recorded in real time from the built bundle by [`scripts/capture.mjs`](scripts/capture.mjs) (`npm run capture`).</sub>

**[textbreath.com](https://textbreath.com)** · [npm](https://www.npmjs.com/package/@overpunch/textbreath) · [GitHub](https://github.com/over-punch/TextBreath)

TypeScript · Zero dependencies · React + Vanilla JS · [Webflow & Framer](#webflow--framer-no-build-step)

**See the default for yourself:** the live demo at [textbreath.com](https://textbreath.com) starts at `amplitude: 0.012`, with sliders for amplitude, period and phase, both modes, all three axes, and a before/after overlay.

**Why JavaScript?** CSS can't address a rendered line: apart from `::first-line` there is no selector for "line 3 of this paragraph", and where lines break depends on the font, the size and the container width. Text Breath asks the browser where it broke each line, wraps each line in a span, and animates the spans. The text stays in the DOM, and reduced-motion users get no animation at all (see [Accessibility](#performance--browser-support)).

**Best for** a lede, a pull quote or a hero paragraph, not long body copy ([caveats](#performance--browser-support)). **Using Webflow or Framer?** Skip to [Webflow & Framer](#webflow--framer-no-build-step): one script tag, no build step.

---

## Install

```bash
npm install @overpunch/textbreath
```

On a first try, `amplitude={0.03}` makes the effect easy to see (the default `0.012` is meant to be barely perceptible); dial it back once you've seen it working.

---

## Usage

> **Next.js App Router:** this library uses browser APIs. Add `"use client"` to any component file that imports from it.

The quickest path is the React component (or hook): it handles fonts loading, container resizes, reduced motion and cleanup for you. The vanilla API below does the same work by hand.

### Next.js App Router — a complete file

```tsx
// app/components/BreathingIntro.tsx
'use client'

import { BreatheText } from '@overpunch/textbreath'

export default function BreathingIntro({ children }: { children: string }) {
  return (
    <BreatheText as="p" linePreservation="clamp">
      {children}
    </BreatheText>
  )
}
```

Use it from any server component: `<BreathingIntro>Your paragraph text here...</BreathingIntro>`. The server renders a plain paragraph. On the client the hook wraps the lines in a layout effect (before the browser paints) using the line breaks the browser already chose, so words don't move between lines when it starts.

### React component

```tsx
import { BreatheText } from '@overpunch/textbreath'

<BreatheText amplitude={0.012} period={3.5} phaseOffset={0.785} linePreservation="clamp">
  Your paragraph text here...
</BreatheText>
```

`linePreservation="clamp"` constrains each line to its natural width so the breathing effect stays within the line box. Omit it if very small overflow at the line edge is acceptable.

### React hook

```tsx
import { useBreathe } from '@overpunch/textbreath'

// Inside a React component:
const ref = useBreathe({ amplitude: 0.012, period: 3.5, phaseOffset: 0.785 })
return <p ref={ref}>{children}</p>
```

The hook starts the animation loop on mount, re-runs line detection on resize via `ResizeObserver`, and re-runs after fonts load via `document.fonts.ready`. Cleans up on unmount.

### Vanilla JS

`applyBreathe` wraps lines and returns them. `startBreathe` drives the animation loop and returns a stop function.

```ts
import { applyBreathe, startBreathe, removeBreathe, getCleanHTML } from '@overpunch/textbreath'

const el = document.querySelector('p')
const original = getCleanHTML(el)
const opts = { amplitude: 0.012, period: 3.5 }

let { lineSpans } = applyBreathe(el, original, opts)
let stop = startBreathe(lineSpans, opts)

document.fonts.ready.then(() => {
  stop()
  lineSpans = applyBreathe(el, original, opts).lineSpans
  stop = startBreathe(lineSpans, opts)
})

// On a container resize — stop, re-detect lines, restart. Observe the container, not the element:
// the animation changes a shrink-wrapped element's own width, which would re-trigger this forever.
let lastWidth = el.parentElement.clientWidth
const ro = new ResizeObserver(() => {
  const w = el.parentElement.clientWidth
  if (w === lastWidth) return
  lastWidth = w
  stop()
  const { lineSpans: newSpans } = applyBreathe(el, original, opts)
  stop = startBreathe(newSpans, opts)
})
ro.observe(el.parentElement)

// Later — stop the animation loop and restore the DOM:
stop()
ro.disconnect()
removeBreathe(el, original)
```

### Variable-font axes

`letter-spacing` works with any font. `wdth` and `wght` need a variable font that has that axis; the axis moves around the line's own value, so set it in CSS first:

```css
@font-face {
  font-family: 'Merriweather';
  src: url('/fonts/Merriweather.woff2') format('woff2');
  font-weight: 300 900; /* the variable range */
}
.intro { font-family: 'Merriweather', serif; font-variation-settings: 'wdth' 100; }
```

```tsx
<BreatheText className="intro" axis="wdth" amplitude={0.1}>…</BreatheText>
```

To check whether a font has an axis, look at its `fvar` table (for example `ttx -t fvar -o - font.woff2` from fontTools) or drop the font file on [Wakamai Fondue](https://wakamaifondue.com), or check the axes listed on its Google Fonts page. Webflow's and Framer's built-in fonts only animate `wdth`/`wght` if the family is a variable font with that axis.

How far the widest line swings over one cycle, measured in Chromium on a 600 px Merriweather paragraph at 18 px (lines of 72–74 characters; [`scripts/measure.mjs`](scripts/measure.mjs), `npm run measure`):

| Axis | `amplitude` | Peak-to-peak line width change |
|------|-------------|--------------------------------|
| `letter-spacing` | `0.012` (default) | 32 px |
| `letter-spacing` | `0.05` | 133 px |
| `wdth` | `0.012` | 10 px |
| `wdth` | `0.1` | 85 px |
| `wght` | `0.012` | 1 px |

The default suits `letter-spacing`. For `wdth` or `wght`, raise `amplitude` (the textbreath.com demo switches to `0.1` for `wdth` and `0.2` for `wght`), and check the font's axis range: Merriweather's `wdth` runs 87–112.

### TypeScript

```ts
import type { BreatheOptions } from '@overpunch/textbreath'

const opts: BreatheOptions = { amplitude: 0.012, period: 3.5, mode: 'tide' }
```

---

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `amplitude` | `0.012` | Peak change per cycle. Em units for `letter-spacing`, added to the element's own letter-spacing. For `wdth`, the axis oscillates by `± amplitude × 100` around the line's own value (100 if unset); for `wght`, by `± amplitude × 400` around its own weight. Other axes you set are kept. Capped at 0.5. As a feel guide: `0.012` is barely perceptible (the "living, not animated" default); `~0.03–0.05` reads as an obvious shimmer; above that the line-width change becomes pronounced — pair with `linePreservation: 'clamp'` |
| `period` | `3.5` | Seconds per full oscillation cycle |
| `phaseOffset` | `π/4` ≈ `0.785` | Radians of phase shift between adjacent lines. Used in `'phase'` mode only |
| `waveShape` | `'sine'` | `'sine'` \| `'triangle'` \| `'sawtooth'` |
| `pauseOffscreen` | `true` | Pause the rAF loop via `IntersectionObserver` when the element is fully scrolled offscreen. Set to `false` to keep animating at all times |
| `cancelOffscreen` | `false` | Cancel the rAF loop entirely when the element leaves the viewport and restart on re-entry. Saves more CPU than the default flag-based pause. Adds one frame (~16 ms) of delay on resume. Requires `pauseOffscreen: true` |
| `axis` | `'letter-spacing'` | Property to animate: `'letter-spacing'` \| `'wdth'` \| `'wght'` |
| `mode` | `'phase'` | `'phase'` — standing ripple, each line at a fixed phase offset. `'tide'` — wave travels through the paragraph |
| `direction` | `'down'` | Tide travel direction: `'down'` \| `'up'`. Used in `'tide'` mode only |
| `lineDetection` | `'bcr'` | `'bcr'` reads actual browser layout — ground truth, works with any font and inline HTML. `'canvas'` uses `@chenglou/pretext` for arithmetic line breaking with no forced reflow on resize (`npm install @chenglou/pretext`). Falls back to `'bcr'` while pretext loads |
| `linePreservation` | `'none'` | `'none'` — lines breathe freely in width (may overflow container at large amplitudes). `'clamp'` — each line is constrained to its natural width via `max-width` and `overflow-x: hidden`; the breathing effect is contained within the line box with no container overflow. Characters at the trailing edge clip slightly during the wide phase |
| `as` | `'p'` | HTML element to render. *(React component only)* |

---

## API reference

| Export | Description |
|--------|-------------|
| `applyBreathe(el, originalHTML, options?)` | Wrap lines in spans and return `{ lineSpans }`. Call once before `startBreathe`. |
| `startBreathe(lineSpans, options?)` | Start the rAF animation loop. Returns a `stop()` function. |
| `removeBreathe(el, originalHTML)` | Restore the element to its original markup. |
| `getCleanHTML(el)` | Return the element's inner HTML with all injected spans removed. |
| `triangleWave(t)` | Triangle wave utility exported for custom animation drivers. |
| `sawtoothWave(t)` | Sawtooth wave utility exported for custom animation drivers. |
| `useBreathe` | React hook: `(options?, contentKey?) => ref`. Starts on mount, cleans up on unmount, re-detects lines on resize. Pass a `contentKey` that changes when the element's content changes, so it re-reads the new text (`BreatheText` derives one from its children). |
| `BreatheText` | React component. Accepts all `BreatheOptions` plus `as` prop. |
| `BreatheOptions` | TypeScript interface for all options. |
| `BREATHE_CLASSES` | CSS class names injected by the algorithm (`pb-word`, `pb-line`, `pb-probe`). |
| `@overpunch/textbreath/core` | The same vanilla exports (no hook or component), without importing React. |

---

## How it works

Each visual line is wrapped in a `<span>`. In `phase` mode, line `i` is assigned a fixed phase of `i × phaseOffset` radians, and the wave is evaluated at that phase each frame. In `tide` mode, each line's phase advances with both time and its index — the same traveling wave used by Flood Text, but applied to letter-spacing or a variable font axis rather than per-character. Both modes run a `requestAnimationFrame` loop at consistent speed regardless of display refresh rate. The loop is skipped entirely if `prefers-reduced-motion: reduce` is set — `startBreathe` returns a no-op in both the React hook and vanilla JS, so callers get the accessibility guard for free. In React the loop also stops automatically on unmount; in vanilla JS, call the `stop` function returned by `startBreathe` to end it.

![Letter-spacing of each line over one 3.5 s period. In phase mode each line peaks at a different moment; in tide mode the peak moves from line 3 down to line 7, then wraps to the top.](https://raw.githubusercontent.com/over-punch/TextBreath/main/assets/textbreath-waves.svg?v=1)

<sub>Each row is one line of a 7-line paragraph; darker is looser. Sampled every frame in Chromium from `dist/core.js` by [`scripts/measure.mjs`](scripts/measure.mjs).</sub>

**Line break safety:** Line breaks are locked to the browser's natural layout — each `applyBreathe` call starts from the original HTML, detects lines at natural spacing, then locks them with `white-space: nowrap`. Word breaks never change during the animation.

**Width overflow:** Letter-spacing animation causes lines to grow and shrink with the wave. At the default `amplitude: 0.012em` the peak overflow for a 60-character line at 16px is approximately 11px (60 × 0.012 em × 16 px) — typically imperceptible. Measured: a 74-character line at 18 px swings 32 px from narrowest to widest (see the [table above](#variable-font-axes)). At larger amplitudes, use `linePreservation: 'clamp'` to contain the effect within each line box, or add `overflow-x: hidden` to the element's CSS.

---

## Performance & browser support

- **Size:** ~5 kB gzipped, zero runtime dependencies. ESM + CJS dual build, `sideEffects: false`, tree-shakeable. React and `@chenglou/pretext` are optional peer dependencies. The main entry also exports the hook and component, so it imports `react`; without React installed, import the vanilla API from `@overpunch/textbreath/core`.
- **Lines and markup:** each word is wrapped in a plain inline span (spaces stay in the text flow, so the layout is the browser's own) and grouped into locked lines. Lines keep exactly the words the browser put on them (hyphen and `overflow-wrap` breaks, CJK included); justify, `text-indent` and `pre` text are kept. Inline elements, your `<br>`, images and the spaces between elements are kept and the original elements reused, so listeners keep working. A link over two lines becomes one link per line. `getCleanHTML()` returns the original markup. `linePreservation: 'clamp'` clips the widest part of each line's cycle instead of letting it overflow.
- **One animation loop:** all running elements share a single `requestAnimationFrame` loop, which stops itself when an element leaves the page.
- **Reflow cost:** animating `letter-spacing` (the default axis) re-runs layout for the line on every frame. For a few short paragraphs this is negligible, but on very long or numerous blocks it is main-thread work. Measured with Chrome's performance metrics (style + layout + script time per frame, `npm run measure`, headless Chromium on an Apple-silicon Mac while other work was running): one 7-line paragraph cost 0.4 ms per frame; 40 such paragraphs cost 9–15 ms per frame across three runs, enough to drop the frame rate from 120 to 53–78 fps. The `wght` / `wdth` variable-font axes mutate `font-variation-settings` instead, which is cheaper, and `pauseOffscreen` (on by default) skips the loop's work while the element is fully scrolled out of the viewport.
- **Accessibility:** respects `prefers-reduced-motion: reduce` in both React and vanilla — `applyBreathe` leaves the element untouched, and a running animation stops if the setting turns on. The text stays in the DOM inside the line spans, so screen readers read it as before (injected line breaks are `aria-hidden`); copied text includes a line break at each line end.
- **Requirements:** evergreen browsers. Uses `ResizeObserver`, `IntersectionObserver`, `requestAnimationFrame`, and `document.fonts.ready`. Skips animation on e-ink / `(update: slow)` displays. Variable-font axes require a variable font; `letter-spacing` works with any font.
- **Caveats — when not to use it:**
  - Long reading text: the cost grows with the number of animated lines (above), and constant motion in body copy is a lot to ask of readers. It suits a lede, a pull quote or a hero paragraph.
  - Selection and copying: copied text includes a line break at each line end, and a link over two lines becomes one link per line.
  - Lines are locked at the width they had when the effect ran; the hook and the Webflow embed re-run on resize and font load, the vanilla API needs you to (see the example above).
  - With `linePreservation: 'clamp'` the last characters of a line clip during the widest part of the cycle.
  - A pause control: WCAG 2.2.2 (Pause, Stop, Hide) asks for a way to pause motion that starts by itself and runs for more than five seconds next to other content. Reduced motion covers readers who have set it; for everyone else, offer a toggle that calls the `stop` function (vanilla) or renders a plain `<p>` instead of `<BreatheText>` (React).

---

## Webflow & Framer (no build step)

### Webflow

Add one script tag (Site Settings → Custom Code → Footer, or an Embed element), then put `data-textbreath` on any text element (a paragraph or a heading): in the Designer, select it and add it under Element settings → Custom attributes, with the value left empty. Options are `data-tb-*` attributes; anything unset uses the defaults above.

```html
<script src="https://cdn.jsdelivr.net/npm/@overpunch/textbreath@1/dist/textbreath.webflow.min.js"></script>

<p data-textbreath data-tb-mode="tide" data-tb-amplitude="0.02">Your paragraph text here...</p>
```

Attributes: `data-tb-amplitude`, `data-tb-period`, `data-tb-phase-offset`, `data-tb-wave` (`sine` / `triangle` / `sawtooth`), `data-tb-axis` (`letter-spacing` / `wdth` / `wght`), `data-tb-mode` (`phase` / `tide`), `data-tb-direction` (`down` / `up`), `data-tb-line-preservation` (`none` / `clamp`), `data-tb-line-detection` (`bcr` / `canvas`), `data-tb-pause-offscreen="false"`, `data-tb-cancel-offscreen="true"`.

The embed waits for fonts, re-runs on resize and font load, and picks up elements added later (CMS lists, interactions). `window.TextBreath` exposes `init(root?)`, `restart()` and `destroy(el)`. The bundle is 5.8 kB gzipped. Pinning `@1` keeps a future major version from reaching your site unannounced.

### Framer

Insert → Code → New Component, then paste [`src/framer/TextBreath.tsx`](src/framer/TextBreath.tsx). It imports the core from esm.sh (pinned to a published version) and exposes every option in the property panel.

---

## Development

```bash
npm install
npm run test:run     # vitest (happy-dom)
npm run build        # library → dist/
npm run build:webflow
npm run capture      # README GIF (needs ffmpeg); PORT=… pins the local server port
npm run measure      # README chart + the measured numbers quoted above
cd site && npx next build   # textbreath.com (builds against the local package)
```

### `next` in root devDependencies

`package.json` at the repo root lists `next` as a devDependency. This is a **Vercel detection workaround** — not a real dependency of the npm package. Vercel's build system inspects the root `package.json` to detect the framework; without `next` present it falls back to a static build and skips the Next.js pipeline, breaking the `/site` subdirectory deploy.

The package itself has zero runtime dependencies. Do not remove this entry.

---

## Future improvements

- **Multi-axis mode** — animate both `letter-spacing` and a variable font axis simultaneously from a single instance
- **Scroll-phase mode** — tie the wave phase to scroll position rather than time, so the paragraph breathes as the user reads down the page
- **Amplitude envelope** — fade amplitude in on mount and out on unmount for a softer entrance and exit

---

Current version is shown by the npm badge above.
