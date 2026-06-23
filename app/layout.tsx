import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_TITLE ?? 'PR Comms Tools',
  description: 'Internal Universe PR and communications tool workspace.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
