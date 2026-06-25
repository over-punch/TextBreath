// OG image for textbreath.com — generated at build time via next/og
// Satori (used by ImageResponse) supports TTF and WOFF but not WOFF2.
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const alt = 'Text Breath — Per-line letter-spacing and axis wave animation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
	const interLight = await readFile(join(process.cwd(), 'public/fonts/inter-300.woff'))
	return new ImageResponse(
		(
			<div style={{ background: '#d6e6fb', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '72px 80px', fontFamily: 'Inter, sans-serif' }}>
				{/* Label */}
				<span style={{ fontSize: 13, letterSpacing: '0.18em', color: '#424e5d', textTransform: 'uppercase' }}>textbreath</span>

				{/* Breathing bars preview + headline */}
				<div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 48 }}>
						{[1.0, 0.97, 0.92, 0.96, 1.0].map((scale, i) => (
							<div key={i} style={{ width: `${scale * 520}px`, height: 3, background: i % 2 === 0 ? '#424e5d' : '#7d8794', borderRadius: 2 }} />
						))}
					</div>
					<div style={{ fontSize: 76, color: '#0f253e', lineHeight: 1.06, fontWeight: 300 }}>The paragraph</div>
					<div style={{ fontSize: 76, color: '#424e5d', lineHeight: 1.06, fontWeight: 300 }}>breathes.</div>
				</div>

				{/* Footer */}
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
					<div style={{ fontSize: 14, color: '#424e5d', letterSpacing: '0.04em', display: 'flex', gap: 20 }}>
						<span>TypeScript</span>
						<span style={{ opacity: 0.4 }}>·</span>
						<span>rAF animation</span>
						<span style={{ opacity: 0.4 }}>·</span>
						<span>React + Vanilla JS</span>
					</div>
					<div style={{ fontSize: 13, color: '#5f6a78', letterSpacing: '0.04em' }}>textbreath.com</div>
				</div>
			</div>
		),
		{ ...size, fonts: [{ name: 'Inter', data: interLight, style: 'normal', weight: 300 }] },
	)
}
