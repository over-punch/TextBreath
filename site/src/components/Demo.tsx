"use client"

// Interactive breathe demo with amplitude, period, phase, wave shape, axis, mode, cursor/gyro/motion controls
import { useState, useEffect, useRef, useDeferredValue, useMemo, useCallback } from "react"
import { useMediaQuery, useClientValue } from "@/lib/clientValue"
import { BreatheText } from "@liiift-studio/textbreath"

const SAMPLE = `Hold still and watch the paragraph. Each line is breathing at its own pace — expanding and contracting its letter-spacing in a slow oscillation, offset from its neighbours by a fixed phase angle. The top lines and the bottom lines never breathe together. A wave moves through the paragraph rather than a pulse. At the default amplitude the movement is almost subliminal: you notice something alive before you notice what it is. Increase the amplitude to see the mechanics. The wave shape changes the character of the motion — sine is smooth, triangle is more mechanical. The period controls how fast each line completes its cycle.`

/** Static sample typography style — no state dependencies, defined at module level */
const SAMPLE_STYLE: React.CSSProperties = {
	fontFamily: "var(--font-merriweather), serif",
	fontSize: "1.125rem",
	lineHeight: "1.8",
	fontVariationSettings: '"wght" 300, "opsz" 18, "wdth" 100',
}

/** Map smoothed speed/magnitude to period in [1, 10] rounded to 0.5 steps — module-level, no closure deps */
function speedToPeriod(speed: number): number {
	const raw = 10 - (speed / 20) * 9
	const clamped = Math.max(1, Math.min(10, raw))
	return Math.round(clamped / 0.5) * 0.5
}

/** Labelled range input with formatted value display, value readout associated via aria-describedby */
function Slider({ label, value, min, max, step, fmt, title, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt?: (v: number) => string; title?: string; onChange: (v: number) => void }) {
	const inputId = label.replace(/\s+/g, '-').toLowerCase()
	const valueId = `${inputId}-value`
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={inputId} className="text-xs uppercase tracking-[0.18em] font-medium text-muted">{label}</label>
			<input id={inputId} type="range" min={min} max={max} step={step} value={value} aria-label={label} aria-describedby={valueId} title={title} onChange={e => onChange(Number(e.target.value))} onTouchStart={e => e.stopPropagation()} style={{ touchAction: 'pan-y' }} />
			<span id={valueId} className="tabular-nums text-xs text-muted text-right">{fmt ? fmt(value) : value}</span>
		</div>
	)
}

/** Before/after toggle — left half = without effect, right half filled = with effect */
function BeforeAfterToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
	return (
		<button
			onClick={onClick}
			aria-label="Toggle before/after comparison"
			aria-pressed={active}
			title={active ? 'Hide comparison' : 'Compare without effect'}
			style={{
				position: 'absolute', bottom: 0, right: 0,
				width: 32, height: 32, borderRadius: '50%',
				border: '1px solid currentColor',
				opacity: active ? 0.8 : 0.25,
				background: 'transparent',
				display: 'flex', alignItems: 'center', justifyContent: 'center',
				cursor: 'pointer', transition: 'opacity 0.15s ease',
				outline: 'none',
			}}
			onFocus={e => { (e.currentTarget as HTMLButtonElement).style.outline = '2px solid currentColor'; (e.currentTarget as HTMLButtonElement).style.outlineOffset = '2px' }}
			onBlur={e => { (e.currentTarget as HTMLButtonElement).style.outline = 'none' }}
		>
			<svg width="14" height="10" viewBox="0 0 14 10" fill="none">
				<rect x="0.5" y="0.5" width="13" height="9" rx="1" stroke="currentColor" strokeWidth="1"/>
				<line x1="7" y1="0.5" x2="7" y2="9.5" stroke="currentColor" strokeWidth="1"/>
				<rect x="8" y="1.5" width="5" height="7" fill="currentColor"/>
			</svg>
		</button>
	)
}

/** Cursor icon SVG */
function CursorIcon() {
	return (
		<svg width="11" height="14" viewBox="0 0 11 14" fill="currentColor" aria-hidden={true}>
			<path d="M0 0L0 11L3 8L5 13L6.8 12.3L4.8 7.3L8.5 7.3Z" />
		</svg>
	)
}

/** Gyroscope icon SVG — circle with rotation arrow */
function GyroIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden={true}>
			<circle cx="7" cy="7" r="5.5" />
			<circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
			<path d="M7 1.5 A5.5 5.5 0 0 1 12.5 7" strokeWidth="1.4" />
			<path d="M11.5 5.5 L12.5 7 L13.8 6" strokeWidth="1.2" />
		</svg>
	)
}

/** Motion icon SVG — three vertical bars of varying height representing vibration/motion */
function MotionIcon() {
	return (
		<svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden={true}>
			<rect x="0" y="9" width="2.5" height="5" rx="1" />
			<rect x="4.75" y="4" width="2.5" height="10" rx="1" />
			<rect x="9.5" y="1" width="2.5" height="13" rx="1" />
		</svg>
	)
}

type Axis = 'letter-spacing' | 'wdth' | 'wght'

/** Amplitude defaults per axis so slider range stays useful when switching */
const AXIS_AMPLITUDE_DEFAULTS: Record<Axis, number> = {
	'letter-spacing': 0.012,
	wdth: 0.1,
	wght: 0.2,
}

/** Interactive demo for breathe with amplitude, period, phase, wave shape, axis, mode, cursor/gyro controls */
export default function Demo() {
	const [amplitude, setAmplitude] = useState(0.012)
	const [period, setPeriod] = useState(3.5)
	const [phaseOffset, setPhaseOffset] = useState(Math.round(Math.PI / 4 * 100) / 100)
	const [waveShape, setWaveShape] = useState<'sine' | 'triangle' | 'sawtooth'>('sine')
	const [axis, setAxis] = useState<Axis>('letter-spacing')
	const [mode, setMode] = useState<'phase' | 'tide'>('phase')
	const [direction, setDirection] = useState<'down' | 'up'>('down')
	const [beforeAfter, setComparing] = useState(false)
	const [fontsReady, setFontsReady] = useState(false)

	// Interaction modes — mutually exclusive
	const [cursorMode, setCursorMode] = useState(false)
	const [gyroMode, setGyroMode] = useState(false)
	const [motionMode, setMotionMode] = useState(false)

	// Gyro-driven values — kept separate from slider state so slider value props
	// never change during gyro mode (which would cause mobile to scroll to the input)
	const [gyroPeriod, setGyroPeriod] = useState(3.5)
	const [gyroAmplitude, setGyroAmplitude] = useState(0.012)

	// Motion-driven period — kept separate from slider state for the same reason as gyro
	const [motionPeriod, setMotionPeriod] = useState(3.5)
	// EMA smoothed speed ref — persists across renders without triggering re-renders
	const smoothedSpeedRef = useRef(0)
	// Last mouse position ref — used for per-frame delta calculation
	const lastMouseRef = useRef<{ x: number; y: number } | null>(null)

	// Detected capabilities — resolved client-side after mount
	const showCursor = useMediaQuery('(hover: hover)')
	const isTouch = useMediaQuery('(hover: none)')
	const hasOrientation = useClientValue(() => 'DeviceOrientationEvent' in window, false)
	const showGyro = isTouch && hasOrientation
	// Motion mode always available on the client: mouse speed on desktop, DeviceMotionEvent on mobile
	const showMotion = useClientValue(() => true, false)

	useEffect(() => {
		document.fonts.ready.then(() => setFontsReady(true))
	}, [])

	useEffect(() => {
	}, [])

	// Derived amplitude max for current axis — memoised; only recomputed when axis changes
	const { isLetterSpacing, amplitudeLabel, amplitudeMax, amplitudeStep } = useMemo(() => {
		const ls = axis === 'letter-spacing'
		return {
			isLetterSpacing: ls,
			amplitudeLabel: ls ? 'Amplitude (em)' : `Amplitude (× ${axis === 'wght' ? '400' : '100'} ${axis} units)`,
			amplitudeMax: ls ? 0.06 : axis === 'wght' ? 0.8 : 0.5,
			amplitudeStep: ls ? 0.001 : 0.01,
		}
	}, [axis])

	// Cursor mode — X controls period (1–10s in 0.5 steps), Y controls amplitude (inverted: top = amplitudeMax)
	useEffect(() => {
		if (!cursorMode) return
		const handleMove = (e: MouseEvent) => {
			const rawPeriod = 1 + (e.clientX / window.innerWidth) * 9
			setPeriod(Math.round(rawPeriod / 0.5) * 0.5)
			const rawAmplitude = amplitudeMax * (1 - e.clientY / window.innerHeight)
			setAmplitude(parseFloat(Math.max(0, Math.min(amplitudeMax, rawAmplitude)).toFixed(3)))
		}
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setCursorMode(false)
		}
		window.addEventListener('mousemove', handleMove)
		window.addEventListener('keydown', handleKey)
		return () => {
			window.removeEventListener('mousemove', handleMove)
			window.removeEventListener('keydown', handleKey)
		}
	}, [cursorMode, amplitudeMax])

	// Gyro mode — gamma controls period, beta controls amplitude
	// Updates gyroPeriod/gyroAmplitude (not slider state) so slider value props stay frozen,
	// preventing mobile browsers from scrolling to the input on each orientation update.
	// rAF throttle limits re-renders to one per frame. Guard skips setState when value unchanged.
	useEffect(() => {
		if (!gyroMode) return
		let rafId: number | null = null
		const handleOrientation = (e: DeviceOrientationEvent) => {
			if (rafId !== null) return
			rafId = requestAnimationFrame(() => {
				rafId = null
				if (e.gamma !== null) {
					// gamma: -90 (tilt left) to 90 (tilt right) → period 1–10s in 0.5 steps
					const rawPeriod = 1 + ((e.gamma + 90) / 180) * 9
					const next = Math.round(rawPeriod / 0.5) * 0.5
					setGyroPeriod(prev => prev !== next ? next : prev)
				}
				if (e.beta !== null) {
					// beta when holding portrait: ~90 upright, decreases when tilted back toward you
					// Clamp to [15, 90] then map to [0, amplitudeMax]: upright = amplitudeMax, tilted back = 0
					const clamped = Math.max(15, Math.min(90, e.beta))
					const next = parseFloat((amplitudeMax * ((clamped - 15) / 75)).toFixed(3))
					setGyroAmplitude(prev => prev !== next ? next : prev)
				}
			})
		}
		window.addEventListener('deviceorientation', handleOrientation)
		return () => {
			window.removeEventListener('deviceorientation', handleOrientation)
			if (rafId !== null) cancelAnimationFrame(rafId)
		}
	}, [gyroMode, amplitudeMax])

	// Motion mode — desktop: mouse speed via mousemove; mobile: DeviceMotionEvent acceleration magnitude
	// Maps smoothed speed/magnitude to period: fast movement → short period, stillness → long period
	// Guard skips setState when rounded value is unchanged to avoid redundant re-renders.
	useEffect(() => {
		if (!motionMode) return

		let rafId: number | null = null

		if (typeof DeviceMotionEvent !== 'undefined') {
			// Mobile path: use accelerometer magnitude
			const handleMotion = (e: DeviceMotionEvent) => {
				if (rafId !== null) return
				rafId = requestAnimationFrame(() => {
					rafId = null
					const accel = e.accelerationIncludingGravity
					if (!accel) return
					const x = accel.x ?? 0
					const y = accel.y ?? 0
					const z = accel.z ?? 0
					const magnitude = Math.sqrt(x * x + y * y + z * z)
					smoothedSpeedRef.current = 0.9 * smoothedSpeedRef.current + 0.1 * magnitude
					const next = speedToPeriod(smoothedSpeedRef.current)
					setMotionPeriod(prev => prev !== next ? next : prev)
				})
			}
			window.addEventListener('devicemotion', handleMotion)
			return () => {
				window.removeEventListener('devicemotion', handleMotion)
				if (rafId !== null) cancelAnimationFrame(rafId)
			}
		} else {
			// Desktop path: use mouse movement speed
			const handleMouseMove = (e: MouseEvent) => {
				const last = lastMouseRef.current
				if (last !== null) {
					const dx = e.clientX - last.x
					const dy = e.clientY - last.y
					const speed = Math.sqrt(dx * dx + dy * dy)
					smoothedSpeedRef.current = 0.9 * smoothedSpeedRef.current + 0.1 * speed
					const next = speedToPeriod(smoothedSpeedRef.current)
					setMotionPeriod(prev => prev !== next ? next : prev)
				}
				lastMouseRef.current = { x: e.clientX, y: e.clientY }
			}
			window.addEventListener('mousemove', handleMouseMove)
			return () => {
				window.removeEventListener('mousemove', handleMouseMove)
				if (rafId !== null) cancelAnimationFrame(rafId)
			}
		}
	}, [motionMode])

	// Toggle cursor mode — turns off gyro and motion if active
	const toggleCursor = useCallback(() => {
		setGyroMode(false)
		setMotionMode(false)
		setCursorMode(v => !v)
	}, [])

	// Toggle gyro mode — requests iOS permission if needed, turns off cursor and motion if active
	const toggleGyro = useCallback(async () => {
		if (gyroMode) {
			setGyroMode(false)
			return
		}
		setCursorMode(false)
		setMotionMode(false)
		const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
			requestPermission?: () => Promise<PermissionState>
		}
		if (typeof DOE.requestPermission === 'function') {
			try {
				const permission = await DOE.requestPermission()
				if (permission === 'granted') setGyroMode(true)
			} catch {
				// Permission request failed (e.g. called outside user gesture in future browser)
			}
		} else {
			setGyroMode(true)
		}
	}, [gyroMode])

	// Toggle motion mode — requests iOS permission if needed, turns off cursor and gyro if active, resets smoothed speed
	const toggleMotion = useCallback(async () => {
		if (motionMode) {
			setMotionMode(false)
			return
		}
		setCursorMode(false)
		setGyroMode(false)
		smoothedSpeedRef.current = 0
		lastMouseRef.current = null

		// iOS 13+: DeviceMotionEvent exists even when denied — must request permission
		const DME = DeviceMotionEvent as typeof DeviceMotionEvent & {
			requestPermission?: () => Promise<PermissionState>
		}
		if (typeof DME.requestPermission === 'function') {
			try {
				const permission = await DME.requestPermission()
				if (permission === 'granted') setMotionMode(true)
				// If denied or dismissed: silently do nothing (button stays inactive)
			} catch {
				// Permission request failed
			}
		} else {
			setMotionMode(true)
		}
	}, [motionMode])

	// Effective values: motion → gyro → cursor/slider precedence
	const effectivePeriod = motionMode ? motionPeriod : (gyroMode ? gyroPeriod : period)
	const effectiveAmplitude = gyroMode ? gyroAmplitude : amplitude

	const dAmplitude = useDeferredValue(effectiveAmplitude)
	const dPeriod = useDeferredValue(effectivePeriod)
	const dPhaseOffset = useDeferredValue(phaseOffset)

	const handleAxisChange = useCallback((v: Axis) => {
		setAxis(v)
		setAmplitude(AXIS_AMPLITUDE_DEFAULTS[v])
	}, [])

	const activeMode = cursorMode || gyroMode || motionMode

	// Interaction-mode button group — only rendered after client-side capability detection
	const interactionButtons = (showCursor || showGyro || showMotion) && (
		<div className="flex items-center gap-3 ml-auto">
			{showCursor && (
				<button
					onClick={toggleCursor}
					aria-pressed={cursorMode}
					aria-keyshortcuts={cursorMode ? 'Escape' : undefined}
					title="Move cursor to control period (X) and amplitude (Y)"
					className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all"
					style={{
						borderColor: 'currentColor',
						opacity: cursorMode ? 1 : 0.5,
						background: cursorMode ? 'var(--btn-bg)' : 'transparent',
					}}
				>
					<CursorIcon />
					<span>{cursorMode ? 'Esc to exit' : 'Cursor'}</span>
				</button>
			)}
			{showGyro && (
				<button
					onClick={toggleGyro}
					aria-pressed={gyroMode}
					title="Tilt your device to control period (left/right) and amplitude (front/back)"
					className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all"
					style={{
						borderColor: 'currentColor',
						opacity: gyroMode ? 1 : 0.5,
						background: gyroMode ? 'var(--btn-bg)' : 'transparent',
					}}
				>
					<GyroIcon />
					<span>{gyroMode ? 'Tilt active' : 'Tilt'}</span>
				</button>
			)}
			{showMotion && (
				<button
					onClick={toggleMotion}
					aria-pressed={motionMode}
					title="Move quickly to speed up the oscillation, stay still to slow it down"
					className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all"
					style={{
						borderColor: 'currentColor',
						opacity: motionMode ? 1 : 0.5,
						background: motionMode ? 'var(--btn-bg)' : 'transparent',
					}}
				>
					<MotionIcon />
					<span>{motionMode ? 'Motion active' : 'Motion'}</span>
				</button>
			)}
		</div>
	)

	return (
		<div className="w-full">
			<div className={`grid gap-6 mb-6 ${mode === 'phase' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
				<Slider label={amplitudeLabel} value={amplitude} min={0} max={amplitudeMax} step={amplitudeStep} fmt={v => v.toFixed(3)} title="Peak change per oscillation cycle — higher values create more visible breathing motion; at low values the movement is subliminal" onChange={setAmplitude} />
				<Slider label="Period (s)" value={period} min={1} max={10} step={0.5} title="Seconds per full oscillation cycle — longer period = slower, more meditative breathing; shorter period = faster, more urgent rhythm" onChange={setPeriod} />
				{mode === 'phase' && (
					<Slider label="Phase offset" value={phaseOffset} min={0.1} max={Math.round(Math.PI * 100) / 100} step={0.05} fmt={v => `${(v / Math.PI).toFixed(2)}π`} title="Phase difference between adjacent lines in radians — higher values spread lines further apart in the breathing cycle, creating a more pronounced wave through the paragraph" onChange={setPhaseOffset} />
				)}
			</div>
			<div className="flex flex-wrap items-center gap-3 mb-8">
				<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Axis</span>
				{(['letter-spacing', 'wdth', 'wght'] as const).map(v => (
					<button key={v} onClick={() => handleAxisChange(v)} aria-pressed={axis === v} title={v === 'letter-spacing' ? 'Oscillate letter-spacing — changes text density; works with any font' : v === 'wdth' ? 'Oscillate the wdth variable font axis — changes character width; requires a variable font with a wdth axis' : 'Oscillate the wght variable font axis — changes stroke weight; requires a variable font with a wght axis'} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: axis === v ? 1 : 0.5, background: axis === v ? 'var(--btn-bg)' : 'transparent' }}>{v}</button>
				))}
				<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted ml-4">Wave</span>
				{(['sine', 'triangle', 'sawtooth'] as const).map(v => (
					<button key={v} onClick={() => setWaveShape(v)} aria-pressed={waveShape === v} title={v === 'sine' ? 'Sine wave — smooth, organic, continuous motion that eases in and out at the extremes; the most natural-feeling breath' : v === 'triangle' ? 'Triangle wave — linear ramps with sharp reversals; more mechanical and rhythmic than sine' : 'Sawtooth wave — instant reset followed by a slow ramp; creates an asymmetric, tidal surge quality'} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: waveShape === v ? 1 : 0.5, background: waveShape === v ? 'var(--btn-bg)' : 'transparent' }}>{v}</button>
				))}
				<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted ml-4">Mode</span>
				{(['phase', 'tide'] as const).map(v => (
					<button key={v} onClick={() => setMode(v)} aria-pressed={mode === v} title={v === 'phase' ? 'Phase mode — each line has a fixed offset in the oscillation cycle, determined by the Phase offset slider; lines never synchronise' : 'Tide mode — the oscillation peak travels through the paragraph from top to bottom (or bottom to top), like a wave passing through the text'} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: mode === v ? 1 : 0.5, background: mode === v ? 'var(--btn-bg)' : 'transparent' }}>{v}</button>
				))}
				{mode === 'phase' && (
					<span className="text-xs text-subtle italic ml-2">— each line oscillates independently</span>
				)}
				{mode === 'tide' && (
					<>
						<span className="text-xs text-subtle italic ml-2">— wave travels through paragraph</span>
						<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted ml-4">Dir</span>
						{(['down', 'up'] as const).map(v => (
							<button key={v} onClick={() => setDirection(v)} aria-pressed={direction === v} title={v === 'down' ? 'Wave travels from the first line to the last — the breath descends through the paragraph' : 'Wave travels from the last line to the first — the breath ascends through the paragraph'} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: direction === v ? 1 : 0.5, background: direction === v ? 'var(--btn-bg)' : 'transparent' }}>{v}</button>
						))}
					</>
				)}
				{interactionButtons}
			</div>
			<div className="relative pb-8">
				{fontsReady && (
					<BreatheText amplitude={dAmplitude} period={dPeriod} phaseOffset={dPhaseOffset} waveShape={waveShape} axis={axis} mode={mode} direction={direction} style={SAMPLE_STYLE}>
						{SAMPLE}
					</BreatheText>
				)}
				{beforeAfter && (
					<p aria-hidden style={{ ...SAMPLE_STYLE, position: 'absolute', top: 0, left: 0, width: '100%', margin: 0, opacity: 0.25, pointerEvents: 'none' }}>{SAMPLE}</p>
				)}
				<BeforeAfterToggle active={beforeAfter} onClick={() => setComparing(v => !v)} />
			</div>
			<p aria-live="polite" aria-atomic="true" className="text-xs text-muted italic mt-8" style={{ lineHeight: "1.8" }}>
				{activeMode
					? cursorMode
						? 'Move cursor to adjust period and amplitude. Press Esc to exit.'
						: motionMode
							? 'Head motion drives the breath — moving faster speeds up the oscillation, stillness slows it.'
							: 'Tilt left/right for period, front/back for amplitude.'
					: mode === 'phase'
						? `Each line oscillates at ±${effectiveAmplitude.toFixed(3)} ${isLetterSpacing ? 'em' : axis + ' units'}, period ${effectivePeriod}s, phase offset ${(phaseOffset / Math.PI).toFixed(2)}π per line.`
						: `A ${waveShape} wave traveling ${direction === 'down' ? 'top to bottom' : 'bottom to top'}, ±${effectiveAmplitude.toFixed(3)} on the ${axis} axis every ${effectivePeriod}s.`
				}
			</p>
		</div>
	)
}
