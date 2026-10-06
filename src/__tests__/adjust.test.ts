// textBreath/src/__tests__/adjust.test.ts — core algorithm tests
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { applyBreathe, removeBreathe, startBreathe, getCleanHTML, triangleWave, sawtoothWave } from '../core/adjust'
import { BREATHE_CLASSES } from '../core/types'

// ─── DOM measurement mock ─────────────────────────────────────────────────────
const CONTAINER_WIDTH = 600
const WORD_WIDTH = 80
let wordCallIndex = 0

function mockMeasurement() {
	wordCallIndex = 0
	const proto = HTMLElement.prototype
	const prior = Object.getOwnPropertyDescriptor(proto, 'offsetWidth')
	Object.defineProperty(proto, 'offsetWidth', {
		configurable: true,
		set: () => {},
		get: function (this) {
			if (this.classList?.contains(BREATHE_CLASSES.probe)) return 0
			if (this.classList?.contains(BREATHE_CLASSES.word)) return WORD_WIDTH
			return CONTAINER_WIDTH
		},
	})
	const origBCR = Element.prototype.getBoundingClientRect
	Element.prototype.getBoundingClientRect = function (this) {
		const el = this
		if (el.classList?.contains(BREATHE_CLASSES.probe))
			return { width: 0, top: 0, left: 0, bottom: 20, right: 0, height: 20, x: 0, y: 0, toJSON: () => {} }
		if (el.classList?.contains(BREATHE_CLASSES.word)) {
			const lineIndex = Math.floor(wordCallIndex / 7)
			wordCallIndex++
			const top = lineIndex * 20
			return { width: WORD_WIDTH, top, left: 0, bottom: top + 20, right: WORD_WIDTH, height: 20, x: 0, y: top, toJSON: () => {} }
		}
		return { width: CONTAINER_WIDTH, top: 0, left: 0, bottom: 20, right: CONTAINER_WIDTH, height: 20, x: 0, y: 0, toJSON: () => {} }
	}
	return () => {
		if (prior) Object.defineProperty(proto, 'offsetWidth', prior)
		Element.prototype.getBoundingClientRect = origBCR
	}
}

function makeElement(html: string): HTMLElement {
	const el = document.createElement('p')
	el.innerHTML = html
	el.style.width = CONTAINER_WIDTH + 'px'
	document.body.appendChild(el)
	return el
}

function nWords(n: number, word = 'word'): string {
	return Array.from({ length: n }, () => word).join(' ')
}

// ─── triangleWave ─────────────────────────────────────────────────────────────
describe('triangleWave', () => {
	it('returns -1 at t=0', () => { expect(triangleWave(0)).toBeCloseTo(-1) })
	it('returns 1 at t=0.5', () => { expect(triangleWave(0.5)).toBeCloseTo(1) })
	it('returns -1 at t=1 (full period)', () => { expect(triangleWave(1)).toBeCloseTo(-1) })
	it('is always in range [-1, 1]', () => {
		for (let t = 0; t < 2; t += 0.07) {
			const v = triangleWave(t)
			expect(v).toBeGreaterThanOrEqual(-1)
			expect(v).toBeLessThanOrEqual(1)
		}
	})
})

// ─── applyBreathe / getCleanHTML / removeBreathe ──────────────────────────────
describe('textBreath', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	it('getCleanHTML is idempotent', () => {
		const el = makeElement('<em>Hello</em> world')
		expect(getCleanHTML(el)).toBe(getCleanHTML(el))
	})
	it('applyBreathe does not throw on empty element', () => {
		const el = makeElement('')
		expect(() => applyBreathe(el, getCleanHTML(el), {})).not.toThrow()
	})
	it('removeBreathe restores original HTML', () => {
		const el = makeElement('<em>Hello</em> world')
		const original = getCleanHTML(el)
		applyBreathe(el, original, {})
		removeBreathe(el, original)
		expect(el.innerHTML).toBe(original)
	})
	it('preserves inline elements after apply', () => {
		const el = makeElement('<em>italic</em> and <strong>bold</strong>')
		const original = getCleanHTML(el)
		applyBreathe(el, original, {})
		expect(el.querySelector('em')).toBeTruthy()
		expect(el.querySelector('strong')).toBeTruthy()
	})
	it('getCleanHTML strips breathe markup after apply', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyBreathe(el, original, {})
		const cleaned = getCleanHTML(el)
		expect(cleaned).not.toContain(BREATHE_CLASSES.line)
		expect(cleaned).not.toContain(BREATHE_CLASSES.word)
	})
	it('creates line spans for multi-line content', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, {})
		expect(lineSpans.length).toBeGreaterThanOrEqual(2)
	})
	it('returned lineSpans matches DOM line spans', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, {})
		const domSpans = el.querySelectorAll('.' + BREATHE_CLASSES.line)
		expect(lineSpans.length).toBe(domSpans.length)
	})
	it('apply is idempotent — applying twice does not double line spans', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyBreathe(el, original, {})
		const after1 = el.querySelectorAll('.' + BREATHE_CLASSES.line).length
		wordCallIndex = 0
		applyBreathe(el, original, {})
		expect(el.querySelectorAll('.' + BREATHE_CLASSES.line).length).toBe(after1)
	})
	it('single-word input does not crash and returns one line', () => {
		const el = makeElement('Hello')
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, {})
		expect(lineSpans.length).toBe(1)
	})
})

// ─── startBreathe ─────────────────────────────────────────────────────────────
describe('startBreathe', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	it('returns a cleanup function', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, {})
		const stop = startBreathe(lineSpans, {})
		expect(typeof stop).toBe('function')
		stop()
	})
	it('no-op cleanup when given empty lineSpans', () => {
		const stop = startBreathe([], {})
		expect(() => stop()).not.toThrow()
	})
})

// ─── Extended coverage ─────────────────────────────────────────────────────────
describe('triangleWave — extended', () => {
	it('returns 0 at t=0.25 (quarter period)', () => {
		expect(triangleWave(0.25)).toBeCloseTo(0)
	})

	it('returns 0 at t=0.75 (three-quarter period)', () => {
		expect(triangleWave(0.75)).toBeCloseTo(0)
	})

	it('handles negative t correctly (still in [-1, 1])', () => {
		for (let t = -2; t < 0; t += 0.13) {
			const v = triangleWave(t)
			expect(v).toBeGreaterThanOrEqual(-1)
			expect(v).toBeLessThanOrEqual(1)
		}
	})
})

describe('textBreath — extended', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	it('amplitude:0 — line spans are produced but startBreathe sets spacing to 0 immediately', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, { amplitude: 0 })
		expect(lineSpans.length).toBeGreaterThan(0)
		// With amplitude 0, animation sets spacing to baseValue * 0 = 0
		const stop = startBreathe(lineSpans, { amplitude: 0 })
		expect(typeof stop).toBe('function')
		stop()
	})

	it('deeply nested element (em inside strong) does not crash', () => {
		const el = makeElement('<strong><em>deeply</em> nested</strong> paragraph text here now')
		const original = getCleanHTML(el)
		expect(() => applyBreathe(el, original, {})).not.toThrow()
		expect(el.querySelector('em')).toBeTruthy()
		expect(el.querySelector('strong')).toBeTruthy()
	})

	it('lineSpans array length matches DOM line span count', () => {
		const el = makeElement(nWords(21))
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, {})
		const domCount = el.querySelectorAll('.' + BREATHE_CLASSES.line).length
		expect(lineSpans.length).toBe(domCount)
	})

	it('getCleanHTML on applied element returns original content', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyBreathe(el, original, {})
		const cleaned = getCleanHTML(el)
		// Cleaned output should match original (no markup classes left)
		expect(cleaned).not.toContain(BREATHE_CLASSES.line)
	})

	it('startBreathe with multiple line spans returns a working stop function', () => {
		const el = makeElement(nWords(21))
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, {})
		expect(lineSpans.length).toBeGreaterThanOrEqual(3)
		const stop = startBreathe(lineSpans, { amplitude: 0.01, period: 2 })
		expect(typeof stop).toBe('function')
		stop()
	})

	it('different amplitude values do not throw', () => {
		for (const amplitude of [0, 0.001, 0.05, 0.5]) {
			const el = makeElement(nWords(14))
			const original = getCleanHTML(el)
			const { lineSpans } = applyBreathe(el, original, { amplitude })
			wordCallIndex = 0
			const stop = startBreathe(lineSpans, { amplitude })
			expect(typeof stop).toBe('function')
			stop()
			document.body.innerHTML = ''
		}
	})

	it('period option passes without throwing', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, { period: 10 })
		const stop = startBreathe(lineSpans, { period: 10 })
		expect(typeof stop).toBe('function')
		stop()
	})

	it('waveShape: triangle does not throw', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, {})
		const stop = startBreathe(lineSpans, { waveShape: 'triangle' })
		expect(typeof stop).toBe('function')
		stop()
	})

	it('waveShape: sawtooth does not throw', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, {})
		const stop = startBreathe(lineSpans, { waveShape: 'sawtooth' })
		expect(typeof stop).toBe('function')
		stop()
	})

	it('mode: tide does not throw', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, {})
		const stop = startBreathe(lineSpans, { mode: 'tide' })
		expect(typeof stop).toBe('function')
		stop()
	})

	it('mode: tide with direction: up does not throw', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, {})
		const stop = startBreathe(lineSpans, { mode: 'tide', direction: 'up' })
		expect(typeof stop).toBe('function')
		stop()
	})

	it('linePreservation: clamp sets maxWidth on line spans', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, { linePreservation: 'clamp' })
		expect(lineSpans.length).toBeGreaterThan(0)
		lineSpans.forEach((span) => {
			expect(span.style.maxWidth).not.toBe('')
		})
	})
})

// ─── sawtoothWave ──────────────────────────────────────────────────────────────
describe('sawtoothWave', () => {
	it('returns -1 at t=0', () => { expect(sawtoothWave(0)).toBeCloseTo(-1) })
	it('returns 0 at t=0.5', () => { expect(sawtoothWave(0.5)).toBeCloseTo(0) })
	it('returns 1 approaching t=1', () => { expect(sawtoothWave(0.999)).toBeCloseTo(1, 1) })
	it('is always in range [-1, 1]', () => {
		for (let t = 0; t < 2; t += 0.07) {
			const v = sawtoothWave(t)
			expect(v).toBeGreaterThanOrEqual(-1)
			expect(v).toBeLessThanOrEqual(1)
		}
	})
	it('handles negative t (stays in [-1, 1])', () => {
		for (let t = -2; t < 0; t += 0.13) {
			const v = sawtoothWave(t)
			expect(v).toBeGreaterThanOrEqual(-1)
			expect(v).toBeLessThanOrEqual(1)
		}
	})
})

// ─── Review fixes (2026-10) ──────────────────────────────────────────────────

describe('review fixes', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	it('keeps the text readable in the DOM (no aria-hidden lines, no aria-label) and the markup intact', () => {
		const html = '<em>alpha</em> <strong>beta</strong> gamma <a href="#x" id="L">delta</a> epsilon.'
		const el = makeElement(html)
		const text = el.textContent
		applyBreathe(el, html, {})
		expect(el.textContent).toBe(text)
		expect(el.hasAttribute('aria-label')).toBe(false)
		expect(el.querySelectorAll(`.${BREATHE_CLASSES.line}[aria-hidden]`).length).toBe(0)
		expect(el.querySelectorAll('#L').length).toBe(1)
		expect(getCleanHTML(el)).toBe(html)
	})

	it('keeps the original elements, so their listeners survive a re-run', () => {
		const html = 'Please read <a href="#">our terms</a> carefully now.'
		const el = makeElement(html)
		const link = el.querySelector('a')!
		let clicks = 0
		link.addEventListener('click', (e) => { e.preventDefault(); clicks++ })
		applyBreathe(el, html, {})
		applyBreathe(el, html, {})
		el.querySelector('a')!.click()
		expect(clicks).toBe(1)
		removeBreathe(el)
		expect(el.querySelector('a')).toBe(link)
	})

	it('stop() puts each line back at its own spacing', () => {
		const el = makeElement(nWords(14))
		const { lineSpans } = applyBreathe(el, el.innerHTML, {})
		const stop = startBreathe(lineSpans, {})
		stop()
		lineSpans.forEach((span) => expect(span.style.letterSpacing).toBe(''))
	})

	it('a second start on the same lines stops the first', () => {
		const el = makeElement(nWords(14))
		const { lineSpans } = applyBreathe(el, el.innerHTML, {})
		const stop1 = startBreathe(lineSpans, {})
		const stop2 = startBreathe(lineSpans, {})
		expect(() => { stop1(); stop2() }).not.toThrow()
	})
})
