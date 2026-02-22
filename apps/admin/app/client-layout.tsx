'use client';

import { SessionProvider } from 'next-auth/react';

export default function ClientLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return <SessionProvider>{children}</SessionProvider>;
}
