import Demo from "@/components/Demo"
import Hero from "@/components/Hero"
import CodeBlock from "@/components/CodeBlock"
import { version } from "../../../package.json"
import { version as siteVersion } from "../../package.json"
import SiteFooter from "../components/SiteFooter"
import PortsSection from "../components/PortsSection"

export default function Home() {
	return (
		<main className="flex flex-col items-center px-6 py-20 gap-24">

			{/* Hero */}
			<Hero
				eyebrow="breathing letter-spacing"
				title={[{ text: "The paragraph" }, { text: "breathes.", italic: true, subtle: true }]}
				install="@liiift-studio/textbreath"
				github="https://github.com/Liiift-Studio/TextBreath"
				tech={["TypeScript", "Zero dependencies", "React + Vanilla JS"]}
			>
				<p className="text-base leading-relaxed max-w-lg">
					Each line of a paragraph oscillates its letter-spacing — or variable font axis — at a phase offset from its neighbours. Two modes: <em>phase</em> gives each line a fixed ripple; <em>tide</em> sends a traveling wave through the paragraph. At low amplitudes it reads as living rather than animated.
				</p>
			</Hero>

			{/* Demo */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-4">
				<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Live demo — watch the paragraph</h2>
				<div className="rounded-xl -mx-8 px-8 py-8" style={{ background: "var(--panel)", overflow: 'hidden' }}>
					<Demo />
				</div>
			</section>

			{/* Explanation */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">How it works</h2>
				<div className="prose-grid grid grid-cols-1 sm:grid-cols-2 gap-12 text-sm leading-relaxed">
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-base">Phase mode</p>
						<p>Each visual line is assigned a fixed phase offset. The wave function is evaluated at each line&rsquo;s phase every frame. Lines oscillate in place at staggered positions in the cycle — a standing ripple rather than a wave that moves.</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-base">Tide mode</p>
						<p>A wave travels through the paragraph from top to bottom (or bottom to top). Each line&rsquo;s phase advances with time and its position in the paragraph — the same wave that passes through floodText, but applied to letter-spacing or a variable font axis.</p>
					</div>
				</div>
			</section>

			{/* Usage */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<div className="flex items-baseline gap-4">
					<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Usage</h2>
				</div>
				<div className="flex flex-col gap-8 text-sm">
					<div className="flex flex-col gap-3">
						<p className="text-muted">Drop-in component</p>
						<CodeBlock code={`import { BreatheText } from '@liiift-studio/textbreath'

<BreatheText amplitude={0.012} period={3.5} phaseOffset={0.785}>
  Your paragraph text here...
</BreatheText>`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Hook</p>
						<CodeBlock code={`import { useBreathe } from '@liiift-studio/textbreath'

const ref = useBreathe({ amplitude: 0.012, period: 3.5, phaseOffset: 0.785 })
<p ref={ref}>{children}</p>`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Vanilla JS</p>
						<CodeBlock code={`import { applyBreathe, startBreathe, removeBreathe, getCleanHTML, BREATHE_CLASSES, sawtoothWave, triangleWave } from '@liiift-studio/textbreath'

const el = document.querySelector('p')
const original = getCleanHTML(el)
// applyBreathe accepts lineDetection and linePreservation only — animation options go to startBreathe
const { lineSpans } = applyBreathe(el, original)
const stop = startBreathe(lineSpans, { amplitude: 0.012, period: 3.5 })

// Later — stop animation and restore:
stop()
removeBreathe(el, original)

// BREATHE_CLASSES lets you target injected spans for custom CSS
// sawtoothWave / triangleWave are exported for building custom animations`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Options</p>
						<table className="w-full text-xs" aria-label="API options">
							<thead><tr className="text-subtle text-left"><th className="pb-2 pr-6 font-normal">Option</th><th className="pb-2 pr-6 font-normal">Default</th><th className="pb-2 font-normal">Description</th></tr></thead>
							<tbody className="text-muted zebra">
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">amplitude</td><td className="py-2 pr-6">0.012</td><td className="py-2">Peak change per cycle. Em for letter-spacing; multiplied by 100 for wdth (amplitude=1 → ±100 wdth units), multiplied by 400 for wght (amplitude=1 → ±400 wght units).</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">period</td><td className="py-2 pr-6">3.5</td><td className="py-2">Seconds per full oscillation cycle.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">phaseOffset</td><td className="py-2 pr-6">π/4</td><td className="py-2">Phase shift between adjacent lines in radians. Used in phase mode only.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">waveShape</td><td className="py-2 pr-6">&apos;sine&apos;</td><td className="py-2">&apos;sine&apos; | &apos;triangle&apos; | &apos;sawtooth&apos;</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">axis</td><td className="py-2 pr-6">&apos;letter-spacing&apos;</td><td className="py-2">&apos;letter-spacing&apos; | &apos;wdth&apos; | &apos;wght&apos;</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">mode</td><td className="py-2 pr-6">&apos;phase&apos;</td><td className="py-2">&apos;phase&apos; = standing ripple per line, &apos;tide&apos; = wave travels through paragraph.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">direction</td><td className="py-2 pr-6">&apos;down&apos;</td><td className="py-2">Tide travel direction. &apos;down&apos; | &apos;up&apos;. Used in tide mode only.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">lineDetection</td><td className="py-2 pr-6">&apos;bcr&apos;</td><td className="py-2">&apos;bcr&apos; reads actual browser layout — ground truth, works with any font and inline HTML. &apos;canvas&apos; uses <a href="https://github.com/chenglou/pretext" className="underline text-muted">@chenglou/pretext</a> for arithmetic line breaking with no forced reflow on resize. Install pretext separately.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">pauseOffscreen</td><td className="py-2 pr-6">true</td><td className="py-2">Skip animation work when the element is not in the viewport. Uses IntersectionObserver. The rAF loop keeps running — the tick simply does nothing while offscreen. Resume is instant with no frame delay.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">cancelOffscreen</td><td className="py-2 pr-6">false</td><td className="py-2">Cancel the rAF loop entirely when the element leaves the viewport and restart it on re-entry. Saves more CPU and battery than the default flag-based pause — useful for pages with many textBreath instances or long animations running offscreen. Adds one frame (~16 ms) of delay on resume. Requires pauseOffscreen to be true.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">linePreservation</td><td className="py-2 pr-6">&apos;none&apos;</td><td className="py-2">Line width strategy during animation. &apos;none&apos; — lines expand and contract freely. &apos;clamp&apos; — each line is constrained to its natural width via max-width and overflow: hidden, preventing container overflow at high amplitudes.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">as</td><td className="py-2 pr-6">&apos;p&apos;</td><td className="py-2">HTML element to render. (BreatheText only)</td></tr>
							</tbody>
						</table>
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Accessibility &amp; compatibility</p>
						<div className="text-xs text-muted flex flex-col gap-2">
							<p><strong>prefers-reduced-motion</strong> — <code>startBreathe</code> skips the animation loop when the user has requested reduced motion. The DOM structure is still built but no values are applied.</p>
							<p><strong>(update: slow)</strong> — On e-ink and slow-refresh displays (Kindle, reMarkable, etc.) both <code>applyBreathe</code> and <code>startBreathe</code> return immediately without restructuring the DOM or starting the rAF loop. The element is restored to its original HTML. Detection uses <code>matchMedia(&apos;(update: slow)&apos;)</code>.</p>
						</div>
					</div>
				</div>
			</section>

			<PortsSection npm="@liiift-studio/textbreath" bundle="textbreath" attr="data-textbreath" figma="frozen" framerComponent="TextBreath" repo="Liiift-Studio/TextBreath" />

			<SiteFooter current="textBreath" npmVersion={version} siteVersion={siteVersion} />

		</main>
	)
}
