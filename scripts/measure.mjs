// textBreath/scripts/measure.mjs — measures the shipped dist/core.js in Chromium and draws the README's wave chart.
// Samples every line's letter-spacing frame by frame in both modes (→ assets/textbreath-waves.svg), measures how far
// a line's width swings per axis/amplitude, and reads per-frame style+layout+script cost from Chrome's Performance
// metrics for 1 vs 40 animated paragraphs. All numbers printed here are what the README quotes.
//
// Run: npm run build && node scripts/measure.mjs   (PORT=5963 to pin the local server port; default is a free port)
// Deps: playwright (dev).

import { createServer } from "node:http"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { extname, join } from "node:path"
import { chromium } from "playwright"

/** Repo root — the script is run from it (npm run measure). */
const ROOT = process.cwd()
/** Local server port; 0 = any free port. */
const PORT = Number(process.env.PORT ?? 0)
/** Animation period in seconds used for every measurement (the library default). */
const PERIOD = 3.5
/** Sample paragraph (the textbreath.com demo copy). */
const TEXT = "Hold still and watch the paragraph. Each line is breathing at its own pace — expanding and contracting its letter-spacing in a slow oscillation, offset from its neighbours by a fixed phase angle. The top lines and the bottom lines never breathe together. A wave moves through the paragraph rather than a pulse. At the default amplitude the movement is almost subliminal: you notice something alive before you notice what it is."

/** Content types for the tiny static server. */
const MIME = { ".html": "text/html", ".js": "application/javascript", ".woff2": "font/woff2", ".woff": "font/woff" }

const server = createServer(async (req, res) => {
	try {
		const url = decodeURIComponent((req.url ?? "/").split("?")[0])
		const path = join(ROOT, url)
		const data = await readFile(path)
		res.writeHead(200, { "Content-Type": MIME[extname(path)] ?? "application/octet-stream" })
		res.end(data)
	} catch {
		res.writeHead(404); res.end("not found")
	}
})
await new Promise((r) => server.listen(PORT, r))
const { port } = server.address()

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 800, height: 900 } })
await page.goto(`http://localhost:${port}/scripts/measure.html`)
await page.evaluate(async () => {
	window.core = await import("/dist/core.js")
	await document.fonts.load('18px "Merriweather"')
	await document.fonts.ready
})

/**
 * Sample each line's letter-spacing offset as written by the library (in em) every frame for one period, in real time.
 * @param mode - 'phase' | 'tide'
 * @returns {{ t: number, v: number[] }[]} samples
 */
async function sampleWaves(mode) {
	return page.evaluate(async ({ mode, TEXT, PERIOD }) => {
		const root = document.getElementById("root")
		root.innerHTML = `<p class="para">${TEXT}</p>`
		const el = root.firstChild
		const opts = { amplitude: 0.012, period: PERIOD, mode, pauseOffscreen: false }
		const { lineSpans } = core.applyBreathe(el, core.getCleanHTML(el), opts)
		const stop = core.startBreathe(lineSpans, opts)
		const samples = []
		const t0 = performance.now()
		await new Promise((done) => {
			const step = (now) => {
				const t = (now - t0) / 1000
				samples.push({ t, v: lineSpans.map((s) => parseFloat(s.style.letterSpacing) || 0) })
				if (t < PERIOD) requestAnimationFrame(step); else done()
			}
			requestAnimationFrame(step)
		})
		stop()
		return samples
	}, { mode, TEXT, PERIOD })
}

/**
 * Largest peak-to-peak width change of any line over one period, with that line's character count.
 * @param axis      - 'letter-spacing' | 'wdth' | 'wght'
 * @param amplitude - option value
 */
async function widthSwing(axis, amplitude) {
	return page.evaluate(async ({ axis, amplitude, TEXT, PERIOD }) => {
		const root = document.getElementById("root")
		root.innerHTML = `<p class="para">${TEXT}</p>`
		const el = root.firstChild
		const opts = { amplitude, axis, period: PERIOD, pauseOffscreen: false }
		const { lineSpans } = core.applyBreathe(el, core.getCleanHTML(el), opts)
		const stop = core.startBreathe(lineSpans, opts)
		const min = lineSpans.map(() => Infinity), max = lineSpans.map(() => -Infinity)
		const t0 = performance.now()
		await new Promise((done) => {
			const step = (now) => {
				lineSpans.forEach((s, i) => { const w = s.getBoundingClientRect().width; min[i] = Math.min(min[i], w); max[i] = Math.max(max[i], w) })
				if (now - t0 < PERIOD * 1000) requestAnimationFrame(step); else done()
			}
			requestAnimationFrame(step)
		})
		stop()
		let best = 0
		lineSpans.forEach((_, i) => { if (max[i] - min[i] > max[best] - min[best]) best = i })
		return { swing: +(max[best] - min[best]).toFixed(1), chars: lineSpans[best].textContent.trim().length }
	}, { axis, amplitude, TEXT, PERIOD })
}

/**
 * Per-frame Chrome style + layout + script time with `count` paragraphs animating (or static when animate=false).
 * @param count   - number of paragraphs
 * @param animate - start the breathe loop
 */
async function frameCost(count, animate) {
	await page.evaluate(({ count, animate, TEXT, PERIOD }) => {
		const root = document.getElementById("root")
		window.__stops?.forEach((s) => s())
		root.innerHTML = Array.from({ length: count }, () => `<p class="para">${TEXT}</p>`).join("")
		window.__stops = []
		if (!animate) return
		for (const el of root.children) {
			const opts = { period: PERIOD, pauseOffscreen: false }
			const { lineSpans } = core.applyBreathe(el, core.getCleanHTML(el), opts)
			window.__stops.push(core.startBreathe(lineSpans, opts))
		}
	}, { count, animate, TEXT, PERIOD })
	const cdp = await page.context().newCDPSession(page)
	await cdp.send("Performance.enable")
	const pick = (m) => Object.fromEntries(m.metrics.map((x) => [x.name, x.value]))
	await page.waitForTimeout(300)
	const before = pick(await cdp.send("Performance.getMetrics"))
	const frames = await page.evaluate(() => new Promise((done) => {
		let n = 0; const t0 = performance.now()
		const step = (now) => { n++; if (now - t0 < 3000) requestAnimationFrame(step); else done(n) }
		requestAnimationFrame(step)
	}))
	const after = pick(await cdp.send("Performance.getMetrics"))
	await cdp.detach()
	const ms = (k) => (after[k] - before[k]) * 1000
	const total = ms("RecalcStyleDuration") + ms("LayoutDuration") + ms("ScriptDuration")
	return { count, animate, frames, msPerFrame: +(total / frames).toFixed(2) }
}

const phase = await sampleWaves("phase")
const tide = await sampleWaves("tide")
const swings = {
	"letter-spacing 0.012": await widthSwing("letter-spacing", 0.012),
	"letter-spacing 0.05": await widthSwing("letter-spacing", 0.05),
	"wdth 0.012": await widthSwing("wdth", 0.012),
	"wdth 0.1": await widthSwing("wdth", 0.1),
	"wght 0.012": await widthSwing("wght", 0.012),
}
const costs = [await frameCost(1, false), await frameCost(1, true), await frameCost(40, false), await frameCost(40, true)]
const ua = await page.evaluate(() => navigator.userAgent)

await browser.close()
server.close()

console.log("Browser:", ua)
console.log("Lines in sample paragraph (600px, Merriweather 18px):", phase[0].v.length)
console.log("Peak line-width swing over one period (px), widest-swinging line:")
for (const [k, v] of Object.entries(swings)) console.log(`  ${k.padEnd(22)} ${v.swing} px  (line of ${v.chars} chars)`)
console.log("Chrome style+layout+script per frame over 3 s:")
for (const c of costs) console.log(`  ${String(c.count).padStart(2)} paragraph(s) ${c.animate ? "animating" : "static   "}  ${c.msPerFrame} ms/frame  (${c.frames} frames)`)

// --- Draw the wave chart: rows = lines, columns = time, shade = letter-spacing ---

/**
 * Bucket samples into fixed time columns (mean of each bucket) so the SVG stays small.
 * @param samples - from sampleWaves
 * @param cols    - number of columns across one period
 */
function bucket(samples, cols) {
	const lines = samples[0].v.length
	const out = Array.from({ length: lines }, () => Array(cols).fill(0))
	const n = Array(cols).fill(0)
	for (const s of samples) {
		const c = Math.min(cols - 1, Math.floor((s.t / PERIOD) * cols))
		n[c]++
		s.v.forEach((v, i) => { out[i][c] += v })
	}
	return out.map((row) => row.map((v, c) => (n[c] ? v / n[c] : 0)))
}

/**
 * Map a letter-spacing value in [-0.012, 0.012] em to a blue ramp (tight = pale, loose = deep).
 * @param v - letter-spacing in em
 */
function shade(v) {
	const x = Math.max(0, Math.min(1, (v + 0.012) / 0.024))
	const L = 0.97 - x * 0.55
	const C = 0.015 + x * 0.12
	return `oklch(${L.toFixed(3)} ${C.toFixed(3)} 254)`
}

const COLS = 70, CELL_W = 6, CELL_H = 18, LEFT = 64, TOP = 56, GAP = 46
/**
 * One panel of the chart.
 * @param grid  - bucketed values
 * @param x0    - left edge
 * @param title - panel title
 */
function panel(grid, x0, title) {
	let s = `<text x="${x0}" y="${TOP - 18}" class="h">${title}</text>`
	grid.forEach((row, i) => {
		row.forEach((v, c) => { s += `<rect x="${x0 + c * CELL_W}" y="${TOP + i * CELL_H}" width="${CELL_W + 0.3}" height="${CELL_H - 2}" fill="${shade(v)}"/>` })
		// Mark the moment this line is loosest, so the crest's path reads at a glance.
		const peak = row.indexOf(Math.max(...row))
		s += `<circle cx="${x0 + peak * CELL_W + CELL_W / 2}" cy="${TOP + i * CELL_H + (CELL_H - 2) / 2}" r="4" fill="#fff" stroke="#0f253e" stroke-width="1.5"/>`
	})
	for (let sec = 0; sec <= 3; sec++) {
		const x = x0 + (sec / PERIOD) * COLS * CELL_W
		s += `<text x="${x}" y="${TOP + grid.length * CELL_H + 16}" class="t" text-anchor="middle">${sec} s</text>`
	}
	return s
}
const gP = bucket(phase, COLS), gT = bucket(tide, COLS)
const panelW = COLS * CELL_W
const W = LEFT + panelW * 2 + GAP + 24
const H = TOP + gP.length * CELL_H + 84
let labels = ""
gP.forEach((_, i) => { labels += `<text x="${LEFT - 10}" y="${TOP + i * CELL_H + 12}" class="t" text-anchor="end">line ${i + 1}</text>` })
const legendX = LEFT
let legend = `<text x="${legendX}" y="${H - 32}" class="t">tighter</text>`
for (let k = 0; k < 24; k++) legend += `<rect x="${legendX + 46 + k * 6}" y="${H - 42}" width="6.3" height="12" fill="${shade(-0.012 + (k / 23) * 0.024)}"/>`
legend += `<text x="${legendX + 46 + 24 * 6 + 8}" y="${H - 32}" class="t">looser (±0.012 em, the default amplitude) · ○ = each line's loosest moment</text>`
legend += `<text x="${legendX}" y="${H - 14}" class="t">One 3.5 s period of a 7-line Merriweather paragraph, sampled every frame in Chromium from dist/core.js (scripts/measure.mjs).</text>`
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Letter-spacing of each line over one period: in phase mode each line peaks at a different time; in tide mode the peak travels down the paragraph">
<style>.h{font:600 14px system-ui,-apple-system,Segoe UI,sans-serif;fill:#0f253e}.t{font:11px system-ui,-apple-system,Segoe UI,sans-serif;fill:#424e5d}</style>
<rect width="${W}" height="${H}" rx="14" fill="#f4f8fe"/>
${labels}${panel(gP, LEFT, "mode: 'phase' — each line on its own offset")}${panel(gT, LEFT + panelW + GAP, "mode: 'tide' — the peak travels down")}${legend}
</svg>
`
await mkdir("assets", { recursive: true })
await writeFile("assets/textbreath-waves.svg", svg)
console.log("Wrote assets/textbreath-waves.svg")
