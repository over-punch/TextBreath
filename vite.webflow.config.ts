// vite.webflow.config.ts — standalone minified IIFE bundle for Webflow Custom Code Embed.
// Produces a single self-contained browser global (window.TextBreath) with no module loader,
// no React, and no external dependencies — droppable into a Webflow embed via one <script> tag.
import { defineConfig } from 'vite'

export default defineConfig({
	build: {
		// Do not wipe dist/ — the library build (vite.config.ts) writes index.js/.cjs there too.
		emptyOutDir: false,
		lib: {
			entry: 'src/webflow/embed.ts',
			formats: ['iife'],
			// Exposes the module's exports (init, restart, destroy) as window.TextBreath.
			name: 'TextBreath',
			fileName: () => 'textbreath.webflow.min.js',
		},
		rollupOptions: {
			// The core's optional `import('@chenglou/pretext')` (canvas line detection) must not
			// be inlined — the embed defaults to BCR line detection, and bundling pretext would add
			// tens of kB of dead weight. Kept external: the runtime import() resolves lazily and the
			// core already falls back to BCR when the module is absent.
			external: ['@chenglou/pretext'],
		},
		minify: true,
	},
})
