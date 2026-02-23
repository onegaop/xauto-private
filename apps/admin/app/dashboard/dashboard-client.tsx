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
  miniMarkdownSystem: string;
  miniSummarySystemEditable: boolean;
  digestSystemEditable: boolean;
  miniMarkdownSystemEditable: boolean;
};

type SyncSettings = {
  syncIntervalHours: number;
  updatedAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

type JobName = 'sync' | 'digest_daily' | 'digest_weekly' | 'resummarize';

type JobInvokeLog = {
  id: string;
  name: JobName;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  requestBody: Record<string, unknown>;
  responseStatus: number;
  ok: boolean;
  responsePayload: unknown;
  requestPath: string;
  errorMessage: string | null;
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

const DEFAULT_JOB_PAYLOAD: Record<JobName, string> = {
  sync: '{\n  \"force\": true\n}',
  digest_daily: '{}',
  digest_weekly: '{}',
  resummarize: '{\n  \"limit\": 50,\n  \"overwrite\": true\n}'
};

const tryParseJsonObject = (input: string): { value: Record<string, unknown> | null; error: string | null } => {
  const trimmed = input.trim();
  if (!trimmed) {
    return { value: {}, error: null };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { value: parsed as Record<string, unknown>, error: null };
    }

    return { value: null, error: '参数必须是 JSON 对象（例如 {}）' };
  } catch {
    return { value: null, error: 'JSON 格式错误，请检查逗号和引号' };
  }
};

const asPrettyJson = (input: unknown): string => JSON.stringify(input, null, 2);

export default function DashboardClient(): JSX.Element {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [runningJob, setRunningJob] = useState<JobName | null>(null);
  const [activeJobTab, setActiveJobTab] = useState<JobName>('sync');
  const [jobPayloadDrafts, setJobPayloadDrafts] = useState<Record<JobName, string>>(DEFAULT_JOB_PAYLOAD);
  const [jobInvokeLogs, setJobInvokeLogs] = useState<JobInvokeLog[]>([]);
  const [pat, setPat] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [promptForm, setPromptForm] = useState<PromptConfig>({
    miniSummarySystem: '',
    digestSystem: '',
    miniMarkdownSystem: '',
    miniSummarySystemEditable: false,
    digestSystemEditable: false,
    miniMarkdownSystemEditable: true
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
        digestSystem: String(payload.digestSystem ?? ''),
        miniMarkdownSystem: String(payload.miniMarkdownSystem ?? ''),
        miniSummarySystemEditable: Boolean(payload.miniSummarySystemEditable ?? false),
        digestSystemEditable: Boolean(payload.digestSystemEditable ?? false),
        miniMarkdownSystemEditable: Boolean(payload.miniMarkdownSystemEditable ?? true)
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

  const runJob = async (name: JobName): Promise<void> => {
    const draft = jobPayloadDrafts[name] ?? '{}';
    const parsed = tryParseJsonObject(draft);
    if (!parsed.value) {
      setMessage(`参数解析失败: ${parsed.error}`);
      return;
    }

    const requestBody = parsed.value;
    const requestPath = `/api/admin/jobs/${name}/run`;
    const startedAt = new Date();
    const startedPerf = performance.now();

    setRunningJob(name);
    setMessage(`正在执行 ${name}...`);

    let ok = false;
    let responseStatus = 500;
    let responsePayload: unknown = null;
    let errorMessage: string | null = null;

    try {
      const res = await fetch(requestPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      responseStatus = res.status;
      responsePayload = (await res.json().catch(() => null)) as unknown;
      ok = res.ok;
      if (!ok) {
        const value = responsePayload as { error?: string; message?: string } | null;
        errorMessage = value?.error ?? value?.message ?? res.statusText;
        setMessage(`执行失败: ${errorMessage}`);
      } else {
        setMessage(`${name} 执行完成`);
        await loadData();
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(`执行失败: ${errorMessage}`);
    } finally {
      const finishedAt = new Date();
      const durationMs = Math.max(0, Math.round(performance.now() - startedPerf));
      const log: JobInvokeLog = {
        id: `${name}-${startedAt.getTime()}`,
        name,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
        requestBody,
        responseStatus,
        ok,
        responsePayload,
        requestPath,
        errorMessage
      };
      setJobInvokeLogs((previous) => [log, ...previous].slice(0, 20));
      setRunningJob(null);
    }
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

  const saveMiniMarkdownPrompt = async (): Promise<void> => {
    setMessage('正在保存 Mini Markdown Prompt...');
    const res = await fetch('/api/admin/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ miniMarkdownSystem: promptForm.miniMarkdownSystem })
    });

    if (res.ok) {
      setMessage('Mini Markdown Prompt 已保存');
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

  const updateJobPayloadDraft = (name: JobName, value: string): void => {
    setJobPayloadDrafts((prev) => ({ ...prev, [name]: value }));
  };

  const formatActiveJobPayload = (): void => {
    const parsed = tryParseJsonObject(jobPayloadDrafts[activeJobTab] ?? '{}');
    if (!parsed.value) {
      setMessage(`参数格式化失败: ${parsed.error}`);
      return;
    }

    setJobPayloadDrafts((prev) => ({ ...prev, [activeJobTab]: asPrettyJson(parsed.value) }));
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
              disabled={runningJob !== null}
              onClick={() => void runJob('sync')}
            >
              {runningJob === 'sync' ? '执行中...' : '执行同步'}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={runningJob !== null}
              onClick={() => void runJob('digest_daily')}
            >
              {runningJob === 'digest_daily' ? '执行中...' : '执行每日摘要'}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={runningJob !== null}
              onClick={() => void runJob('digest_weekly')}
            >
              {runningJob === 'digest_weekly' ? '执行中...' : '执行每周摘要'}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={runningJob !== null}
              onClick={() => void runJob('resummarize')}
            >
              {runningJob === 'resummarize' ? '执行中...' : '刷新历史摘要'}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              disabled={runningJob !== null}
              onClick={() => void loadData()}
            >
              刷新列表
            </button>
          </div>

          <div className={styles.jobDebugPanel}>
            <div className={styles.jobDebugHeader}>
              <h3 className={styles.subsectionTitle}>触发调试</h3>
              <p className={styles.sectionDesc}>查看每次触发的入参、接口返回值、状态码与耗时。</p>
            </div>

            <div className={styles.jobTabs}>
              {(['sync', 'digest_daily', 'digest_weekly', 'resummarize'] as JobName[]).map((jobName) => (
                <button
                  key={jobName}
                  type="button"
                  className={activeJobTab === jobName ? styles.jobTabActive : styles.jobTab}
                  onClick={() => setActiveJobTab(jobName)}
                >
                  {jobName}
                </button>
              ))}
            </div>

            <label className={styles.formLabel} htmlFor="job-payload-json">
              Request Body (JSON)
            </label>
            <textarea
              id="job-payload-json"
              className={`${styles.formTextarea} ${styles.jobPayloadTextarea}`}
              value={jobPayloadDrafts[activeJobTab]}
              onChange={(event) => updateJobPayloadDraft(activeJobTab, event.target.value)}
            />

            <div className={styles.btnGroup}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={runningJob !== null}
                onClick={() => void runJob(activeJobTab)}
              >
                {runningJob === activeJobTab ? `执行中 ${activeJobTab}...` : `执行 ${activeJobTab}`}
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={formatActiveJobPayload}>
                格式化 JSON
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => updateJobPayloadDraft(activeJobTab, DEFAULT_JOB_PAYLOAD[activeJobTab])}
              >
                重置参数
              </button>
            </div>

            <div className={styles.jobLogList}>
              {jobInvokeLogs.length === 0 ? (
                <p className={styles.jobLogEmpty}>尚无触发记录，执行任务后会在这里展示完整请求和响应。</p>
              ) : (
                jobInvokeLogs.map((log) => (
                  <details key={log.id} className={styles.jobLogCard}>
                    <summary className={styles.jobLogSummary}>
                      <span className={styles.jobLogName}>{log.name}</span>
                      <span className={log.ok ? styles.jobLogStatusOk : styles.jobLogStatusError}>
                        {log.responseStatus}
                      </span>
                      <span className={styles.jobLogMeta}>
                        {new Date(log.startedAt).toLocaleString('zh-CN')} · {log.durationMs}ms
                      </span>
                    </summary>
                    <div className={styles.jobLogBody}>
                      <div className={styles.jobLogLine}>
                        <strong>Request</strong>
                        <code>
                          POST {log.requestPath}
                        </code>
                      </div>
                      <pre className={styles.jobLogPre}>{asPrettyJson(log.requestBody)}</pre>
                      <div className={styles.jobLogLine}>
                        <strong>Response</strong>
                        <code>
                          HTTP {log.responseStatus} {log.ok ? 'OK' : 'ERROR'}
                        </code>
                      </div>
                      <pre className={styles.jobLogPre}>{asPrettyJson(log.responsePayload)}</pre>
                      {log.errorMessage ? <p className={styles.jobLogError}>Error: {log.errorMessage}</p> : null}
                    </div>
                  </details>
                ))
              )}
            </div>
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
            <p className={styles.sectionDesc}>结构化字段依赖这两个 Prompt 的固定输出格式，已锁定为只读</p>
          </div>

          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
              <label className={styles.formLabel}>Mini Summary Prompt</label>
              <textarea
                className={`${styles.formTextarea} ${styles.formTextareaLarge} ${styles.formTextareaLocked}`}
                rows={14}
                value={promptForm.miniSummarySystem}
                readOnly
                disabled
                title="结构化 Prompt 已锁定，不可编辑"
              />
            </div>
            <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
              <label className={styles.formLabel}>Digest Prompt</label>
              <textarea
                className={`${styles.formTextarea} ${styles.formTextareaLocked}`}
                rows={8}
                value={promptForm.digestSystem}
                readOnly
                disabled
                title="结构化 Prompt 已锁定，不可编辑"
              />
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
              <label className={styles.formLabel}>Mini Markdown Prompt（可编辑）</label>
              <textarea
                className={`${styles.formTextarea} ${styles.formTextareaLarge}`}
                rows={12}
                value={promptForm.miniMarkdownSystem}
                readOnly={!promptForm.miniMarkdownSystemEditable}
                onChange={(e) => setPromptForm((prev) => ({ ...prev, miniMarkdownSystem: e.target.value }))}
              />
            </div>
          </div>

          <div className={styles.btnGroup}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void saveMiniMarkdownPrompt()}
              disabled={!promptForm.miniMarkdownSystemEditable}
            >
              保存 Mini Markdown Prompt
            </button>
          </div>

          <p className={styles.sectionDesc}>该 Prompt 仅影响自由 Markdown 展示，不影响结构化字段与筛选统计。</p>
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
