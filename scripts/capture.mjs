// README Studio animated-GIF harness for textBreath.
// Serves the repo over HTTP, renders scripts/capture.html (two live paragraphs
// driven by the built dist bundle), screenshots N frames across one full
// breathing period, then assembles a looping GIF via ffmpeg with a palette.
//
// Run: npm run build && node scripts/capture.mjs
// Deps: playwright (dev), ffmpeg on PATH.

import { createServer } from "node:http"
import { readFile, mkdir, rm } from "node:fs/promises"
import { extname, join } from "node:path"
import { spawnSync } from "node:child_process"
import { chromium } from "playwright"

const ROOT = process.cwd()
const PERIOD_MS = 3500   // matches options.period (3.5s) in capture.html
const FRAMES = 28        // frames across one period
const FPS = Math.round(FRAMES / (PERIOD_MS / 1000)) // ~8fps — smooth enough, small
const SCALE = 1          // capture.html cards are already retina-sized

const MIME = {
	".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript",
	".css": "text/css", ".json": "application/json", ".map": "application/json",
	".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff",
}

const server = createServer(async (req, res) => {
	try {
		const url = decodeURIComponent((req.url ?? "/").split("?")[0])
		const path = join(ROOT, url === "/" ? "/scripts/capture.html" : url)
		const data = await readFile(path)
		res.writeHead(200, { "Content-Type": MIME[extname(path)] ?? "application/octet-stream" })
		res.end(data)
	} catch {
		res.writeHead(404); res.end("not found")
	}
})

await new Promise((r) => server.listen(0, r))
const { port } = server.address()

await rm("assets/.frames", { recursive: true, force: true })
await mkdir("assets/.frames", { recursive: true })
await mkdir("assets", { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
await page.goto(`http://localhost:${port}/scripts/capture.html`, { waitUntil: "networkidle" })
await page.waitForFunction(() => window.__ready === true)
await page.waitForTimeout(300)

const el = await page.$("#hero")
const interval = PERIOD_MS / FRAMES
for (let i = 0; i < FRAMES; i++) {
	const n = String(i).padStart(3, "0")
	await el.screenshot({ path: `assets/.frames/f${n}.png`, omitBackground: true })
	await page.waitForTimeout(interval)
}
console.log("Captured %d frames", FRAMES)

await browser.close()
server.close()

// Assemble looping GIF in a single pass: scale to a README-friendly width and
// build a per-clip palette (stats_mode=diff keeps the palette small since most
// of the frame is static text). Output ~680px wide keeps the file lean.
const OUT_W = 680
const enc = spawnSync("ffmpeg", [
	"-y", "-i", "assets/.frames/f%03d.png",
	"-vf", `fps=${FPS},scale=${OUT_W}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64:stats_mode=diff[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle`,
	"-loop", "0",
	"assets/textbreath-demo.gif",
], { stdio: "inherit" })
if (enc.status !== 0) process.exit(enc.status ?? 1)

await rm("assets/.frames", { recursive: true, force: true })
console.log("Wrote assets/textbreath-demo.gif")
