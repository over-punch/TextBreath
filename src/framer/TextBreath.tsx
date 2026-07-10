// textBreath/src/framer/TextBreath.tsx — Framer code component wrapping the textBreath core.
//
// Distribution: paste this file into Framer (Insert → Code → New Component), or host it as an
// ES module and add it by URL. It imports the framework-agnostic core straight from the CDN, so
// it needs no build step — the core functions take a DOM element, not React, so there is no
// React version/externalisation issue.
//
// The rendering logic mirrors the already-proven `useBreathe` hook (applyBreathe in an effect,
// startBreathe for the rAF loop); the only Framer-specific additions are the property controls,
// RenderTarget gating, and layout annotations. Line grouping depends on live layout width, so the
// effect re-runs on every prop change (Framer re-mounts on resize, which re-measures the lines).
import { useEffect, useRef } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
// Pin to a published version so shared instances stay stable. Bump when the core changes.
// The core is framework-agnostic (operates on a DOM element), so no React externalisation is needed.
import { applyBreathe, startBreathe, getCleanHTML } from "https://esm.sh/@liiift-studio/textbreath@1.0.20"

/** Props surfaced to the Framer UI via addPropertyControls, plus base text styling.
 *  Option fields are declared explicitly so the component needs no type import over HTTP. */
interface TextBreathFramerProps {
	/** The text to animate — multi-line paragraphs breathe line-by-line. */
	text: string
	/** CSS font-family — MUST resolve to a variable font when axis is wght/wdth. */
	fontFamily: string
	/** Font size in px. */
	fontSize: number
	/** Text colour. */
	color: string
	/** Horizontal text alignment. */
	textAlign: "left" | "center" | "right"
	/** CSS property / variable-font axis to oscillate. */
	axis: "letter-spacing" | "wdth" | "wght"
	/** Peak deviation from neutral, in em (letter-spacing) or axis-scaled units (wdth/wght). */
	amplitude: number
	/** Seconds per full oscillation cycle. */
	period: number
	/** Wave shape used for the oscillation. */
	waveShape: "sine" | "triangle" | "sawtooth"
	/** 'phase' gives each line a fixed offset; 'tide' sends a travelling wave through the paragraph. */
	mode: "phase" | "tide"
	/** Radians of phase shift between adjacent lines — used in 'phase' mode. */
	phaseOffset: number
	/** Wave travel direction — only used in 'tide' mode. */
	direction: "up" | "down"
	/** Line detection method — 'canvas' needs the optional @chenglou/pretext peer dep. */
	lineDetection: "bcr" | "canvas"
	/** Line width preservation strategy during animation. */
	linePreservation: "none" | "clamp"
	/** Pause the rAF work while the element is offscreen (IntersectionObserver). */
	pauseOffscreen: boolean
	/** Cancel the rAF loop entirely while offscreen — requires pauseOffscreen. */
	cancelOffscreen: boolean
}

/**
 * Phased per-line letter-spacing / axis oscillation — the paragraph breathes — as a Framer code component.
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function TextBreath(props: Partial<TextBreathFramerProps>) {
	const {
		text = "Typography that breathes,\nline by line, in and out.",
		fontFamily = "Inter",
		fontSize = 48,
		color = "#111111",
		textAlign = "left",
		axis = "letter-spacing",
		amplitude = 0.012,
		period = 3.5,
		waveShape = "sine",
		mode = "phase",
		phaseOffset = 0.785,
		direction = "down",
		lineDetection = "bcr",
		linePreservation = "none",
		pauseOffscreen = true,
		cancelOffscreen = false,
	} = props

	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const el = ref.current
		if (!el) return

		const options = {
			axis,
			amplitude,
			period,
			waveShape,
			mode,
			phaseOffset,
			direction,
			lineDetection,
			linePreservation,
			pauseOffscreen,
			cancelOffscreen,
		}
		const original = getCleanHTML(el)
		const { lineSpans } = applyBreathe(el, original, options)

		// Animate on the live site and on the editing canvas (so the designer sees the motion);
		// render a single static frame on export / thumbnails where a loop is undesirable.
		const target = RenderTarget.current()
		const animate = target === RenderTarget.preview || target === RenderTarget.canvas

		if (animate && lineSpans.length > 0) {
			const stop = startBreathe(lineSpans, options)
			return () => {
				stop()
				el.innerHTML = original
			}
		}
		return () => {
			el.innerHTML = original
		}
	}, [
		text,
		axis,
		amplitude,
		period,
		waveShape,
		mode,
		phaseOffset,
		direction,
		lineDetection,
		linePreservation,
		pauseOffscreen,
		cancelOffscreen,
	])

	return (
		<div
			ref={ref}
			style={{
				fontFamily,
				fontSize,
				color,
				textAlign,
				lineHeight: 1.3,
				width: "100%",
				whiteSpace: "pre-line",
			}}
		>
			{text}
		</div>
	)
}

// Map every meaningful BreatheOptions field to a Framer control.
addPropertyControls(TextBreath, {
	text: {
		type: ControlType.String,
		title: "Text",
		defaultValue: "Typography that breathes,\nline by line, in and out.",
		displayTextArea: true,
	},
	fontFamily: {
		type: ControlType.String,
		title: "Font",
		defaultValue: "Inter",
		description: "Use a variable font when axis is Weight or Width.",
	},
	fontSize: { type: ControlType.Number, title: "Size", defaultValue: 48, min: 8, max: 400, unit: "px" },
	color: { type: ControlType.Color, title: "Colour", defaultValue: "#111111" },
	textAlign: {
		type: ControlType.Enum,
		title: "Align",
		options: ["left", "center", "right"],
		optionTitles: ["Left", "Center", "Right"],
		defaultValue: "left",
		displaySegmentedControl: true,
	},
	axis: {
		type: ControlType.Enum,
		title: "Axis",
		options: ["letter-spacing", "wdth", "wght"],
		optionTitles: ["Letter-spacing", "Width", "Weight"],
		defaultValue: "letter-spacing",
	},
	amplitude: {
		type: ControlType.Number,
		title: "Amplitude",
		defaultValue: 0.012,
		min: 0,
		max: 1,
		step: 0.001,
		description: "Peak deviation. ~0.012 for letter-spacing; try 0.3–0.6 for Weight/Width.",
	},
	period: { type: ControlType.Number, title: "Period", defaultValue: 3.5, min: 0.2, max: 20, step: 0.1, unit: "s" },
	waveShape: {
		type: ControlType.Enum,
		title: "Wave",
		options: ["sine", "triangle", "sawtooth"],
		optionTitles: ["Sine", "Triangle", "Sawtooth"],
		defaultValue: "sine",
	},
	mode: {
		type: ControlType.Enum,
		title: "Mode",
		options: ["phase", "tide"],
		optionTitles: ["Phase", "Tide"],
		defaultValue: "phase",
	},
	phaseOffset: {
		type: ControlType.Number,
		title: "Phase Offset",
		defaultValue: 0.785,
		min: 0,
		max: 6.283,
		step: 0.01,
		unit: "rad",
		description: "Phase shift between adjacent lines (Phase mode only).",
	},
	direction: {
		type: ControlType.Enum,
		title: "Direction",
		options: ["up", "down"],
		optionTitles: ["Up", "Down"],
		defaultValue: "down",
		description: "Wave travel direction (Tide mode only).",
	},
	lineDetection: {
		type: ControlType.Enum,
		title: "Line Detect",
		options: ["bcr", "canvas"],
		optionTitles: ["BCR", "Canvas"],
		defaultValue: "bcr",
		description: "Canvas needs the optional @chenglou/pretext dependency.",
	},
	linePreservation: {
		type: ControlType.Enum,
		title: "Line Width",
		options: ["none", "clamp"],
		optionTitles: ["None", "Clamp"],
		defaultValue: "none",
	},
	pauseOffscreen: { type: ControlType.Boolean, title: "Pause Offscreen", defaultValue: true },
	cancelOffscreen: { type: ControlType.Boolean, title: "Cancel Offscreen", defaultValue: false },
})
