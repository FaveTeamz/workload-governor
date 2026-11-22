import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WorkloadGovernor Dashboard',
  description: 'Contributor dashboard for the WorkloadGovernor platform on Stellar',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
