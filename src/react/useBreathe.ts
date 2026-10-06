// breathe/src/react/useBreathe.ts — React hook: splits the element into lines and runs the breathe
// animation; re-runs on container width changes, after fonts load, and when options change.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { applyBreathe, getCleanHTML, startBreathe } from '../core/adjust'
import type { BreatheOptions } from '../core/types'

/**
 * React hook that applies the breathe animation to a ref'd element.
 *
 * @param options    - BreatheOptions
 * @param contentKey - A value that changes when the element's content changes (BreatheText derives one
 *                     from its children). The library rebuilds the element's DOM, so new content needs
 *                     a fresh element and a fresh snapshot.
 */
export function useBreathe(options: BreatheOptions = {}, contentKey?: string) {
	const ref = useRef<HTMLElement>(null)
	const originalHTMLRef = useRef<string | null>(null)
	/** The element originalHTMLRef was read from; a new element is read afresh. */
	const sourceElRef = useRef<HTMLElement | null>(null)
	const stopRef = useRef<(() => void) | null>(null)
	const optionsRef = useRef(options)
	optionsRef.current = options

	// Every option is a dependency (serialised, so an inline object doesn't re-run every render).
	const optionsKey = JSON.stringify(options)

	const run = useCallback(() => {
		const el = ref.current
		if (!el) return
		if (originalHTMLRef.current === null || sourceElRef.current !== el) {
			originalHTMLRef.current = getCleanHTML(el)
			sourceElRef.current = el
		}
		stopRef.current?.()
		stopRef.current = null
		// applyBreathe leaves the element untouched under reduced motion (no lines, no animation).
		const { lineSpans } = applyBreathe(el, originalHTMLRef.current, optionsRef.current)
		if (lineSpans.length > 0) stopRef.current = startBreathe(lineSpans, optionsRef.current)
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [optionsKey, contentKey])

	useLayoutEffect(() => {
		run()
		const el = ref.current
		if (!el || typeof ResizeObserver === 'undefined') return
		// Watch the container, not the element: the animation itself changes the width of a
		// shrink-wrapped element, which re-ran the whole thing in a loop (125 rebuilds on mount).
		const target = el.parentElement ?? el
		let lastWidth = Math.round(target.getBoundingClientRect().width)
		let rafId = 0
		const ro = new ResizeObserver((entries) => {
			if (!entries.length) return
			const w = Math.round(entries[0].contentRect.width)
			if (w === lastWidth) return
			lastWidth = w
			cancelAnimationFrame(rafId)
			rafId = requestAnimationFrame(run)
		})
		ro.observe(target)
		return () => {
			stopRef.current?.()
			stopRef.current = null
			ro.disconnect()
			cancelAnimationFrame(rafId)
		}
	}, [run])

	// Re-run once fonts finish loading; not when they already have (a second rebuild on mount).
	useEffect(() => {
		if (typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded') return
		let mounted = true
		document.fonts.ready.then(() => { if (mounted) run() }).catch(() => {})
		return () => { mounted = false }
	}, [run])

	return ref
}
