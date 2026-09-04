import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentReady — AI Commerce Infrastructure',
  description:
    'AI-powered product discovery with deterministic constraint enforcement and Razorpay payment integration.',
  keywords: ['AI commerce', 'agent shopping', 'Razorpay', 'AI buyer'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#0a0a0a] text-[#e8e0d0] font-[Inter,sans-serif] antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
