import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_TITLE ?? 'Brief Generator',
  description: 'Vacancy design brief generator for Employer Brand teams.',
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
