'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import styles from './dashboard.module.css';

type ProviderName = 'deepseek' | 'qwen' | 'gemini';

type ProviderConfig = {
  id: string;
  provider: ProviderName;
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

type PromptConfig = {
  miniSummarySystem: string;
  digestSystem: string;
};

type SyncSettings = {
  syncIntervalHours: number;
  updatedAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

const PROVIDER_PRESET: Record<
  ProviderName,
  {
    baseUrl: string;
    miniModel: string;
    digestModel: string;
  }
> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    miniModel: 'deepseek-chat',
    digestModel: 'deepseek-reasoner'
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    miniModel: 'qwen-plus',
    digestModel: 'qwen-plus'
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    miniModel: 'gemini-2.0-flash-lite',
    digestModel: 'gemini-2.0-flash-lite'
  }
};

export default function DashboardClient(): JSX.Element {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [pat, setPat] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [promptForm, setPromptForm] = useState<PromptConfig>({
    miniSummarySystem: '',
    digestSystem: ''
  });
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({
    syncIntervalHours: 24,
    updatedAt: null,
    lastRunAt: null,
    nextRunAt: null
  });

  const [providerForm, setProviderForm] = useState({
    provider: 'deepseek' as ProviderName,
    baseUrl: PROVIDER_PRESET.deepseek.baseUrl,
    apiKey: '',
    miniModel: PROVIDER_PRESET.deepseek.miniModel,
    digestModel: PROVIDER_PRESET.deepseek.digestModel,
    enabled: true,
    priority: 100,
    monthlyBudgetCny: 100
  });

  const loadData = async (): Promise<void> => {
    const [providerRes, jobsRes, promptsRes, syncSettingsRes] = await Promise.all([
      fetch('/api/admin/providers', { cache: 'no-store' }),
      fetch('/api/admin/jobs?limit=20', { cache: 'no-store' }),
      fetch('/api/admin/prompts', { cache: 'no-store' }),
      fetch('/api/admin/sync-settings', { cache: 'no-store' })
    ]);

    if (providerRes.ok) {
      setProviders((await providerRes.json()) as ProviderConfig[]);
    }

    if (jobsRes.ok) {
      setJobs((await jobsRes.json()) as JobRun[]);
    }

    if (promptsRes.ok) {
      const payload = (await promptsRes.json()) as Partial<PromptConfig>;
      setPromptForm({
        miniSummarySystem: String(payload.miniSummarySystem ?? ''),
        digestSystem: String(payload.digestSystem ?? '')
      });
    }

    if (syncSettingsRes.ok) {
      const payload = (await syncSettingsRes.json()) as Partial<SyncSettings>;
      setSyncSettings({
        syncIntervalHours: Number(payload.syncIntervalHours ?? 24),
        updatedAt: payload.updatedAt ?? null,
        lastRunAt: payload.lastRunAt ?? null,
        nextRunAt: payload.nextRunAt ?? null
      });
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const saveProvider = async (): Promise<void> => {
    setMessage('正在保存 Provider 配置...');
    const res = await fetch('/api/admin/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(providerForm)
    });

    if (res.ok) {
      setMessage('Provider 已保存');
      await loadData();
      return;
    }

    const payload = (await res.json()) as { error?: string };
    setMessage(`保存失败: ${payload.error ?? res.statusText}`);
  };

  const runJob = async (name: 'sync' | 'digest_daily' | 'digest_weekly'): Promise<void> => {
    setMessage(`正在执行 ${name}...`);
    const res = await fetch(`/api/admin/jobs/${name}/run`, { method: 'POST' });
    if (res.ok) {
      setMessage(`${name} 执行完成`);
      await loadData();
      return;
    }

    const payload = (await res.json()) as { error?: string };
    setMessage(`执行失败: ${payload.error ?? res.statusText}`);
  };

  const createPat = async (): Promise<void> => {
    setMessage('正在创建 PAT...');
    const res = await fetch('/api/admin/pat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ios-main', expiresInDays: 365 })
    });

    if (res.ok) {
      const payload = (await res.json()) as { token: string };
      setPat(payload.token);
      setMessage('PAT 已创建，请妥善保存到 iOS Keychain');
      return;
    }

    const payload = (await res.json()) as { error?: string };
    setMessage(`创建失败: ${payload.error ?? res.statusText}`);
  };

  const savePrompts = async (): Promise<void> => {
    setMessage('正在保存 Prompt 模板...');
    const res = await fetch('/api/admin/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptForm)
    });

    if (res.ok) {
      setMessage('Prompt 已保存');
      await loadData();
      return;
    }

    const payload = (await res.json()) as { error?: string; message?: string };
    setMessage(`保存失败: ${payload.error ?? payload.message ?? res.statusText}`);
  };

  const saveSyncSettings = async (): Promise<void> => {
    setMessage('正在保存同步计划...');
    const res = await fetch('/api/admin/sync-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncIntervalHours: syncSettings.syncIntervalHours })
    });

    if (res.ok) {
      setMessage('同步计划已保存');
      await loadData();
      return;
    }

    const payload = (await res.json()) as { error?: string; message?: string };
    setMessage(`保存失败: ${payload.error ?? payload.message ?? res.statusText}`);
  };

  const formatTime = (value: string | null): string => {
    if (!value) return '-';
    return new Date(value).toLocaleString('zh-CN');
  };

  const getJobStatusClass = (status: string): string => {
    const s = status.toLowerCase();
    if (s === 'completed' || s === 'success') return styles.jobStatusSuccess;
    if (s.includes('error') || s.includes('fail')) return styles.jobStatusError;
    return styles.jobStatusPending;
  };

  const onProviderChange = (nextProvider: ProviderName): void => {
    const preset = PROVIDER_PRESET[nextProvider];
    setProviderForm((prev) => ({
      ...prev,
      provider: nextProvider,
      baseUrl: preset.baseUrl,
      miniModel: preset.miniModel,
      digestModel: preset.digestModel
    }));
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={styles.brand}>XAuto 管理后台</span>
          <a href="/h5" className={styles.navLink}>
            H5 演示
          </a>
        </div>
        <button type="button" className={styles.signOutBtn} onClick={() => signOut()}>
          退出登录
        </button>
      </header>

      <main className={styles.container}>
        {/* Provider 配置 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Provider 配置</h2>
            <p className={styles.sectionDesc}>配置 AI 模型提供商（DeepSeek / Qwen / Gemini）及 API 密钥</p>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Provider</label>
              <select
                className={styles.formSelect}
                value={providerForm.provider}
                onChange={(e) => onProviderChange(e.target.value as ProviderName)}
              >
                <option value="deepseek">DeepSeek</option>
                <option value="qwen">Qwen</option>
                <option value="gemini">Gemini (cheap)</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Base URL</label>
              <input
                className={styles.formInput}
                value={providerForm.baseUrl}
                onChange={(e) => setProviderForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              />
            </div>

            <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
              <label className={styles.formLabel}>API Key</label>
              <input
                className={styles.formInput}
                type="password"
                value={providerForm.apiKey}
                onChange={(e) => setProviderForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="留空则保持现有密钥"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Mini Model</label>
              <input
                className={styles.formInput}
                value={providerForm.miniModel}
                onChange={(e) => setProviderForm((prev) => ({ ...prev, miniModel: e.target.value }))}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Digest Model</label>
              <input
                className={styles.formInput}
                value={providerForm.digestModel}
                onChange={(e) => setProviderForm((prev) => ({ ...prev, digestModel: e.target.value }))}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Priority</label>
              <input
                className={styles.formInput}
                type="number"
                value={providerForm.priority}
                onChange={(e) =>
                  setProviderForm((prev) => ({ ...prev, priority: Number(e.target.value) }))
                }
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>月预算 (CNY)</label>
              <input
                className={styles.formInput}
                type="number"
                value={providerForm.monthlyBudgetCny}
                onChange={(e) =>
                  setProviderForm((prev) => ({ ...prev, monthlyBudgetCny: Number(e.target.value) }))
                }
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>启用</label>
              <div className={styles.toggleRow}>
                <button
                  type="button"
                  className={`${styles.toggle} ${providerForm.enabled ? styles.toggleActive : ''}`}
                  onClick={() => setProviderForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
                  aria-pressed={providerForm.enabled}
                />
                <span className={styles.formLabel}>{providerForm.enabled ? '已启用' : '已禁用'}</span>
              </div>
            </div>
          </div>

          <div className={styles.btnGroup}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void saveProvider()}>
              保存 Provider
            </button>
          </div>

          <h3 className={styles.subsectionTitle}>当前 Providers</h3>
          <ul className={styles.providerList}>
            {providers.map((item) => (
              <li key={item.id} className={styles.providerItem}>
                <span className={styles.providerBadge}>{item.provider}</span>
                <span className={styles.providerMeta}>
                  mini=<code>{item.miniModel}</code> digest=<code>{item.digestModel}</code>
                </span>
                <span
                  className={`${styles.apiKeyStatus} ${item.hasApiKey ? styles.apiKeySet : styles.apiKeyMissing}`}
                >
                  {item.hasApiKey ? 'API Key 已配置' : 'API Key 缺失'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Job 控制 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>任务控制</h2>
            <p className={styles.sectionDesc}>手动触发同步与摘要任务</p>
          </div>

          <div className={styles.jobActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void runJob('sync')}
            >
              执行同步
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void runJob('digest_daily')}
            >
              执行每日摘要
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void runJob('digest_weekly')}
            >
              执行每周摘要
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => void loadData()}
            >
              刷新列表
            </button>
          </div>

          <ul className={styles.jobList}>
            {jobs.map((job) => (
              <li key={job._id} className={styles.jobItem}>
                <span className={styles.jobName}>{job.jobName}</span>
                <span className={`${styles.jobStatus} ${getJobStatusClass(job.status)}`}>
                  {job.status}
                </span>
                <span className={styles.jobTime}>{formatTime(job.startedAt)}</span>
                {job.error ? <div className={styles.jobError}>{job.error}</div> : null}
              </li>
            ))}
          </ul>
        </section>

        {/* 同步计划 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>同步计划</h2>
            <p className={styles.sectionDesc}>
              默认每 24 小时同步一次。调度器可更频繁调用，后端会跳过未到期的执行。
            </p>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup} style={{ maxWidth: 200 }}>
              <label className={styles.formLabel}>同步间隔（小时）</label>
              <input
                className={styles.formInput}
                type="number"
                min={1}
                max={168}
                value={syncSettings.syncIntervalHours}
                onChange={(e) =>
                  setSyncSettings((prev) => ({ ...prev, syncIntervalHours: Number(e.target.value) }))
                }
              />
            </div>
          </div>

          <div className={styles.btnGroup}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void saveSyncSettings()}
            >
              保存计划
            </button>
          </div>

          <div className={styles.syncMeta}>
            <span>上次执行: {formatTime(syncSettings.lastRunAt)}</span>
            <span>下次执行: {formatTime(syncSettings.nextRunAt)}</span>
            <span>更新时间: {formatTime(syncSettings.updatedAt)}</span>
          </div>
        </section>

        {/* Prompt 模板 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Prompt 模板</h2>
            <p className={styles.sectionDesc}>用于摘要与 Digest 生成的系统提示词</p>
          </div>

          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
              <label className={styles.formLabel}>Mini Summary Prompt</label>
              <textarea
                className={`${styles.formTextarea} ${styles.formTextareaLarge}`}
                rows={14}
                value={promptForm.miniSummarySystem}
                onChange={(e) =>
                  setPromptForm((prev) => ({ ...prev, miniSummarySystem: e.target.value }))
                }
              />
            </div>
            <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
              <label className={styles.formLabel}>Digest Prompt</label>
              <textarea
                className={styles.formTextarea}
                rows={8}
                value={promptForm.digestSystem}
                onChange={(e) =>
                  setPromptForm((prev) => ({ ...prev, digestSystem: e.target.value }))
                }
              />
            </div>
          </div>

          <div className={styles.btnGroup}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void savePrompts()}
            >
              保存 Prompt
            </button>
          </div>
        </section>

        {/* PAT */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>PAT 配对令牌</h2>
            <p className={styles.sectionDesc}>为 iOS 应用签发只读令牌</p>
          </div>

          <div className={styles.patSection}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void createPat()}
            >
              创建 PAT
            </button>
            {pat ? (
              <>
                <div className={styles.patToken}>{pat}</div>
                <p className={styles.patWarning}>请妥善保存，创建后无法再次查看</p>
              </>
            ) : null}
          </div>
        </section>
      </main>

      {message ? (
        <div className={styles.messageBar} role="status">
          {message}
        </div>
      ) : null}
    </div>
  );
}
