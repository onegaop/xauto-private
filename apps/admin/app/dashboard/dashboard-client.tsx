'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';

type ProviderConfig = {
  id: string;
  provider: 'deepseek' | 'qwen';
  baseUrl: string;
  miniModel: string;
  digestModel: string;
  enabled: boolean;
  priority: number;
  monthlyBudgetCny: number;
  hasApiKey: boolean;
};

type JobRun = {
  _id: string;
  jobName: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
};

export default function DashboardClient(): JSX.Element {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [pat, setPat] = useState<string>('');
  const [message, setMessage] = useState<string>('');

  const [providerForm, setProviderForm] = useState({
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    miniModel: 'deepseek-chat',
    digestModel: 'deepseek-reasoner',
    enabled: true,
    priority: 100,
    monthlyBudgetCny: 100
  });

  const loadData = async (): Promise<void> => {
    const [providerRes, jobsRes] = await Promise.all([
      fetch('/api/admin/providers', { cache: 'no-store' }),
      fetch('/api/admin/jobs?limit=20', { cache: 'no-store' })
    ]);

    if (providerRes.ok) {
      setProviders((await providerRes.json()) as ProviderConfig[]);
    }

    if (jobsRes.ok) {
      setJobs((await jobsRes.json()) as JobRun[]);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const saveProvider = async (): Promise<void> => {
    setMessage('Saving provider config...');
    const res = await fetch('/api/admin/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(providerForm)
    });

    if (res.ok) {
      setMessage('Provider saved.');
      await loadData();
      return;
    }

    const payload = (await res.json()) as { error?: string };
    setMessage(`Provider save failed: ${payload.error ?? res.statusText}`);
  };

  const runJob = async (name: 'sync' | 'digest_daily' | 'digest_weekly'): Promise<void> => {
    setMessage(`Running ${name}...`);
    const res = await fetch(`/api/admin/jobs/${name}/run`, { method: 'POST' });
    if (res.ok) {
      setMessage(`${name} finished.`);
      await loadData();
      return;
    }

    const payload = (await res.json()) as { error?: string };
    setMessage(`Job failed: ${payload.error ?? res.statusText}`);
  };

  const createPat = async (): Promise<void> => {
    setMessage('Creating PAT...');
    const res = await fetch('/api/admin/pat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ios-main', expiresInDays: 365 })
    });

    if (res.ok) {
      const payload = (await res.json()) as { token: string };
      setPat(payload.token);
      setMessage('PAT created. Store it in iOS Keychain once.');
      return;
    }

    const payload = (await res.json()) as { error?: string };
    setMessage(`PAT creation failed: ${payload.error ?? res.statusText}`);
  };

  return (
    <main>
      <section className="card">
        <h1>XAuto Dashboard</h1>
        <p className="small">Manage providers, run jobs, and issue iOS read-only PAT tokens.</p>
        <button className="secondary" onClick={() => signOut()}>
          Sign out
        </button>
      </section>

      <section className="card">
        <h2>Provider Config</h2>
        <div className="row two">
          <label>
            Provider
            <select
              value={providerForm.provider}
              onChange={(event) => setProviderForm((prev) => ({ ...prev, provider: event.target.value as 'deepseek' | 'qwen' }))}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="qwen">Qwen</option>
            </select>
          </label>

          <label>
            Base URL
            <input
              value={providerForm.baseUrl}
              onChange={(event) => setProviderForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
            />
          </label>

          <label>
            API Key
            <input
              value={providerForm.apiKey}
              onChange={(event) => setProviderForm((prev) => ({ ...prev, apiKey: event.target.value }))}
            />
          </label>

          <label>
            Mini Model
            <input
              value={providerForm.miniModel}
              onChange={(event) => setProviderForm((prev) => ({ ...prev, miniModel: event.target.value }))}
            />
          </label>

          <label>
            Digest Model
            <input
              value={providerForm.digestModel}
              onChange={(event) => setProviderForm((prev) => ({ ...prev, digestModel: event.target.value }))}
            />
          </label>

          <label>
            Priority
            <input
              type="number"
              value={providerForm.priority}
              onChange={(event) =>
                setProviderForm((prev) => ({ ...prev, priority: Number(event.target.value) }))
              }
            />
          </label>

          <label>
            Monthly Budget (CNY)
            <input
              type="number"
              value={providerForm.monthlyBudgetCny}
              onChange={(event) =>
                setProviderForm((prev) => ({ ...prev, monthlyBudgetCny: Number(event.target.value) }))
              }
            />
          </label>

          <label>
            Enabled
            <select
              value={String(providerForm.enabled)}
              onChange={(event) =>
                setProviderForm((prev) => ({ ...prev, enabled: event.target.value === 'true' }))
              }
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
        </div>

        <button onClick={() => void saveProvider()}>Save provider</button>

        <h3>Current providers</h3>
        <ul>
          {providers.map((item) => (
            <li key={item.id}>
              <code>{item.provider}</code> model mini=<code>{item.miniModel}</code> digest=<code>{item.digestModel}</code> enabled=
              <code>{String(item.enabled)}</code> apiKey=<code>{item.hasApiKey ? 'set' : 'missing'}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Job Controls</h2>
        <div className="row two">
          <button onClick={() => void runJob('sync')}>Run Sync</button>
          <button onClick={() => void runJob('digest_daily')}>Run Daily Digest</button>
          <button onClick={() => void runJob('digest_weekly')}>Run Weekly Digest</button>
          <button className="secondary" onClick={() => void loadData()}>
            Refresh Jobs
          </button>
        </div>
        <ul>
          {jobs.map((job) => (
            <li key={job._id}>
              <code>{job.jobName}</code> - {job.status} - {new Date(job.startedAt).toLocaleString()}
              {job.error ? ` - ${job.error}` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>PAT Pairing Token</h2>
        <p>Issue a read-only token for iOS app setup.</p>
        <button onClick={() => void createPat()}>Create PAT</button>
        {pat ? (
          <p>
            <strong>Token:</strong> <code>{pat}</code>
          </p>
        ) : null}
      </section>

      {message ? (
        <section className="card">
          <p>{message}</p>
        </section>
      ) : null}
    </main>
  );
}
