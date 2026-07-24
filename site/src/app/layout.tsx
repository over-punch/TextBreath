import type { Metadata } from "next"
import "./globals.css"
import localFont from "next/font/local"
import SiteHeader from "../components/SiteHeader"

const inter = localFont({ src: "../../public/fonts/inter-300.woff", variable: "--font-sans", weight: "300" })

export const metadata: Metadata = {
	title: "Text Breath — Per-line letter-spacing and axis wave animation",
	icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
	description: "Text Breath gives a paragraph a living quality: each line oscillates its letter-spacing or variable font axis at a phase offset from its neighbours. Two modes — phase ripple and traveling tide.",
	keywords: ["text breath", "letter spacing animation", "variable font animation", "typography", "TypeScript", "npm", "rAF", "oscillation", "wave"],
	openGraph: {
		title: "Text Breath — Per-line letter-spacing and axis wave animation",
		description: "Each line breathes at its own phase — or a wave travels through the paragraph. Drive letter-spacing, wdth, or wght. Two modes, zero dependencies.",
		url: "https://textbreath.com",
		siteName: "Text Breath",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Text Breath — Per-line letter-spacing and axis wave animation",
		description: "Each line breathes at its own phase — or a wave travels through the paragraph. Drive letter-spacing, wdth, or wght. Two modes, zero dependencies.",
	},
	metadataBase: new URL("https://textbreath.com"),
	alternates: { canonical: "https://textbreath.com" },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`h-full antialiased ${inter.variable}`}>
			<body className="min-h-full flex flex-col">
				<SiteHeader current="textBreath" githubUrl="https://github.com/Liiift-Studio/TextBreath" />{children}</body>
		</html>
	)
}
