'use client';

import { signIn, signOut, useSession } from 'next-auth/react';

export default function HomePage(): JSX.Element {
  const { data: session, status } = useSession();

  return (
    <main>
      <section className="card">
        <h1>XAuto Admin</h1>
        <p>Use Google sign-in to manage model providers, PAT tokens, and jobs.</p>
        {status === 'authenticated' ? (
          <>
            <p className="small">Signed in as: {session.user?.email}</p>
            <p>
              <a href="/dashboard">Go to dashboard</a>
            </p>
            <p>
              <a href="/h5">Open H5 showcase</a>
            </p>
            <button className="secondary" onClick={() => signOut()}>
              Sign out
            </button>
          </>
        ) : (
          <button onClick={() => signIn('google')}>Sign in with Google</button>
        )}
      </section>
    </main>
  );
}
