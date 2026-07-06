// textBreath/src/webflow/embed.ts — zero-config browser bundle for Webflow Custom Code Embed.
// Auto-initialises textBreath on any element marked with [data-textbreath], reading options
// from data-* attributes, and exposes a small window.TextBreath API for manual control.
// Line grouping depends on container width, so instances are restarted on viewport resize.
import { applyBreathe, startBreathe, removeBreathe } from '../core/adjust'
import type { BreatheOptions } from '../core/types'

/** Attribute that opts an element in to the breathe animation. */
const OPT_IN_ATTR = 'data-textbreath'

/** Valid wave shapes for data-tb-wave. */
const VALID_WAVES: readonly string[] = ['sine', 'triangle', 'sawtooth']

/** Valid axes for data-tb-axis. */
const VALID_AXES: readonly string[] = ['letter-spacing', 'wdth', 'wght']

/** Valid line-detection strategies for data-tb-line-detection. */
const VALID_LINE_DETECTION: readonly string[] = ['bcr', 'canvas']

/** Valid animation modes for data-tb-mode. */
const VALID_MODES: readonly string[] = ['phase', 'tide']

/** Valid tide travel directions for data-tb-direction. */
const VALID_DIRECTIONS: readonly string[] = ['up', 'down']

/** Valid line-preservation strategies for data-tb-line-preservation. */
const VALID_LINE_PRESERVATION: readonly string[] = ['none', 'clamp']

/** Per-element teardown record so destroy() can stop the loop and restore markup. */
interface Instance {
	/** Stop function returned by startBreathe */
	stop: () => void
	/** Clean HTML snapshot taken before wrapping, for restoration */
	originalHTML: string
}

/** Tracks live instances keyed by their element — WeakMap so removed nodes are GC'd. */
const INSTANCES = new WeakMap<HTMLElement, Instance>()

/** Set of currently managed elements, iterated on resize to re-detect line breaks. */
const TRACKED = new Set<HTMLElement>()

/**
 * Read textBreath options from an element's data-* attributes.
 * Unset (or invalid) attributes fall through to the library defaults.
 *
 * Supported attributes:
 *   data-tb-line-detection    — bcr (default) | canvas (canvas needs @chenglou/pretext)
 *   data-tb-amplitude         — peak deviation (em, or axis units for wdth/wght)
 *   data-tb-period            — seconds per full oscillation cycle
 *   data-tb-phase-offset      — radians of phase shift between adjacent lines (phase mode)
 *   data-tb-wave              — sine | triangle | sawtooth
 *   data-tb-axis              — letter-spacing (default) | wdth | wght
 *   data-tb-mode              — phase (default) | tide
 *   data-tb-direction         — up | down (tide mode only)
 *   data-tb-line-preservation — none (default) | clamp
 *   data-tb-pause-offscreen   — "false" to keep animating off-screen
 *   data-tb-cancel-offscreen  — "true" to fully cancel the rAF loop off-screen
 *
 * @param el - The opted-in element
 */
function readOptions(el: HTMLElement): BreatheOptions {
	const opts: BreatheOptions = {}
	const d = el.dataset

	if (d.tbLineDetection && VALID_LINE_DETECTION.includes(d.tbLineDetection)) {
		opts.lineDetection = d.tbLineDetection as BreatheOptions['lineDetection']
	}
	if (d.tbAmplitude !== undefined) {
		const n = parseFloat(d.tbAmplitude)
		if (!isNaN(n)) opts.amplitude = n
	}
	if (d.tbPeriod !== undefined) {
		const n = parseFloat(d.tbPeriod)
		if (!isNaN(n)) opts.period = n
	}
	if (d.tbPhaseOffset !== undefined) {
		const n = parseFloat(d.tbPhaseOffset)
		if (!isNaN(n)) opts.phaseOffset = n
	}
	if (d.tbWave && VALID_WAVES.includes(d.tbWave)) {
		opts.waveShape = d.tbWave as BreatheOptions['waveShape']
	}
	if (d.tbAxis && VALID_AXES.includes(d.tbAxis)) {
		opts.axis = d.tbAxis as BreatheOptions['axis']
	}
	if (d.tbMode && VALID_MODES.includes(d.tbMode)) {
		opts.mode = d.tbMode as BreatheOptions['mode']
	}
	if (d.tbDirection && VALID_DIRECTIONS.includes(d.tbDirection)) {
		opts.direction = d.tbDirection as BreatheOptions['direction']
	}
	if (d.tbLinePreservation && VALID_LINE_PRESERVATION.includes(d.tbLinePreservation)) {
		opts.linePreservation = d.tbLinePreservation as BreatheOptions['linePreservation']
	}
	if (d.tbPauseOffscreen === 'false') {
		opts.pauseOffscreen = false
	}
	if (d.tbCancelOffscreen === 'true') {
		opts.cancelOffscreen = true
	}

	return opts
}

/**
 * Initialise a single element: snapshot its markup, wrap words into lines, start the wave.
 * Idempotent — re-initialising an element tears down the previous instance first.
 *
 * @param el - Element to animate
 */
function initElement(el: HTMLElement): void {
	// Tear down any previous run so re-init doesn't double-wrap or leak a loop.
	destroy(el)

	const originalHTML = el.innerHTML
	const options = readOptions(el)
	const { lineSpans } = applyBreathe(el, originalHTML, options)
	// Empty result means reduced-motion / e-ink / no text — restore is already handled
	// by the core, but keep tracking so a later resize can retry.
	TRACKED.add(el)
	if (lineSpans.length === 0) {
		INSTANCES.set(el, { stop: () => {}, originalHTML })
		return
	}
	const stop = startBreathe(lineSpans, options)
	INSTANCES.set(el, { stop, originalHTML })
}

/**
 * Stop and restore a single element if it has a live instance.
 *
 * @param el - Element previously initialised
 */
function destroy(el: HTMLElement): void {
	const inst = INSTANCES.get(el)
	if (!inst) return
	inst.stop()
	removeBreathe(el, inst.originalHTML)
	INSTANCES.delete(el)
	TRACKED.delete(el)
}

/**
 * Scan a root for opted-in elements and initialise each one.
 *
 * @param root - Element or document to search (default: document)
 */
function init(root: ParentNode = document): void {
	root.querySelectorAll<HTMLElement>(`[${OPT_IN_ATTR}]`).forEach(initElement)
}

/**
 * Re-detect line breaks and restart every tracked element. Line grouping is width-
 * dependent (words are grouped by their rendered top), so a container resize can move
 * words between lines. initElement restores original HTML first, so this is idempotent.
 */
function restart(): void {
	// Snapshot to an array — initElement mutates TRACKED via destroy/add.
	Array.from(TRACKED).forEach(initElement)
}

// Re-detect lines on viewport resize — the container's width drives line breaks.
// Throttled to one restart per animation frame so a drag-resize doesn't thrash layout.
let resizeRaf = 0
function onResize(): void {
	if (resizeRaf) cancelAnimationFrame(resizeRaf)
	resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; restart() })
}

/**
 * Auto-initialise once the DOM is parsed and web fonts have loaded.
 * Fonts must settle first: per-line grouping depends on final glyph metrics,
 * which shift when a web font swaps in.
 */
function autoInit(): void {
	const run = () => {
		if (document.fonts?.ready) {
			document.fonts.ready.then(() => init()).catch(() => init())
		} else {
			init()
		}
		window.addEventListener('resize', onResize)
	}
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run, { once: true })
	} else {
		run()
	}
}

autoInit()

// Public browser API — assigned to window.TextBreath via the IIFE global name.
export { init, restart, destroy }
