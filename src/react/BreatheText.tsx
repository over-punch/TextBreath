// breathe/src/react/BreatheText.tsx — React component wrapper
import React, { Children, forwardRef, isValidElement, useCallback } from 'react'
import { useBreathe } from './useBreathe'
import type { BreatheOptions } from '../core/types'

interface BreatheTextProps extends BreatheOptions, Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className' | 'style'> {
	children: React.ReactNode
	className?: string
	style?: React.CSSProperties
	as?: React.ElementType
}

/**
 * Drop-in component that applies the breathe effect to its children.
 * Forwards the ref to the root DOM element while also wiring the internal breathe ref.
 */
/** BreatheOptions keys: consumed by the hook, not forwarded to the DOM element. */
const OPTION_KEYS: (keyof BreatheOptions)[] = [
	'lineDetection', 'amplitude', 'period', 'phaseOffset', 'waveShape', 'pauseOffscreen', 'cancelOffscreen',
	'axis', 'mode', 'direction', 'linePreservation',
]

/**
 * A string that changes whenever the rendered content of `children` changes: text, element types,
 * keys and primitive props, walked recursively. Functions and objects are ignored.
 */
function childrenSignature(children: React.ReactNode): string {
	const parts: string[] = []
	const walk = (node: React.ReactNode) => {
		Children.forEach(node, (child) => {
			if (child === null || child === undefined || typeof child === 'boolean') return
			if (typeof child === 'string' || typeof child === 'number') { parts.push(String(child)); return }
			if (isValidElement(child)) {
				const type = typeof child.type === 'string' ? child.type : ((child.type as { displayName?: string; name?: string }).displayName ?? (child.type as { name?: string }).name ?? 'C')
				const props = child.props as Record<string, unknown>
				const attrs = Object.keys(props).filter((k) => k !== 'children' && ['string', 'number', 'boolean'].includes(typeof props[k])).sort().map((k) => `${k}=${String(props[k])}`)
				parts.push(`<${type}${child.key != null ? '#' + child.key : ''} ${attrs.join(' ')}>`)
				walk(props.children as React.ReactNode)
				parts.push(`</${type}>`)
			}
		})
	}
	walk(children)
	return parts.join('\u0000')
}

export const BreatheText = forwardRef<HTMLElement, BreatheTextProps>(
	function BreatheText({ children, className, style, as: Tag = 'p', ...rest }, ref) {
		// Algorithm options go to the hook; everything else (id, aria-*, data-*, lang, events…) to the element.
		const options: BreatheOptions = {}
		const htmlProps: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(rest)) {
			if ((OPTION_KEYS as string[]).includes(key)) (options as Record<string, unknown>)[key] = value
			else htmlProps[key] = value
		}
		// The library rebuilds the element's DOM, so React can't patch new children into it. When the
		// children or the tag change, remount the element (key) and re-run on the fresh content.
		const contentKey = `${typeof Tag === 'string' ? Tag : 'C'}|${childrenSignature(children)}`
		const innerRef = useBreathe(options, contentKey)

		/** Merge the internal breathe ref with the forwarded external ref */
		const mergedRef = useCallback(
			(node: HTMLElement | null) => {
				;(innerRef as React.MutableRefObject<HTMLElement | null>).current = node
				if (typeof ref === 'function') {
					ref(node)
				} else if (ref) {
					ref.current = node
				}
			},
			// innerRef is stable (useRef), ref identity is stable per render
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[ref],
		)

		return (
			<Tag key={contentKey} ref={mergedRef} className={className} style={style} {...htmlProps}>
				{children}
			</Tag>
		)
	},
)

BreatheText.displayName = 'BreatheText'
