import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import { themeScript } from '@/lib/theme';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-jb', display: 'swap' });

const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: 'NetForge Academy — learn networking by building networks', template: '%s · NetForge Academy' },
  description:
    'Interactive networking academy: visual lessons, a real simulation engine, hands-on labs and troubleshooting challenges — from "what is a network?" to multi-VLAN, multi-router designs.',
  keywords: ['networking course', 'CCNA practice', 'subnetting practice', 'VLAN lab', 'network simulator', 'MikroTik'],
  openGraph: {
    type: 'website',
    siteName: 'NetForge Academy',
    title: 'NetForge Academy — learn networking by building networks',
    description: 'Visual lessons, live simulations and validated labs. See it, build it, break it, fix it.',
    url: site,
  },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0d12' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-1.5 focus:text-accent-fg">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
