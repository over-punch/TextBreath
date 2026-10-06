// breathe/src/core/adjust.ts — framework-agnostic algorithm
import { BREATHE_CLASSES, type BreatheOptions } from './types'

// ─── Pretext (canvas line detection) ─────────────────────────────────────────

type PretextModule = {
	prepareWithSegments: (text: string, font: string) => unknown
	layoutWithLines: (prepared: unknown, maxWidth: number, lineHeight: number) => { lines: { text: string }[] }
}

let _pretext: PretextModule | null = null
let _pretextLoading = false

let _pretextPromise: Promise<void> | null = null

/** Starts (once) loading the optional pretext package; resolves when it is ready or has failed. */
function tryLoadPretext(): Promise<void> {
	if (_pretext !== null) return Promise.resolve()
	if (_pretextLoading && _pretextPromise) return _pretextPromise
	_pretextLoading = true
	// @ts-ignore — optional peer dep
	_pretextPromise = import(/* @vite-ignore */ /* webpackIgnore: true */ '@chenglou/pretext')
		.then((m) => {
			const mod = m as PretextModule & { default?: PretextModule }
			_pretext = typeof mod.prepareWithSegments === 'function' ? mod : (mod.default ?? null)
		})
		.catch(() => {
			_pretextLoading = false
			console.warn('[textbreath] canvas lineDetection requires @chenglou/pretext — falling back to BCR')
		})
	return _pretextPromise
}

type PreparedEntry = { originalHTML: string; prepared: unknown }
const pretextCache = new WeakMap<HTMLElement, PreparedEntry>()

function getCanvasFont(el: HTMLElement): string {
	// The whole computed family list: the browser quotes names that need it ("Source Serif 4").
	const cs = getComputedStyle(el)
	if (cs.fontFamily) return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
	const s = getComputedStyle(el)
	const family = s.fontFamily.split(',')[0].replace(/['"]/g, '').trim()
	return `${s.fontWeight} ${s.fontSize} ${family}`
}

function getLineHeightPx(el: HTMLElement): number {
	const s = getComputedStyle(el)
	const lh = parseFloat(s.lineHeight)
	return isNaN(lh) ? parseFloat(s.fontSize) * 1.2 : lh
}

/** Resolved defaults applied when options are omitted */
const DEFAULTS = {
	amplitude: 0.012,
	period: 3.5,
	phaseOffset: Math.PI / 4,
	waveShape: 'sine' as const,
	axis: 'letter-spacing' as const,
}

/** Inline-block style applied to each synthesised line span */
const LINE_STYLE = 'display:inline-block;white-space:nowrap;'

/**
 * Triangle wave oscillating between -1 and 1 over a period of 1.
 * Input t is a fractional position (any real number).
 *
 * @param t - Fractional time position (period = 1)
 */
export function triangleWave(t: number): number {
	const x = ((t % 1) + 1) % 1 // normalise to [0, 1)
	return x < 0.5 ? 4 * x - 1 : 3 - 4 * x
}

/**
 * Sawtooth wave oscillating between -1 and 1 over a period of 1.
 * Rises linearly from -1 to +1 across each period, then resets sharply.
 * Input t is a fractional position (any real number).
 *
 * @param t - Fractional time position (period = 1)
 */
export function sawtoothWave(t: number): number {
	return 2 * (((t % 1) + 1) % 1) - 1
}

/** Per-item data kept during one apply: the whitespace before it, an author <br> before it, and whether it is a whole element. */
interface ItemMeta {
	lead: string
	breakBefore: HTMLBRElement | null
	atomic?: boolean
}

/** A piece of one item on one line: usually a whole word, or part of a word the browser breaks. */
interface Segment {
	item: HTMLElement
	text: string
	top: number
	bottom: number
	lead: string
	breakBefore: HTMLBRElement | null
	atomic: boolean
	/** Whether this is the item's first segment (its start is the span's start). */
	first: boolean
}

/**
 * Splits a text node that the browser lays out over several lines into one piece per line, by
 * measuring where each character's box starts a new line. Used only for the rare word that wraps.
 */
function splitAtLineBreaks(node: Text, text: string): { text: string; top: number; bottom: number }[] {
	const pieces: { text: string; top: number; bottom: number }[] = []
	const range = document.createRange()
	let start = 0
	let top = NaN, bottom = NaN
	for (let i = 0; i < text.length; i++) {
		range.setStart(node, i)
		range.setEnd(node, i + 1)
		const rect = range.getClientRects()[0]
		if (!rect) continue
		const middle = (rect.top + rect.bottom) / 2
		if (Number.isNaN(top)) { top = rect.top; bottom = rect.bottom; continue }
		if (middle > bottom) {
			pieces.push({ text: text.slice(start, i), top, bottom })
			start = i
			top = rect.top
			bottom = rect.bottom
		} else {
			bottom = Math.max(bottom, rect.bottom)
		}
	}
	pieces.push({ text: text.slice(start), top: Number.isNaN(top) ? 0 : top, bottom: Number.isNaN(bottom) ? 0 : bottom })
	return pieces.filter((p) => p.text.length > 0)
}

/** Elements kept whole during the rebuild (no text of their own to split). */
const ATOMIC_TAGS = new Set(['IMG', 'SVG', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 'OBJECT', 'MATH'])

/** Scripts written without spaces between words: every grapheme is a possible line break. */
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u

/**
 * Splits a space-free token into the pieces a line may break between: graphemes for CJK, Thai and
 * similar scripts (Intl.Segmenter keeps combining marks with their base), the whole token otherwise.
 */
function splitUnspaced(token: string): string[] {
	if (!UNSPACED_SCRIPT.test(token)) return [token]
	const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter
	if (!Seg) return Array.from(token)
	return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(token), (seg) => seg.segment)
}

/** A finite number, else the default (with a one-time warning). */
function finiteOr(value: unknown, fallback: number, name: string): number {
	if (value === undefined) return fallback
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (!warned.has(name)) {
		warned.add(name)
		console.warn(`[textBreath] ${name} must be a finite number; got ${String(value)}, using ${fallback}`)
	}
	return fallback
}

/** Warnings already printed. */
const warned = new Set<string>()

/** The snapshot each processed element was built from, returned by getCleanHTML. */
const originals = new WeakMap<HTMLElement, string>()

/**
 * The element's original nodes: each element's child list, so a refit or removal can put the very
 * same nodes back (keeping their event listeners, React's included) instead of re-parsing HTML.
 */
interface NodeSnapshot { html: string; children: Map<Node, Node[]> }
const snapshots = new WeakMap<HTMLElement, NodeSnapshot>()

/** Records every element's child list under root. */
function takeSnapshot(root: HTMLElement, html: string): NodeSnapshot {
	const children = new Map<Node, Node[]>()
	const visit = (node: Node) => {
		children.set(node, Array.from(node.childNodes))
		node.childNodes.forEach((child) => { if (child.nodeType === Node.ELEMENT_NODE) visit(child) })
	}
	visit(root)
	return { html, children }
}

/** Puts the original nodes back where they were. */
function restoreSnapshot(snapshot: NodeSnapshot): void {
	snapshot.children.forEach((kids, parent) => (parent as Element).replaceChildren(...kids))
}

/**
 * Pass 1: bring the element back to its original content, reusing the original nodes when they
 * are still known (a refit, or a first run on an element that already holds originalHTML).
 */
function resetElement(element: HTMLElement, originalHTML: string): void {
	const snap = snapshots.get(element)
	if (snap && snap.html === originalHTML) {
		restoreSnapshot(snap)
		return
	}
	if (snap) restoreSnapshot(snap)
	const current = element.querySelector(`.${BREATHE_CLASSES.line}`) ? null : element.innerHTML
	if (current !== originalHTML) element.innerHTML = originalHTML
	snapshots.set(element, takeSnapshot(element, originalHTML))
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Strips all optical-margin injected markup from a clone of the element and returns the clean
 * innerHTML (the author's own <br> tags are kept). Safe to call multiple times — idempotent.
 *
 * @param el - Element that may contain optical-margin markup



/** Prints a console warning the first time it is seen. */
function warnOnce(message: string): void {
	if (warned.has(message)) return
	warned.add(message)
	console.warn(message)
}

/** Latest apply per element, so pretext finishing a load re-applies only if nothing newer ran. */
const latestApply = new WeakMap<HTMLElement, object>()

/**
 * Returns the element's original innerHTML: for an element this library processed, the exact
 * snapshot it was built from; otherwise the innerHTML with any breathe markup removed. Idempotent.
 *
 * @param el - Element that may contain breathe markup
 */
export function getCleanHTML(el: HTMLElement): string {
	const original = originals.get(el)
	if (original !== undefined && el.querySelector(`.${BREATHE_CLASSES.line}`)) return original
	const clone = el.cloneNode(true) as HTMLElement
	clone.querySelectorAll(`.${BREATHE_CLASSES.word}, .${BREATHE_CLASSES.line}, .${BREATHE_CLASSES.probe}`).forEach((node) => {
		const parent = node.parentNode
		if (!parent) return
		while (node.firstChild) parent.insertBefore(node.firstChild, node)
		parent.removeChild(node)
	})
	clone.querySelectorAll('br[data-pb-break]').forEach((br) => br.remove())
	clone.normalize()
	return clone.innerHTML
}

/**
 * Splits the element into line spans for the breathe animation.
 *
 *  1. Reset — bring back the original content (the original nodes, when known)
 *  2. Word wrap — wrap each word in a plain inline span, leaving the spaces between words in the text
 *     flow, so the browser breaks lines exactly as it does for the original text
 *  3. Line grouping — by position (a word the browser breaks is split there)
 *  4. Rebuild — one line span per line inside its inline ancestors, reusing the original elements so
 *     their listeners keep working; the text stays in the DOM, readable as before
 *
 * Under reduced motion or on a slow-refresh display nothing is changed (no lines are returned).
 *
 * @param element      - Target live DOM element (must be rendered and visible)
 * @param originalHTML - Clean HTML snapshot (from getCleanHTML or stored externally)
 * @param options      - BreatheOptions (merged with defaults)
 */
export function applyBreathe(
	element: HTMLElement,
	originalHTML: string,
	options: BreatheOptions | null = {},
): { lineSpans: HTMLElement[] } {
	if (typeof window === 'undefined' || !element) return { lineSpans: [] }
	const opts = options ?? {}

	// Reduced motion or an e-ink / slow-refresh display: no animation, so no line structure either.
	if (window.matchMedia?.('(update: slow)')?.matches || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
		resetElement(element, originalHTML)
		return { lineSpans: [] }
	}

	const applyToken = {}
	latestApply.set(element, applyToken)

	// --- Pass 1: Reset ---
	resetElement(element, originalHTML)
	originals.set(element, originalHTML)
	if (!element.textContent?.trim()) return { lineSpans: [] }
	if (!element.offsetWidth && !element.getBoundingClientRect().width) return { lineSpans: [] }

	const computedStyle = getComputedStyle(element)
	const px = (v: string) => parseFloat(v) || 0
	const contentWidth = element.getBoundingClientRect().width - px(computedStyle.paddingLeft) - px(computedStyle.paddingRight) - px(computedStyle.borderLeftWidth) - px(computedStyle.borderRightWidth)

	// --- Pass 2: Word wrap ---
	const items: HTMLElement[] = []
	const meta = new WeakMap<Element, ItemMeta>()
	let pendingSpace = ''
	let pendingBreak: HTMLBRElement | null = null
	const pushWord = (span: HTMLElement, lead: string) => {
		meta.set(span, { lead: pendingSpace + lead, breakBefore: pendingBreak })
		pendingSpace = ''
		pendingBreak = null
		items.push(span)
	}
	const walk = (node: Node): void => {
		if (node.nodeType === Node.TEXT_NODE) {
			const textNode = node as Text
			const text = textNode.textContent ?? ''
			if (!text.trim()) { pendingSpace += text; return }
			const fragment = document.createDocumentFragment()
			let lead = ''
			for (const token of text.split(/(\s+)/)) {
				if (!token) continue
				if (/^\s+$/.test(token)) {
					fragment.appendChild(document.createTextNode(token))
					lead += token
					continue
				}
				for (const piece of splitUnspaced(token)) {
					const span = document.createElement('span')
					span.className = BREATHE_CLASSES.word
					// A locked nowrap line can't hyphenate, so the measurement mustn't either.
					span.style.hyphens = 'manual'
					span.textContent = piece
					fragment.appendChild(span)
					pushWord(span, lead)
					lead = ''
				}
			}
			pendingSpace += lead
			textNode.parentNode!.replaceChild(fragment, textNode)
			return
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return
		const el = node as Element
		if (el.tagName === 'BR') { pendingBreak = el as HTMLBRElement; return }
		if (!el.hasChildNodes() || ATOMIC_TAGS.has(el.tagName)) {
			meta.set(el, { lead: pendingSpace, breakBefore: pendingBreak, atomic: true })
			pendingSpace = ''
			pendingBreak = null
			items.push(el as HTMLElement)
			return
		}
		Array.from(el.childNodes).forEach(walk)
	}
	Array.from(element.childNodes).forEach(walk)
	if (items.length === 0) { resetElement(element, originalHTML); return { lineSpans: [] } }

	// --- Pass 3: Line grouping ---
	const lineDetection = opts.lineDetection ?? 'bcr'
	if (lineDetection === 'canvas' && _pretext === null) {
		// First call: BCR now, and re-apply once pretext has loaded (if nothing newer ran).
		tryLoadPretext().then(() => {
			if (_pretext && element.isConnected && latestApply.get(element) === applyToken) applyBreathe(element, originalHTML, opts)
		})
	}
	const toSeg = (item: HTMLElement): Segment => {
		const info = meta.get(item)
		return { item, text: info?.atomic ? '' : item.textContent ?? '', top: 0, bottom: 0, lead: info?.lead ?? '', breakBefore: info?.breakBefore ?? null, atomic: !!info?.atomic, first: true }
	}
	let lines: Segment[][] = []
	let usedPretext = false
	if (lineDetection === 'canvas' && _pretext !== null) {
		try {
			const cached = pretextCache.get(element)
			let prepared: unknown
			if (cached && cached.originalHTML === originalHTML) {
				prepared = cached.prepared
			} else {
				prepared = _pretext.prepareWithSegments(element.textContent ?? '', getCanvasFont(element))
				pretextCache.set(element, { originalHTML, prepared })
			}
			const { lines: pretextLines } = _pretext.layoutWithLines(prepared, contentWidth, getLineHeightPx(element))
			let si = 0
			for (const pl of pretextLines) {
				const target = pl.text.replace(/\s+/g, '')
				const line: Segment[] = []
				let acc = ''
				while (si < items.length) {
					acc += (items[si].textContent ?? '').replace(/\s+/g, '')
					line.push(toSeg(items[si]))
					si++
					if (acc.length >= target.length) break
				}
				if (line.length) lines.push(line)
			}
			while (si < items.length) lines[lines.length - 1]?.push(toSeg(items[si++]))
			lines = lines.flatMap((line) => {
				const out: Segment[][] = [[]]
				line.forEach((seg, k) => { if (k > 0 && seg.breakBefore) out.push([]); out[out.length - 1].push(seg) })
				return out
			})
			usedPretext = lines.length > 0
		} catch (err) {
			warnOnce('[textBreath] canvas line detection failed — using the browser layout')
			lines = []
		}
	}
	if (!usedPretext) {
		// BCR path. A word the browser itself breaks (after a hyphen, or with overflow-wrap) is split
		// into one segment per line at the real break.
		const segments: Segment[] = []
		for (const item of items) {
			const rects = item.getClientRects?.()
			const rect = rects && rects.length ? rects[0] : item.getBoundingClientRect()
			const info = meta.get(item)
			const text = info?.atomic ? '' : item.textContent ?? ''
			if (rects && rects.length > 1 && !info?.atomic && item.firstChild?.nodeType === Node.TEXT_NODE) {
				for (const [k, piece] of splitAtLineBreaks(item.firstChild as Text, text).entries()) {
					segments.push({ item, text: piece.text, top: piece.top, bottom: piece.bottom, lead: k === 0 ? info?.lead ?? '' : '', breakBefore: k === 0 ? info?.breakBefore ?? null : null, atomic: false, first: k === 0 })
				}
				continue
			}
			segments.push({ item, text, top: rect.top, bottom: rect.bottom ?? rect.top, lead: info?.lead ?? '', breakBefore: info?.breakBefore ?? null, atomic: !!info?.atomic, first: true })
		}
		// A word starts a new line when its vertical middle is below the bottom of the current line's
		// boxes: a superscript or a larger word stays in its line, and tight line-heights stay apart.
		let current: Segment[] | null = null
		let groupBottom = -Infinity
		for (const seg of segments) {
			const middle = (seg.top + seg.bottom) / 2
			if (current === null || middle > groupBottom || (current.length > 0 && seg.breakBefore)) {
				current = []
				lines.push(current)
				groupBottom = seg.bottom
			} else {
				groupBottom = Math.max(groupBottom, seg.bottom)
			}
			current.push(seg)
		}
	}
	if (lines.length === 0) return { lineSpans: [] }
	const lineTexts = lines.map((line) => line.map((seg, k) => (k > 0 ? seg.lead : '') + seg.text).join('').replace(/\s+/g, ' ').trim())

	// --- Pass 4: Rebuild ---
	const chains = new Map<Segment, Element[]>()
	for (const line of lines) {
		for (const seg of line) {
			const ancestors: Element[] = []
			let node: Element | null = seg.item.parentElement
			while (node && node !== element) { ancestors.unshift(node); node = node.parentElement }
			chains.set(seg, ancestors)
		}
	}
	const justify = computedStyle.textAlign === 'justify'
	const ws = computedStyle.whiteSpace
	const lineWhiteSpace = ws === 'pre' || ws === 'pre-wrap' || ws === 'break-spaces' ? 'pre' : 'nowrap'
	const copied = new Set<Element>()
	const fragment = document.createDocumentFragment()
	const lineSpans: HTMLElement[] = []
	lines.forEach((line, lineIndex) => {
		const lineSpan = document.createElement('span')
		lineSpan.className = BREATHE_CLASSES.line
		lineSpan.style.display = 'inline-block'
		lineSpan.style.whiteSpace = lineWhiteSpace
		// text-indent is inherited: without this every line would be indented, not just the first.
		lineSpan.style.textIndent = '0'
		const nextSeg = lines[lineIndex + 1]?.[0]
		if (justify && nextSeg && !nextSeg.breakBefore && contentWidth > 0) {
			lineSpan.style.width = `${contentWidth}px`
			lineSpan.style.textAlignLast = 'justify'
		}
		let openChain: { source: Element; clone: Element }[] = []
		line.forEach((seg, k) => {
			const ancestors = chains.get(seg) ?? []
			let shared = 0
			while (shared < openChain.length && shared < ancestors.length && openChain[shared].source === ancestors[shared]) shared++
			openChain = openChain.slice(0, shared)
			let parent: Node = shared ? openChain[shared - 1].clone : lineSpan
			let lead = seg.lead
			if (k === 0 && /[\r\n]/.test(lead)) {
				// A newline at a line start is the line break itself, which the line span now provides. If it
				// was the only separator, a space at the end of the previous line keeps the words apart.
				lead = lead.replace(/[\r\n]+/g, '')
				const prev = lineSpans[lineSpans.length - 1]
				if (!lead && prev) {
					// Normal white-space, so the space collapses at the line end even in a pre line.
					const space = document.createElement('span')
					space.className = BREATHE_CLASSES.word
					space.style.whiteSpace = 'normal'
					space.textContent = ' '
					prev.appendChild(space)
				}
			}
			if (lead) parent.appendChild(document.createTextNode(lead))
			for (let a = shared; a < ancestors.length; a++) {
				let copy: Element
				if (copied.has(ancestors[a])) {
					copy = ancestors[a].cloneNode(false) as Element
					copy.removeAttribute('id')
				} else {
					copy = ancestors[a]
					copy.replaceChildren()
				}
				copied.add(ancestors[a])
				parent.appendChild(copy)
				openChain.push({ source: ancestors[a], clone: copy })
				parent = copy
			}
			if (seg.atomic) {
				parent.appendChild(seg.item)
			} else {
				const word = document.createElement('span')
				word.className = BREATHE_CLASSES.word
				word.textContent = seg.text
				parent.appendChild(word)
			}
		})
		fragment.appendChild(lineSpan)
		lineSpans.push(lineSpan)
		if (lineIndex < lines.length - 1) {
			const authorBreak = lines[lineIndex + 1][0].breakBefore
			if (authorBreak) {
				fragment.appendChild(authorBreak.cloneNode(false))
			} else {
				const br = document.createElement('br')
				br.setAttribute('data-pb-break', '')
				br.setAttribute('aria-hidden', 'true')
				fragment.appendChild(br)
			}
		}
	})
	element.innerHTML = ''
	element.appendChild(fragment)

	// Optional: clamp each line to its natural (pre-animation) width.
	if ((opts.linePreservation ?? 'none') === 'clamp') {
		const naturalWidths = lineSpans.map((span) => span.getBoundingClientRect().width)
		lineSpans.forEach((span, i) => {
			span.style.maxWidth = `${naturalWidths[i]}px`
			span.style.overflowX = 'hidden'
		})
	}

	return { lineSpans }
}

/** Replaces or adds one axis in a font-variation-settings string, keeping the others. */
function withAxis(base: string, tag: string, value: number): string {
	const entry = `"${tag}" ${value}`
	if (!base || base === 'normal') return entry
	const re = new RegExp(`(["'])${tag}\\1\\s+-?[\\d.eE+-]+`)
	return re.test(base) ? base.replace(re, entry) : `${base}, ${entry}`
}

/** An axis value in a font-variation-settings string, or undefined. */
function axisValue(fvs: string, tag: string): number | undefined {
	const m = new RegExp(`(["'])${tag}\\1\\s+(-?[\\d.eE+-]+)`).exec(fvs)
	return m ? parseFloat(m[2]) : undefined
}

/** One running animation: its per-frame work, and whether its element is still on the page. */
interface Animation { tick: (now: number) => void; alive: () => boolean }

/**
 * One shared requestAnimationFrame loop for every running animation (60 paragraphs used to mean 60
 * loops). An animation whose element has left the page is dropped and the loop stops when none remain.
 */
const animations = new Set<Animation>()
let loopId = 0
function loop(now: number): void {
	animations.forEach((a) => { if (a.alive()) a.tick(now); else animations.delete(a) })
	loopId = animations.size ? requestAnimationFrame(loop) : 0
}
function addAnimation(a: Animation): void {
	animations.add(a)
	if (!loopId) loopId = requestAnimationFrame(loop)
}

/**
 * Start the breathe animation on a set of line spans. Each line's letter-spacing (or axis) oscillates
 * around its own value — the author's letter-spacing or variation settings — not around zero.
 * Returns a stop function that ends the animation and puts the lines back at their own values.
 *
 * @param lineSpans - Array of pb-line span elements from applyBreathe
 * @param options   - BreatheOptions (merged with defaults)
 */
export function startBreathe(
	lineSpans: HTMLElement[],
	options: BreatheOptions | null = {},
): () => void {
	const opts = options ?? {}
	if (!lineSpans || lineSpans.length === 0) return () => {}
	if (typeof window !== 'undefined') {
		if (window.matchMedia?.('(update: slow)')?.matches) return () => {}
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return () => {}
	}

	let amplitude = Math.abs(finiteOr(opts.amplitude, DEFAULTS.amplitude, 'amplitude'))
	if (amplitude > 0.5) {
		warnOnce(`[textBreath] amplitude ${amplitude} is very large; using 0.5`)
		amplitude = 0.5
	}
	const rawPeriod = finiteOr(opts.period, DEFAULTS.period, 'period')
	const period = rawPeriod > 0 ? rawPeriod : (warnOnce(`[textBreath] period must be greater than 0; using ${DEFAULTS.period}`), DEFAULTS.period)
	const phaseOffset = finiteOr(opts.phaseOffset, DEFAULTS.phaseOffset, 'phaseOffset')
	const waveShape   = opts.waveShape   ?? DEFAULTS.waveShape
	const axis        = opts.axis        ?? DEFAULTS.axis
	const mode        = opts.mode        ?? 'phase'
	const direction   = opts.direction   ?? 'down'

	// Each line's own resting values, read once before animating.
	const base = lineSpans.map((span) => {
		const cs = getComputedStyle(span)
		const fontSize = parseFloat(cs.fontSize) || 16
		const fvs = cs.fontVariationSettings || 'normal'
		return {
			inlineLS: span.style.letterSpacing,
			inlineFVS: span.style.fontVariationSettings,
			ls: cs.letterSpacing && cs.letterSpacing !== 'normal' ? cs.letterSpacing : '0px',
			fvs,
			wdth: axisValue(fvs, 'wdth') ?? 100,
			wght: axisValue(fvs, 'wght') ?? (parseFloat(cs.fontWeight) || 400),
			fontSize,
		}
	})

	const n = lineSpans.length
	const speed = 1 / period
	// elapsed counts visible animation time only, so a hidden tab doesn't jump the phase on return.
	let elapsed = 0
	let lastTick = performance.now()
	let paused = false
	let running = true

	const tick = (now: number) => {
		if (!paused && !document.hidden) elapsed += (now - lastTick) / 1000
		lastTick = now
		if (paused) return
		const t = elapsed
		lineSpans.forEach((span, i) => {
			let wave: number
			if (mode === 'tide') {
				const pos = n > 1 ? i / (n - 1) : 0
				// The crest sits where pos - t·speed is constant, so subtracting time moves it to higher
				// line indices (down the paragraph); adding time moves it up.
				const phase = direction === 'up' ? pos + t * speed : pos - t * speed
				wave = waveShape === 'triangle' ? triangleWave(phase) : waveShape === 'sawtooth' ? sawtoothWave(phase) : Math.sin(2 * Math.PI * phase)
			} else {
				const phase = i * phaseOffset
				wave = waveShape === 'triangle'
					? triangleWave(t / period + phase / (2 * Math.PI))
					: waveShape === 'sawtooth'
						? sawtoothWave(t / period + phase / (2 * Math.PI))
						: Math.sin(2 * Math.PI * t / period + phase)
			}
			const value = amplitude * wave
			const b = base[i]
			if (axis === 'wdth') {
				span.style.fontVariationSettings = withAxis(b.fvs, 'wdth', +(b.wdth + value * 100).toFixed(2))
			} else if (axis === 'wght') {
				span.style.fontVariationSettings = withAxis(b.fvs, 'wght', +(b.wght + value * 400).toFixed(1))
			} else {
				span.style.letterSpacing = b.ls === '0px' ? `${value.toFixed(4)}em` : `calc(${b.ls} + ${value.toFixed(4)}em)`
			}
		})
	}

	// One animation per set of lines: starting again on the same lines stops the earlier one.
	stopBySpan.get(lineSpans[0])?.()

	const anim: Animation = { tick, alive: () => running && lineSpans[0].isConnected }
	addAnimation(anim)

	// Stop (and restore) if the reader turns on reduced motion while it runs.
	const motionQuery = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
	const onMotionChange = () => { if (motionQuery?.matches) stop() }
	motionQuery?.addEventListener?.('change', onMotionChange)

	// Pause (or stop) while the element is offscreen.
	let io: IntersectionObserver | undefined
	const host = lineSpans[0].parentElement
	if (typeof IntersectionObserver !== 'undefined' && opts.pauseOffscreen !== false && host) {
		io = new IntersectionObserver((entries) => {
			const visible = entries[entries.length - 1].isIntersecting
			if (opts.cancelOffscreen) {
				if (visible && !animations.has(anim) && running) { lastTick = performance.now(); addAnimation(anim) }
				else if (!visible) animations.delete(anim)
			} else {
				paused = !visible
			}
		})
		io.observe(host)
	}

	const stop = () => {
		if (!running) return
		running = false
		animations.delete(anim)
		io?.disconnect()
		motionQuery?.removeEventListener?.('change', onMotionChange)
		if (stopBySpan.get(lineSpans[0]) === stop) stopBySpan.delete(lineSpans[0])
		// Put each line back at its own values.
		lineSpans.forEach((span, i) => {
			span.style.letterSpacing = base[i].inlineLS
			span.style.fontVariationSettings = base[i].inlineFVS
		})
	}
	stopBySpan.set(lineSpans[0], stop)
	return stop
}

/** The stop function of the animation running on a set of lines (keyed by its first line). */
const stopBySpan = new WeakMap<HTMLElement, () => void>()

/**
 * Remove breathe markup and restore the element to its original content (the original nodes, when known).
 *
 * @param element      - Element that was previously adjusted
 * @param originalHTML - The snapshot passed to the original applyBreathe call (optional)
 */
export function removeBreathe(element: HTMLElement, originalHTML?: string): void {
	const html = originalHTML ?? originals.get(element) ?? getCleanHTML(element)
	const snap = snapshots.get(element)
	if (snap && snap.html === html) restoreSnapshot(snap)
	else element.innerHTML = html
	snapshots.delete(element)
	originals.delete(element)
}
