'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  Layout,
  Menu,
  Button,
  Typography,
  Space,
  Card,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  Table,
  Tag,
  Tabs,
  Collapse,
  message as antMessage,
  Divider,
  Badge,
  Descriptions,
  Empty
} from 'antd';
import {
  LogoutOutlined,
  CloudServerOutlined,
  PlayCircleOutlined,
  HistoryOutlined,
  SettingOutlined,
  KeyOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  FileTextOutlined,
  CodeOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

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
    miniModel: 'gemini-2.5-flash-lite',
    digestModel: 'gemini-2.5-flash-lite'
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
    const hide = antMessage.loading('正在保存 Provider 配置...', 0);
    const res = await fetch('/api/admin/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(providerForm)
    });

    hide();
    if (res.ok) {
      antMessage.success('Provider 已保存');
      await loadData();
      return;
    }

    const payload = (await res.json()) as { error?: string };
    antMessage.error(`保存失败: ${payload.error ?? res.statusText}`);
  };

  const runJob = async (name: JobName): Promise<void> => {
    const draft = jobPayloadDrafts[name] ?? '{}';
    const parsed = tryParseJsonObject(draft);
    if (!parsed.value) {
      antMessage.error(`参数解析失败: ${parsed.error}`);
      return;
    }

    const requestBody: Record<string, unknown> = { ...parsed.value };
    if (name === 'resummarize') {
      const limitRaw = Number(requestBody.limit ?? 50);
      const normalizedLimit = Number.isFinite(limitRaw) ? Math.max(1, Math.floor(limitRaw)) : 50;
      if (normalizedLimit > 50) {
        antMessage.warning('resummarize 单次 limit 已自动收紧到 50，避免 Cloud Run 超时。');
      }
      requestBody.limit = Math.min(50, normalizedLimit);
      if (Array.isArray(requestBody.tweetIds)) {
        requestBody.tweetIds = requestBody.tweetIds.slice(0, 50);
      }
    }
    const requestPath = `/api/admin/jobs/${name}/run`;
    const startedAt = new Date();
    const startedPerf = performance.now();

    setRunningJob(name);
    const hide = antMessage.loading(`正在执行 ${name}...`, 0);

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
        antMessage.error(`执行失败: ${errorMessage}`);
      } else {
        antMessage.success(`${name} 执行完成`);
        await loadData();
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      antMessage.error(`执行失败: ${errorMessage}`);
    } finally {
      hide();
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
    const hide = antMessage.loading('正在创建 PAT...', 0);
    const res = await fetch('/api/admin/pat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ios-main', expiresInDays: 365 })
    });

    hide();
    if (res.ok) {
      const payload = (await res.json()) as { token: string };
      setPat(payload.token);
      antMessage.success('PAT 已创建');
      return;
    }

    const payload = (await res.json()) as { error?: string };
    antMessage.error(`创建失败: ${payload.error ?? res.statusText}`);
  };

  const saveSyncSettings = async (): Promise<void> => {
    const hide = antMessage.loading('正在保存同步计划...', 0);
    const res = await fetch('/api/admin/sync-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncIntervalHours: syncSettings.syncIntervalHours })
    });

    hide();
    if (res.ok) {
      antMessage.success('同步计划已保存');
      await loadData();
      return;
    }

    const payload = (await res.json()) as { error?: string; message?: string };
    antMessage.error(`保存失败: ${payload.error ?? payload.message ?? res.statusText}`);
  };

  const saveMiniMarkdownPrompt = async (): Promise<void> => {
    const hide = antMessage.loading('正在保存 Mini Markdown Prompt...', 0);
    const res = await fetch('/api/admin/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ miniMarkdownSystem: promptForm.miniMarkdownSystem })
    });

    hide();
    if (res.ok) {
      antMessage.success('Mini Markdown Prompt 已保存');
      await loadData();
      return;
    }

    const payload = (await res.json()) as { error?: string; message?: string };
    antMessage.error(`保存失败: ${payload.error ?? payload.message ?? res.statusText}`);
  };

  const formatTime = (value: string | null): string => {
    if (!value) return '-';
    return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
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
      antMessage.error(`参数格式化失败: ${parsed.error}`);
      return;
    }

    setJobPayloadDrafts((prev) => ({ ...prev, [activeJobTab]: asPrettyJson(parsed.value) }));
  };

  const jobColumns = [
    {
      title: '任务名称',
      dataIndex: 'jobName',
      key: 'jobName',
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const s = status.toLowerCase();
        let color = 'default';
        if (s === 'completed' || s === 'success') color = 'success';
        else if (s.includes('error') || s.includes('fail')) color = 'error';
        else if (s === 'running') color = 'processing';
        return <Tag color={color}>{status.toUpperCase()}</Tag>;
      }
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (time: string) => formatTime(time)
    },
    {
      title: '错误信息',
      dataIndex: 'error',
      key: 'error',
      render: (error: string) => error ? <Text type="danger">{error}</Text> : '-'
    }
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: '#001529' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Title level={4} style={{ color: '#fff', margin: 0 }}>XAuto Admin</Title>
          <Menu
            theme="dark"
            mode="horizontal"
            defaultSelectedKeys={['dashboard']}
            items={[
              { key: 'dashboard', label: '控制面板', icon: <CloudServerOutlined /> },
              { key: 'h5', label: <a href="/h5">H5 演示</a>, icon: <FileTextOutlined /> }
            ]}
          />
        </div>
        <Button type="text" icon={<LogoutOutlined />} style={{ color: '#fff' }} onClick={() => signOut()}>
          退出登录
        </Button>
      </Header>

      <Content style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          
          {/* 任务控制 */}
          <Card 
            title={<Space><PlayCircleOutlined />任务控制</Space>}
            extra={<Button icon={<ReloadOutlined />} onClick={() => void loadData()}>刷新数据</Button>}
          >
            <Space wrap size="middle">
              <Button type="primary" loading={runningJob === 'sync'} onClick={() => void runJob('sync')}>执行同步</Button>
              <Button type="primary" loading={runningJob === 'digest_daily'} onClick={() => void runJob('digest_daily')}>执行每日摘要</Button>
              <Button type="primary" loading={runningJob === 'digest_weekly'} onClick={() => void runJob('digest_weekly')}>执行每周摘要</Button>
              <Button type="primary" loading={runningJob === 'resummarize'} onClick={() => void runJob('resummarize')}>刷新历史摘要</Button>
            </Space>

            <Divider />

            <Tabs
              activeKey={activeJobTab}
              onChange={(key) => setActiveJobTab(key as JobName)}
              items={[
                { key: 'sync', label: '同步任务' },
                { key: 'digest_daily', label: '每日摘要' },
                { key: 'digest_weekly', label: '每周摘要' },
                { key: 'resummarize', label: '刷新摘要' }
              ]}
            />

            <div style={{ marginTop: 16 }}>
              <Text strong>Request Body (JSON)</Text>
              <TextArea
                rows={4}
                value={jobPayloadDrafts[activeJobTab]}
                onChange={(e) => updateJobPayloadDraft(activeJobTab, e.target.value)}
                style={{ fontFamily: 'monospace', marginTop: 8 }}
              />
              <Space style={{ marginTop: 12 }}>
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => void runJob(activeJobTab)}>
                  执行 {activeJobTab}
                </Button>
                <Button onClick={formatActiveJobPayload}>格式化 JSON</Button>
                <Button onClick={() => updateJobPayloadDraft(activeJobTab, DEFAULT_JOB_PAYLOAD[activeJobTab])}>重置参数</Button>
              </Space>
            </div>

            <Collapse ghost style={{ marginTop: 24 }}>
              <Collapse.Panel header={<Space><HistoryOutlined />调用历史 (最近 20 条)</Space>} key="1">
                {jobInvokeLogs.length === 0 ? (
                  <Empty description="尚无触发记录" />
                ) : (
                  <Collapse accordion>
                    {jobInvokeLogs.map((log) => (
                      <Collapse.Panel
                        key={log.id}
                        header={
                          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: 24 }}>
                            <Space>
                              <Tag color={log.ok ? 'success' : 'error'}>{log.responseStatus}</Tag>
                              <Text strong>{log.name}</Text>
                            </Space>
                            <Text type="secondary">{dayjs(log.startedAt).format('HH:mm:ss')} · {log.durationMs}ms</Text>
                          </div>
                        }
                      >
                        <Descriptions bordered column={1} size="small">
                          <Descriptions.Item label="Request">
                            <Tag color="blue">POST</Tag> <code>{log.requestPath}</code>
                            <pre style={{ background: '#f5f5f5', padding: 8, marginTop: 8 }}>{asPrettyJson(log.requestBody)}</pre>
                          </Descriptions.Item>
                          <Descriptions.Item label="Response">
                            <Badge status={log.ok ? 'success' : 'error'} text={`HTTP ${log.responseStatus}`} />
                            <pre style={{ background: '#f5f5f5', padding: 8, marginTop: 8 }}>{asPrettyJson(log.responsePayload)}</pre>
                          </Descriptions.Item>
                          {log.errorMessage && (
                            <Descriptions.Item label="Error">
                              <Text type="danger">{log.errorMessage}</Text>
                            </Descriptions.Item>
                          )}
                        </Descriptions>
                      </Collapse.Panel>
                    ))}
                  </Collapse>
                )}
              </Collapse.Panel>
            </Collapse>

            <Divider titlePlacement="left">最近任务运行状态</Divider>
            <Table 
              dataSource={jobs} 
              columns={jobColumns} 
              rowKey="_id" 
              size="small" 
              pagination={{ pageSize: 5 }}
            />
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: 24 }}>
            {/* Provider 配置 */}
            <Card title={<Space><CloudServerOutlined />Provider 配置</Space>}>
              <Form layout="vertical" onFinish={saveProvider}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item label="Provider">
                    <Select value={providerForm.provider} onChange={onProviderChange}>
                      <Option value="deepseek">DeepSeek</Option>
                      <Option value="qwen">Qwen</Option>
                      <Option value="gemini">Gemini (cheap)</Option>
                    </Select>
                  </Form.Item>
                  <Form.Item label="优先级">
                    <InputNumber 
                      style={{ width: '100%' }} 
                      value={providerForm.priority} 
                      onChange={(v) => setProviderForm(p => ({ ...p, priority: v || 0 }))} 
                    />
                  </Form.Item>
                </div>

                <Form.Item label="Base URL">
                  <Input 
                    value={providerForm.baseUrl} 
                    onChange={e => setProviderForm(p => ({ ...p, baseUrl: e.target.value }))} 
                  />
                </Form.Item>

                <Form.Item label="API Key" tooltip="留空则保持现有密钥">
                  <Input.Password 
                    value={providerForm.apiKey} 
                    onChange={e => setProviderForm(p => ({ ...p, apiKey: e.target.value }))} 
                    placeholder="API Key"
                  />
                </Form.Item>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item label="Mini Model">
                    <Input 
                      value={providerForm.miniModel} 
                      onChange={e => setProviderForm(p => ({ ...p, miniModel: e.target.value }))} 
                    />
                  </Form.Item>
                  <Form.Item label="Digest Model">
                    <Input 
                      value={providerForm.digestModel} 
                      onChange={e => setProviderForm(p => ({ ...p, digestModel: e.target.value }))} 
                    />
                  </Form.Item>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Form.Item label="启用状态" style={{ marginBottom: 0 }}>
                    <Switch 
                      checked={providerForm.enabled} 
                      onChange={v => setProviderForm(p => ({ ...p, enabled: v }))} 
                      checkedChildren="已启用" 
                      unCheckedChildren="已禁用"
                    />
                  </Form.Item>
                  <Button type="primary" onClick={saveProvider}>保存配置</Button>
                </div>
              </Form>

              <Divider titlePlacement="left">当前 Providers</Divider>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {providers.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Space>
                      <Tag color="cyan">{p.provider}</Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>mini: {p.miniModel}</Text>
                    </Space>
                    <Badge status={p.hasApiKey ? 'success' : 'warning'} text={p.hasApiKey ? 'API Key OK' : 'Key 缺失'} />
                  </div>
                ))}
              </div>
            </Card>

            {/* 同步计划 & PAT */}
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Card title={<Space><SyncOutlined />同步计划</Space>}>
                <Form layout="inline">
                  <Form.Item label="间隔 (小时)">
                    <InputNumber 
                      min={1} 
                      max={168} 
                      value={syncSettings.syncIntervalHours} 
                      onChange={v => setSyncSettings(p => ({ ...p, syncIntervalHours: v || 24 }))} 
                    />
                  </Form.Item>
                  <Button type="primary" onClick={saveSyncSettings}>保存计划</Button>
                </Form>
                <Descriptions size="small" column={1} style={{ marginTop: 16 }}>
                  <Descriptions.Item label="上次执行">{formatTime(syncSettings.lastRunAt)}</Descriptions.Item>
                  <Descriptions.Item label="下次执行">{formatTime(syncSettings.nextRunAt)}</Descriptions.Item>
                  <Descriptions.Item label="更新时间">{formatTime(syncSettings.updatedAt)}</Descriptions.Item>
                </Descriptions>
              </Card>

              <Card title={<Space><KeyOutlined />PAT 配对令牌</Space>}>
                <Paragraph type="secondary">为 iOS 应用签发只读令牌，有效期 365 天。</Paragraph>
                <Button type="primary" icon={<KeyOutlined />} onClick={createPat}>重新创建 PAT</Button>
                {pat && (
                  <div style={{ marginTop: 16, padding: 12, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4 }}>
                    <Text strong copyable>{pat}</Text>
                    <div style={{ marginTop: 4 }}><Text type="warning" style={{ fontSize: 12 }}>请妥善保存，创建后无法再次查看</Text></div>
                  </div>
                )}
              </Card>
            </Space>
          </div>

          {/* Prompt 模板 */}
          <Card title={<Space><CodeOutlined />Prompt 模板</Space>}>
            <Collapse defaultActiveKey={['3']}>
              <Collapse.Panel header={<Space><InfoCircleOutlined />结构化 Prompt (只读)</Space>} key="1">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text strong>Mini Summary Prompt</Text>
                  <TextArea rows={6} value={promptForm.miniSummarySystem} readOnly disabled style={{ background: '#f5f5f5' }} />
                  <Text strong>Digest Prompt</Text>
                  <TextArea rows={4} value={promptForm.digestSystem} readOnly disabled style={{ background: '#f5f5f5' }} />
                </Space>
              </Collapse.Panel>
              <Collapse.Panel header={<Space><CodeOutlined />Mini Markdown Prompt (可编辑)</Space>} key="3">
                <TextArea 
                  rows={8} 
                  value={promptForm.miniMarkdownSystem} 
                  onChange={e => setPromptForm(p => ({ ...p, miniMarkdownSystem: e.target.value }))}
                  disabled={!promptForm.miniMarkdownSystemEditable}
                />
                <Button 
                  type="primary" 
                  style={{ marginTop: 12 }} 
                  onClick={saveMiniMarkdownPrompt}
                  disabled={!promptForm.miniMarkdownSystemEditable}
                >
                  保存 Markdown Prompt
                </Button>
              </Collapse.Panel>
            </Collapse>
          </Card>

        </Space>
      </Content>
    </Layout>
  );
}
