# Text Breath

[![npm](https://img.shields.io/npm/v/%40liiift-studio%2Ftextbreath.svg)](https://www.npmjs.com/package/@liiift-studio/textbreath) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![part of liiift type-tools](https://img.shields.io/badge/liiift-type--tools-blueviolet)](https://github.com/Liiift-Studio/type-tools)

Each line of a paragraph oscillates its letter-spacing — or variable font axis — at a phase offset from its neighbours. Two modes: `phase` gives each line a fixed ripple at a staggered point in the cycle; `tide` sends a traveling wave through the paragraph from top to bottom. At low amplitudes it reads as living rather than animated.

![Two paragraphs breathing: in phase mode each line oscillates its letter-spacing at a staggered offset; in tide mode a wave travels down the lines](https://raw.githubusercontent.com/Liiift-Studio/TextBreath/main/assets/textbreath-demo.gif?v=1)

<sub>Amplitude exaggerated for the demo — the `0.012` default is far subtler. Generated from the shipped bundle by [`scripts/capture.mjs`](scripts/capture.mjs).</sub>

**[textbreath.com](https://textbreath.com)** · [npm](https://www.npmjs.com/package/@liiift-studio/textbreath) · [GitHub](https://github.com/Liiift-Studio/TextBreath)

TypeScript · Zero dependencies · React + Vanilla JS

---

## Install

```bash
npm install @liiift-studio/textbreath
```

---

## Usage

> **Next.js App Router:** this library uses browser APIs. Add `"use client"` to any component file that imports from it.

### React component

```tsx
import { BreatheText } from '@liiift-studio/textbreath'

<BreatheText amplitude={0.012} period={3.5} phaseOffset={0.785} linePreservation="clamp">
  Your paragraph text here...
</BreatheText>
```

`linePreservation="clamp"` constrains each line to its natural width so the breathing effect stays within the line box. Omit it if very small overflow at the line edge is acceptable.

### React hook

```tsx
import { useBreathe } from '@liiift-studio/textbreath'

// Inside a React component:
const ref = useBreathe({ amplitude: 0.012, period: 3.5, phaseOffset: 0.785 })
return <p ref={ref}>{children}</p>
```

The hook starts the animation loop on mount, re-runs line detection on resize via `ResizeObserver`, and re-runs after fonts load via `document.fonts.ready`. Cleans up on unmount.

### Vanilla JS

`applyBreathe` wraps lines and returns them. `startBreathe` drives the animation loop and returns a stop function.

```ts
import { applyBreathe, startBreathe, removeBreathe, getCleanHTML } from '@liiift-studio/textbreath'

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

// On resize — stop, re-detect lines, restart:
const ro = new ResizeObserver(() => {
  stop()
  const { lineSpans: newSpans } = applyBreathe(el, original, opts)
  stop = startBreathe(newSpans, opts)
})
ro.observe(el)

// Later — stop the animation loop and restore the DOM:
stop()
ro.disconnect()
removeBreathe(el, original)
```

### TypeScript

```ts
import type { BreatheOptions } from '@liiift-studio/textbreath'

const opts: BreatheOptions = { amplitude: 0.012, period: 3.5, mode: 'tide' }
```

---

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `amplitude` | `0.012` | Peak change per cycle. Em units for `letter-spacing`. For `wdth`, the axis value becomes `100 ± (amplitude × 100)`. For `wght`, it becomes `400 ± (amplitude × 400)`. As a feel guide: `0.012` is barely perceptible (the "living, not animated" default); `~0.03–0.05` reads as an obvious shimmer; above that the line-width change becomes pronounced — pair with `linePreservation: 'clamp'` |
| `period` | `3.5` | Seconds per full oscillation cycle |
| `phaseOffset` | `π/4` ≈ `0.785` | Radians of phase shift between adjacent lines. Used in `'phase'` mode only |
| `waveShape` | `'sine'` | `'sine'` \| `'triangle'` \| `'sawtooth'` |
| `pauseOffscreen` | `true` | Pause the rAF loop via `IntersectionObserver` when the element is fully scrolled offscreen. Set to `false` to keep animating at all times |
| `cancelOffscreen` | `false` | Cancel the rAF loop entirely when the element leaves the viewport and restart on re-entry. Saves more CPU than the default flag-based pause. Adds one frame (~16 ms) of delay on resume. Requires `pauseOffscreen: true` |
| `axis` | `'letter-spacing'` | Property to animate: `'letter-spacing'` \| `'wdth'` \| `'wght'` |
| `mode` | `'phase'` | `'phase'` — standing ripple, each line at a fixed phase offset. `'tide'` — wave travels through the paragraph |
| `direction` | `'down'` | Tide travel direction: `'down'` \| `'up'`. Used in `'tide'` mode only |
| `lineDetection` | `'bcr'` | `'bcr'` reads actual browser layout — ground truth, works with any font and inline HTML. `'canvas'` uses `@chenglou/pretext` for arithmetic line breaking with no forced reflow on resize (`npm install @chenglou/pretext`). Falls back to `'bcr'` while pretext loads |
| `linePreservation` | `'none'` | `'none'` — lines breathe freely in width (may overflow container at large amplitudes). `'clamp'` — each line is constrained to its natural width via `max-width` and `overflow: hidden`; the breathing effect is contained within the line box with no container overflow. Characters at the trailing edge clip slightly during the wide phase |
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
| `useBreathe` | React hook: `(options?) => ref`. Starts on mount, cleans up on unmount, re-detects lines on resize. |
| `BreatheText` | React component. Accepts all `BreatheOptions` plus `as` prop. |
| `BreatheOptions` | TypeScript interface for all options. |
| `BREATHE_CLASSES` | CSS class names injected by the algorithm (`pb-word`, `pb-line`, `pb-probe`). |

---

## How it works

Each visual line is wrapped in a `<span>`. In `phase` mode, line `i` is assigned a fixed phase of `i × phaseOffset` radians, and the wave is evaluated at that phase each frame. In `tide` mode, each line's phase advances with both time and its index — the same traveling wave used by Flood Text, but applied to letter-spacing or a variable font axis rather than per-character. Both modes run a `requestAnimationFrame` loop at consistent speed regardless of display refresh rate. The loop is skipped entirely if `prefers-reduced-motion: reduce` is set — `startBreathe` returns a no-op in both the React hook and vanilla JS, so callers get the accessibility guard for free. In React the loop also stops automatically on unmount; in vanilla JS, call the `stop` function returned by `startBreathe` to end it.

**Line break safety:** Line breaks are locked to the browser's natural layout — each `applyBreathe` call starts from the original HTML, detects lines at natural spacing, then locks them with `white-space: nowrap`. Word breaks never change during the animation.

**Width overflow:** Letter-spacing animation causes lines to grow and shrink with the wave. At the default `amplitude: 0.012em` the peak overflow for a 60-character line at 16px is approximately 11px — typically imperceptible. At larger amplitudes, use `linePreservation: 'clamp'` to contain the effect within each line box, or add `overflow-x: hidden` to the element's CSS.

---

## Performance & browser support

- **Size:** ~3.5 kB gzipped, zero runtime dependencies. ESM + CJS dual build, `sideEffects: false`, tree-shakeable. React and `@chenglou/pretext` are optional peer dependencies — pulled in only if you use the hook/component or the canvas line-detection path.
- **Reflow cost:** animating `letter-spacing` (the default axis) re-runs layout for the line on every frame. For a few short paragraphs this is negligible, but on very long or numerous blocks it is main-thread work. The `wght` / `wdth` variable-font axes mutate `font-variation-settings` instead, which is cheaper, and `pauseOffscreen` (on by default) skips the loop's work while the element is fully scrolled out of the viewport.
- **Accessibility:** respects `prefers-reduced-motion: reduce` in both React and vanilla; injected line spans are `aria-hidden` and the original text is exposed via `aria-label`, so screen readers read the paragraph normally.
- **Requirements:** evergreen browsers. Uses `ResizeObserver`, `IntersectionObserver`, `requestAnimationFrame`, and `document.fonts.ready`. Skips animation on e-ink / `(update: slow)` displays. Variable-font axes require a variable font; `letter-spacing` works with any font.

---

## Dev notes

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
