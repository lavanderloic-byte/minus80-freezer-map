import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: '−80°C Freezer Map',
  description: 'Mobile-first shared freezer space map for HKUST(GZ).',
  openGraph: {
    title: '−80°C Freezer Map',
    description: 'HKUST(GZ) Shared Storage · Find samples fast',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: '−80°C Freezer Map' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '−80°C Freezer Map',
    description: 'HKUST(GZ) Shared Storage · Find samples fast',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
