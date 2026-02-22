import type { Metadata } from 'next';
import './styles.css';
import ClientLayout from './client-layout';

export const metadata: Metadata = {
  title: 'XAuto Admin',
  description: 'XAuto admin panel'
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
