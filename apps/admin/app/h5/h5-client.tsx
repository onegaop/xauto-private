'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import styles from './h5.module.css';

type DigestTopItem = {
  tweetId: string;
  reason: string;
  nextStep: string;
};

type DigestPeriod = 'daily' | 'weekly';
type StatsRange = '7d' | '30d' | '90d';
type ClaimLabel = 'fact' | 'opinion' | 'speculation';

type DigestData = {
  _id?: string;
  period?: DigestPeriod;
  periodKey?: string;
  topThemes?: string[];
  topItems?: DigestTopItem[];
  risks?: string[];
  tomorrowActions?: string[];
  generatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
} | null;

type SummaryTechnology = {
  concept: string;
  solves: string;
};

type SummaryClaimType = {
  statement: string;
  label: ClaimLabel;
};

type SummaryData = {
  oneLinerZh?: string;
  oneLinerEn?: string;
  bulletsZh?: string[];
  bulletsEn?: string[];
  tagsZh?: string[];
  tagsEn?: string[];
  actions?: string[];
  coreViewpoint?: string;
  underlyingProblem?: string;
  keyTechnologies?: SummaryTechnology[];
  claimTypes?: SummaryClaimType[];
  researchKeywordsEn?: string[];
  qualityScore?: number;
};

type ItemData = {
  _id?: string;
  tweetId: string;
  text?: string;
  authorName?: string;
  createdAtX?: string;
  url?: string;
  summary?: SummaryData | null;
};

type ItemsPayload = {
  items: ItemData[];
  nextCursor: string | null;
};

type DigestHistoryPayload = {
  items: DigestData[];
  nextCursor: string | null;
};

type SummaryStats = {
  range: StatsRange;
  from: string;
  to: string;
  totalSummaries: number;
  avgQualityScore: number;
  actionItemCount: number;
  topTags: Array<{ tag: string; count: number }>;
  claimLabelDistribution: Array<{ label: string; count: number }>;
  topResearchKeywords: Array<{ keyword: string; count: number }>;
};

type ItemQueryOptions = {
  cursor?: string;
  limit?: number;
  tag?: string;
  claimLabel?: ClaimLabel | '';
  qualityMin?: string;
};

type HistoryQueryOptions = {
  cursor?: string;
  period?: DigestPeriod;
  limit?: number;
};

const PAT_STORAGE_KEY = 'xauto_h5_pat';

const CLAIM_LABEL_TEXT: Record<ClaimLabel, string> = {
  fact: '事实',
  opinion: '观点',
  speculation: '推测'
};

const asStringArray = (input: unknown): string[] =>
  Array.isArray(input) ? input.map((item) => String(item)).filter(Boolean) : [];

const toQuality = (input: unknown): number | undefined => {
  const value = typeof input === 'number' ? input : Number(input);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
};

const toSummary = (input: unknown): SummaryData | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const record = input as Record<string, unknown>;

  const keyTechnologies = Array.isArray(record.keyTechnologies)
    ? record.keyTechnologies.flatMap((item): SummaryTechnology[] => {
        if (!item || typeof item !== 'object') {
          return [];
        }

        const value = item as Record<string, unknown>;
        const concept = String(value.concept ?? '').trim();
        const solves = String(value.solves ?? '').trim();
        if (!concept || !solves) {
          return [];
        }

        return [{ concept, solves }];
      })
    : [];

  const claimTypes = Array.isArray(record.claimTypes)
    ? record.claimTypes.flatMap((item): SummaryClaimType[] => {
        if (!item || typeof item !== 'object') {
          return [];
        }

        const value = item as Record<string, unknown>;
        const statement = String(value.statement ?? '').trim();
        const labelRaw = String(value.label ?? '').toLowerCase();
        const label: ClaimLabel | '' =
          labelRaw === 'fact' || labelRaw === 'opinion' || labelRaw === 'speculation' ? labelRaw : '';
        if (!statement || !label) {
          return [];
        }

        return [{ statement, label }];
      })
    : [];

  return {
    oneLinerZh: typeof record.oneLinerZh === 'string' ? record.oneLinerZh : undefined,
    oneLinerEn: typeof record.oneLinerEn === 'string' ? record.oneLinerEn : undefined,
    bulletsZh: asStringArray(record.bulletsZh),
    bulletsEn: asStringArray(record.bulletsEn),
    tagsZh: asStringArray(record.tagsZh),
    tagsEn: asStringArray(record.tagsEn),
    actions: asStringArray(record.actions),
    coreViewpoint: typeof record.coreViewpoint === 'string' ? record.coreViewpoint : undefined,
    underlyingProblem: typeof record.underlyingProblem === 'string' ? record.underlyingProblem : undefined,
    keyTechnologies,
    claimTypes,
    researchKeywordsEn: asStringArray(record.researchKeywordsEn),
    qualityScore: toQuality(record.qualityScore)
  };
};

const toDigest = (input: unknown): DigestData => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const record = input as Record<string, unknown>;

  return {
    _id: typeof record._id === 'string' ? record._id : undefined,
    period: record.period === 'daily' || record.period === 'weekly' ? record.period : undefined,
    periodKey: typeof record.periodKey === 'string' ? record.periodKey : undefined,
    topThemes: asStringArray(record.topThemes).slice(0, 6),
    topItems: Array.isArray(record.topItems)
      ? record.topItems
          .map((item) => {
            if (!item || typeof item !== 'object') {
              return null;
            }
            const value = item as Record<string, unknown>;
            const tweetId = typeof value.tweetId === 'string' ? value.tweetId : '';
            if (!tweetId) {
              return null;
            }
            return {
              tweetId,
              reason: String(value.reason ?? ''),
              nextStep: String(value.nextStep ?? '')
            };
          })
          .filter((item): item is DigestTopItem => item !== null)
          .slice(0, 5)
      : [],
    risks: asStringArray(record.risks).slice(0, 5),
    tomorrowActions: asStringArray(record.tomorrowActions).slice(0, 5),
    generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : undefined,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : undefined,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined
  };
};

const toItemsPayload = (input: unknown): ItemsPayload => {
  if (!input || typeof input !== 'object') {
    return { items: [], nextCursor: null };
  }

  const record = input as Record<string, unknown>;
  const items = Array.isArray(record.items)
    ? record.items.flatMap((item): ItemData[] => {
        if (!item || typeof item !== 'object') {
          return [];
        }

        const value = item as Record<string, unknown>;
        const tweetId = typeof value.tweetId === 'string' ? value.tweetId : '';
        if (!tweetId) {
          return [];
        }

        return [
          {
            _id: typeof value._id === 'string' ? value._id : undefined,
            tweetId,
            text: typeof value.text === 'string' ? value.text : '',
            authorName: typeof value.authorName === 'string' ? value.authorName : undefined,
            createdAtX: typeof value.createdAtX === 'string' ? value.createdAtX : undefined,
            url: typeof value.url === 'string' ? value.url : undefined,
            summary: toSummary(value.summary)
          }
        ];
      })
    : [];

  return {
    items,
    nextCursor: typeof record.nextCursor === 'string' ? record.nextCursor : null
  };
};

const toDigestHistoryPayload = (input: unknown): DigestHistoryPayload => {
  if (!input || typeof input !== 'object') {
    return { items: [], nextCursor: null };
  }

  const record = input as Record<string, unknown>;
  const items = Array.isArray(record.items)
    ? record.items.map((item) => toDigest(item)).filter((item): item is Exclude<DigestData, null> => item !== null)
    : [];

  return {
    items,
    nextCursor: typeof record.nextCursor === 'string' ? record.nextCursor : null
  };
};

const toSummaryStats = (input: unknown): SummaryStats | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const record = input as Record<string, unknown>;
  const rangeRaw = String(record.range ?? '7d') as StatsRange;
  const range: StatsRange = rangeRaw === '30d' || rangeRaw === '90d' ? rangeRaw : '7d';

  const topTags = Array.isArray(record.topTags)
    ? record.topTags.flatMap((item): Array<{ tag: string; count: number }> => {
        if (!item || typeof item !== 'object') {
          return [];
        }

        const value = item as Record<string, unknown>;
        const tag = String(value.tag ?? '').trim();
        const count = Number(value.count ?? 0);
        if (!tag || !Number.isFinite(count)) {
          return [];
        }

        return [{ tag, count }];
      })
    : [];

  const claimLabelDistribution = Array.isArray(record.claimLabelDistribution)
    ? record.claimLabelDistribution.flatMap((item): Array<{ label: string; count: number }> => {
        if (!item || typeof item !== 'object') {
          return [];
        }

        const value = item as Record<string, unknown>;
        const label = String(value.label ?? '').trim();
        const count = Number(value.count ?? 0);
        if (!label || !Number.isFinite(count)) {
          return [];
        }

        return [{ label, count }];
      })
    : [];

  const topResearchKeywords = Array.isArray(record.topResearchKeywords)
    ? record.topResearchKeywords.flatMap((item): Array<{ keyword: string; count: number }> => {
        if (!item || typeof item !== 'object') {
          return [];
        }

        const value = item as Record<string, unknown>;
        const keyword = String(value.keyword ?? '').trim();
        const count = Number(value.count ?? 0);
        if (!keyword || !Number.isFinite(count)) {
          return [];
        }

        return [{ keyword, count }];
      })
    : [];

  const totalSummaries = Number(record.totalSummaries ?? 0);
  const avgQualityScore = Number(record.avgQualityScore ?? 0);
  const actionItemCount = Number(record.actionItemCount ?? 0);

  return {
    range,
    from: typeof record.from === 'string' ? record.from : '',
    to: typeof record.to === 'string' ? record.to : '',
    totalSummaries: Number.isFinite(totalSummaries) ? totalSummaries : 0,
    avgQualityScore: Number.isFinite(avgQualityScore) ? avgQualityScore : 0,
    actionItemCount: Number.isFinite(actionItemCount) ? actionItemCount : 0,
    topTags,
    claimLabelDistribution,
    topResearchKeywords
  };
};

const parseApiError = (payload: unknown, status: number): string => {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string') {
      return record.error;
    }
    if (typeof record.message === 'string') {
      return record.message;
    }
  }
  return `Request failed (${status})`;
};

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return dateStr;
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString();
};

const formatPeriodKey = (periodKey?: string): string => {
  if (!periodKey) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
    return periodKey;
  }

  return periodKey.replace(/-/g, ' ').trim();
};

export default function H5Client(): JSX.Element {
  const [patInput, setPatInput] = useState<string>('');
  const [patToken, setPatToken] = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);

  const [todayDigest, setTodayDigest] = useState<DigestData>(null);
  const [weekDigest, setWeekDigest] = useState<DigestData>(null);
  const [digestHistory, setDigestHistory] = useState<DigestData[]>([]);
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(null);
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);

  const [items, setItems] = useState<ItemData[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'today' | 'week'>('today');
  const [historyPeriod, setHistoryPeriod] = useState<DigestPeriod>('daily');
  const [statsRange, setStatsRange] = useState<StatsRange>('7d');

  const [itemLimit, setItemLimit] = useState<number>(20);
  const [filterTag, setFilterTag] = useState<string>('');
  const [filterClaimLabel, setFilterClaimLabel] = useState<ClaimLabel | ''>('');
  const [filterQualityMin, setFilterQualityMin] = useState<string>('');
  const [appliedItemLimit, setAppliedItemLimit] = useState<number>(20);
  const [appliedFilterTag, setAppliedFilterTag] = useState<string>('');
  const [appliedFilterClaimLabel, setAppliedFilterClaimLabel] = useState<ClaimLabel | ''>('');
  const [appliedFilterQualityMin, setAppliedFilterQualityMin] = useState<string>('');

  const [selectedItem, setSelectedItem] = useState<ItemData | null>(null);
  const [digestExpanded, setDigestExpanded] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [loadingHistoryMore, setLoadingHistoryMore] = useState<boolean>(false);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [statusText, setStatusText] = useState<string>('Ready');

  const requestJson = useCallback(async (path: string, token: string): Promise<unknown> => {
    const response = await fetch(path, {
      headers: { 'x-pat-token': token },
      cache: 'no-store'
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(parseApiError(payload, response.status));
    }

    return payload;
  }, []);

  const buildItemsQuery = useCallback(
    (options?: ItemQueryOptions): string => {
      const params = new URLSearchParams();
      const limit = options?.limit ?? appliedItemLimit;
      const tag = options?.tag ?? appliedFilterTag;
      const claimLabel = options?.claimLabel ?? appliedFilterClaimLabel;
      const qualityMin = options?.qualityMin ?? appliedFilterQualityMin;

      params.set('limit', String(limit));
      if (options?.cursor) {
        params.set('cursor', options.cursor);
      }
      if (tag.trim()) {
        params.set('tag', tag.trim());
      }
      if (claimLabel) {
        params.set('claimLabel', claimLabel);
      }
      if (qualityMin.trim()) {
        params.set('qualityMin', qualityMin.trim());
      }

      return params.toString();
    },
    [appliedFilterClaimLabel, appliedFilterQualityMin, appliedFilterTag, appliedItemLimit]
  );

  const fetchItems = useCallback(
    async (token: string, options?: ItemQueryOptions): Promise<ItemsPayload> => {
      const query = buildItemsQuery(options);
      const payload = await requestJson(`/api/mobile/items?${query}`, token);
      return toItemsPayload(payload);
    },
    [buildItemsQuery, requestJson]
  );

  const fetchDigestHistory = useCallback(
    async (token: string, options?: HistoryQueryOptions): Promise<DigestHistoryPayload> => {
      const params = new URLSearchParams();
      params.set('period', options?.period ?? historyPeriod);
      params.set('limit', String(options?.limit ?? 10));
      if (options?.cursor) {
        params.set('cursor', options.cursor);
      }

      const payload = await requestJson(`/api/mobile/digest/history?${params.toString()}`, token);
      return toDigestHistoryPayload(payload);
    },
    [historyPeriod, requestJson]
  );

  const fetchSummaryStats = useCallback(
    async (token: string, range?: StatsRange): Promise<SummaryStats | null> => {
      const value = range ?? statsRange;
      const payload = await requestJson(`/api/mobile/summary/stats?range=${encodeURIComponent(value)}`, token);
      return toSummaryStats(payload);
    },
    [requestJson, statsRange]
  );

  const refreshAll = useCallback(
    async (token: string): Promise<void> => {
      setLoading(true);
      setError('');
      setStatusText('正在同步...');

      try {
        const [todayRaw, weekRaw, itemsPayload, historyPayload, statsPayload] = await Promise.all([
          requestJson('/api/mobile/digest/today', token),
          requestJson('/api/mobile/digest/week', token),
          fetchItems(token),
          fetchDigestHistory(token, { period: historyPeriod, limit: 10 }),
          fetchSummaryStats(token, statsRange)
        ]);

        setTodayDigest(toDigest(todayRaw));
        setWeekDigest(toDigest(weekRaw));
        setItems(itemsPayload.items);
        setNextCursor(itemsPayload.nextCursor);
        setDigestHistory(historyPayload.items);
        setHistoryNextCursor(historyPayload.nextCursor);
        setSummaryStats(statsPayload);
        setStatusText('已同步');
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : '无法获取数据');
        setStatusText('同步失败');
      } finally {
        setLoading(false);
      }
    },
    [fetchDigestHistory, fetchItems, fetchSummaryStats, historyPeriod, requestJson, statsRange]
  );

  const applyItemFilters = useCallback(
    async (overrides?: Partial<ItemQueryOptions>): Promise<void> => {
      if (!patToken) {
        return;
      }

      const nextOptions: ItemQueryOptions = {
        limit: overrides?.limit ?? itemLimit,
        tag: overrides?.tag ?? filterTag,
        claimLabel: overrides?.claimLabel ?? filterClaimLabel,
        qualityMin: overrides?.qualityMin ?? filterQualityMin
      };

      setFilterTag(nextOptions.tag ?? '');
      setFilterClaimLabel(nextOptions.claimLabel ?? '');
      setFilterQualityMin(nextOptions.qualityMin ?? '');
      setItemLimit(nextOptions.limit ?? 20);

      setLoading(true);
      setError('');
      setStatusText('正在筛选...');

      try {
        const payload = await fetchItems(patToken, nextOptions);
        setItems(payload.items);
        setNextCursor(payload.nextCursor);
        setAppliedItemLimit(nextOptions.limit ?? 20);
        setAppliedFilterTag(nextOptions.tag ?? '');
        setAppliedFilterClaimLabel(nextOptions.claimLabel ?? '');
        setAppliedFilterQualityMin(nextOptions.qualityMin ?? '');
        setStatusText('已同步');
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : '筛选失败');
        setStatusText('筛选失败');
      } finally {
        setLoading(false);
      }
    },
    [fetchItems, filterClaimLabel, filterQualityMin, filterTag, itemLimit, patToken]
  );

  const resetItemFilters = useCallback(async (): Promise<void> => {
    if (!patToken) {
      return;
    }

    setFilterTag('');
    setFilterClaimLabel('');
    setFilterQualityMin('');
    setItemLimit(20);
    setAppliedItemLimit(20);
    setAppliedFilterTag('');
    setAppliedFilterClaimLabel('');
    setAppliedFilterQualityMin('');

    setLoading(true);
    setError('');
    setStatusText('正在重置筛选...');

    try {
      const payload = await fetchItems(patToken, { limit: 20, tag: '', claimLabel: '', qualityMin: '' });
      setItems(payload.items);
      setNextCursor(payload.nextCursor);
      setStatusText('筛选已重置');
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '重置筛选失败');
      setStatusText('重置失败');
    } finally {
      setLoading(false);
    }
  }, [fetchItems, patToken]);

  const loadMore = async (): Promise<void> => {
    if (!patToken || !nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setError('');
    try {
      const payload = await fetchItems(patToken, { cursor: nextCursor });
      setItems((previous) => [...previous, ...payload.items]);
      setNextCursor(payload.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载更多失败');
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMoreHistory = async (): Promise<void> => {
    if (!patToken || !historyNextCursor || loadingHistoryMore) {
      return;
    }

    setLoadingHistoryMore(true);
    setError('');

    try {
      const payload = await fetchDigestHistory(patToken, {
        period: historyPeriod,
        limit: 10,
        cursor: historyNextCursor
      });
      setDigestHistory((previous) => [...previous, ...payload.items]);
      setHistoryNextCursor(payload.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载历史失败');
    } finally {
      setLoadingHistoryMore(false);
    }
  };

  const openItemDetail = async (tweetId: string): Promise<void> => {
    if (!patToken || loadingDetail) {
      return;
    }

    setLoadingDetail(true);
    setError('');
    try {
      const payload = await requestJson(`/api/mobile/items/${encodeURIComponent(tweetId)}`, patToken);
      const normalized = toItemsPayload({ items: [payload] }).items[0] ?? null;
      setSelectedItem(normalized);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : '加载详情失败');
    } finally {
      setLoadingDetail(false);
    }
  };

  const connectPat = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const token = patInput.trim();
    if (!token) {
      setError('请输入 PAT token');
      return;
    }

    window.localStorage.setItem(PAT_STORAGE_KEY, token);
    setPatToken(token);
    void refreshAll(token);
  };

  const disconnectPat = (): void => {
    setPatInput('');
    setPatToken('');
    setTodayDigest(null);
    setWeekDigest(null);
    setDigestHistory([]);
    setHistoryNextCursor(null);
    setSummaryStats(null);
    setItems([]);
    setNextCursor(null);
    setItemLimit(20);
    setFilterTag('');
    setFilterClaimLabel('');
    setFilterQualityMin('');
    setAppliedItemLimit(20);
    setAppliedFilterTag('');
    setAppliedFilterClaimLabel('');
    setAppliedFilterQualityMin('');
    setSelectedItem(null);
    setError('');
    setStatusText('已断开');
    window.localStorage.removeItem(PAT_STORAGE_KEY);
  };

  useEffect(() => {
    const saved = window.localStorage.getItem(PAT_STORAGE_KEY) ?? '';
    if (!saved) {
      return;
    }

    setPatInput(saved);
    setPatToken(saved);
    void refreshAll(saved);
    // mount only: avoid rehydration loops when callbacks are recreated
  }, []);

  useEffect(() => {
    if (!patToken) {
      return;
    }

    void (async () => {
      try {
        const payload = await fetchDigestHistory(patToken, { period: historyPeriod, limit: 10 });
        setDigestHistory(payload.items);
        setHistoryNextCursor(payload.nextCursor);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : '加载历史失败');
      }
    })();
  }, [fetchDigestHistory, historyPeriod, patToken]);

  useEffect(() => {
    if (!patToken) {
      return;
    }

    void (async () => {
      try {
        const payload = await fetchSummaryStats(patToken, statsRange);
        setSummaryStats(payload);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : '加载统计失败');
      }
    })();
  }, [fetchSummaryStats, patToken, statsRange]);

  const activeDigest = useMemo(() => (activeTab === 'today' ? todayDigest : weekDigest), [activeTab, todayDigest, weekDigest]);
  const generatedAt = activeDigest?.generatedAt ?? activeDigest?.updatedAt ?? activeDigest?.createdAt ?? null;

  const hasDigestContent =
    (activeDigest?.topThemes?.length ?? 0) > 0 ||
    (activeDigest?.topItems?.length ?? 0) > 0 ||
    (activeDigest?.tomorrowActions?.length ?? 0) > 0 ||
    (activeDigest?.risks?.length ?? 0) > 0;

  const availableTags = useMemo(
    () => (summaryStats?.topTags ?? []).map((item) => item.tag).slice(0, 12),
    [summaryStats]
  );

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <a href="/" className={styles.brand}>
          <span className={styles.brandIcon}>📡</span>
          <span>Bookmark Radar</span>
        </a>
        <div className={styles.topActions}>
          {patToken ? (
            <>
              <span className={`${styles.statusDot} ${loading ? styles.statusDotLoading : styles.statusDotActive}`} title={statusText} />
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => void refreshAll(patToken)}
                disabled={loading}
                title="刷新"
                aria-label="刷新"
              >
                {loading ? (
                  <span className={styles.spinner} />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 21h5v-5" />
                  </svg>
                )}
              </button>
              <button type="button" className={styles.textBtn} onClick={disconnectPat}>
                断开
              </button>
            </>
          ) : (
            <a href="/" className={styles.textBtn}>
              返回管理后台
            </a>
          )}
        </div>
      </header>

      <main className={styles.main}>
        {!patToken ? (
          <section className={styles.welcomeSection}>
            <div className={styles.welcomeCard}>
              <div className={styles.welcomeIcon}>🔐</div>
              <h1 className={styles.welcomeTitle}>连接你的书签</h1>
              <p className={styles.welcomeDesc}>粘贴 PAT token 以同步书签摘要与最新条目，适合在手机浏览器中快速查看。</p>
              <form className={styles.connectForm} onSubmit={connectPat}>
                <div className={styles.inputGroup}>
                  <input
                    id="pat-input"
                    type={showToken ? 'text' : 'password'}
                    value={patInput}
                    onChange={(event) => setPatInput(event.target.value)}
                    placeholder="粘贴 PAT token"
                    autoComplete="off"
                    className={styles.input}
                  />
                  <button
                    type="button"
                    className={styles.inputSuffix}
                    onClick={() => setShowToken((value) => !value)}
                    aria-label={showToken ? '隐藏' : '显示'}
                  >
                    {showToken ? '隐藏' : '显示'}
                  </button>
                </div>
                <button type="submit" className={styles.primaryBtn}>
                  连接
                </button>
              </form>
              {error ? <p className={styles.error}>{error}</p> : null}
            </div>
          </section>
        ) : (
          <>
            {error ? <p className={styles.errorBanner}>{error}</p> : null}

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>摘要</h2>
                <div className={styles.segmented}>
                  <button
                    type="button"
                    className={activeTab === 'today' ? styles.segmentedActive : styles.segmentedBtn}
                    onClick={() => setActiveTab('today')}
                  >
                    今日
                  </button>
                  <button
                    type="button"
                    className={activeTab === 'week' ? styles.segmentedActive : styles.segmentedBtn}
                    onClick={() => setActiveTab('week')}
                  >
                    本周
                  </button>
                </div>
              </div>

              {activeDigest ? (
                <div className={styles.digestCard}>
                  {hasDigestContent && (
                    <>
                      <div className={styles.digestMeta}>{generatedAt && <span className={styles.digestTime}>{formatRelativeTime(generatedAt)}</span>}</div>
                      {(activeDigest.topThemes ?? []).length > 0 && (
                        <div className={styles.themeChips}>
                          {(activeDigest.topThemes ?? []).map((theme) => (
                            <span key={theme} className={styles.themeChip}>
                              {theme}
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        className={styles.expandBtn}
                        onClick={() => setDigestExpanded((expanded) => !expanded)}
                        aria-expanded={digestExpanded}
                      >
                        {digestExpanded ? '收起详情' : '展开详情'}
                        <span className={`${styles.expandIcon} ${digestExpanded ? styles.expandIconActive : ''}`}>▼</span>
                      </button>
                    </>
                  )}
                  {!hasDigestContent && <p className={styles.digestEmpty}>暂无摘要内容</p>}
                  {hasDigestContent && digestExpanded && (
                    <div className={styles.digestBody}>
                      {(activeDigest.topItems ?? []).length > 0 && (
                        <>
                          <h4>重点条目</h4>
                          <ul>
                            {(activeDigest.topItems ?? []).map((item) => (
                              <li key={item.tweetId}>
                                <strong>#{item.tweetId}</strong> {item.reason}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {(activeDigest.tomorrowActions ?? []).length > 0 && (
                        <>
                          <h4>明日行动</h4>
                          <ul>
                            {(activeDigest.tomorrowActions ?? []).map((action) => (
                              <li key={action}>{action}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {(activeDigest.risks ?? []).length > 0 && (
                        <>
                          <h4>风险</h4>
                          <ul>
                            {(activeDigest.risks ?? []).map((risk) => (
                              <li key={risk}>{risk}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.emptyCard}>
                  <p>暂无摘要，点击顶部刷新按钮同步数据</p>
                </div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>摘要洞察</h2>
                <div className={styles.segmented}>
                  <button
                    type="button"
                    className={statsRange === '7d' ? styles.segmentedActive : styles.segmentedBtn}
                    onClick={() => setStatsRange('7d')}
                  >
                    7 天
                  </button>
                  <button
                    type="button"
                    className={statsRange === '30d' ? styles.segmentedActive : styles.segmentedBtn}
                    onClick={() => setStatsRange('30d')}
                  >
                    30 天
                  </button>
                  <button
                    type="button"
                    className={statsRange === '90d' ? styles.segmentedActive : styles.segmentedBtn}
                    onClick={() => setStatsRange('90d')}
                  >
                    90 天
                  </button>
                </div>
              </div>

              {summaryStats ? (
                <div className={styles.insightCard}>
                  <div className={styles.metricGrid}>
                    <div className={styles.metricCell}>
                      <div className={styles.metricLabel}>总结条数</div>
                      <div className={styles.metricValue}>{summaryStats.totalSummaries}</div>
                    </div>
                    <div className={styles.metricCell}>
                      <div className={styles.metricLabel}>平均质量</div>
                      <div className={styles.metricValue}>{summaryStats.avgQualityScore.toFixed(2)}</div>
                    </div>
                    <div className={styles.metricCell}>
                      <div className={styles.metricLabel}>行动建议</div>
                      <div className={styles.metricValue}>{summaryStats.actionItemCount}</div>
                    </div>
                  </div>

                  {(summaryStats.topTags.length > 0 || summaryStats.topResearchKeywords.length > 0) && (
                    <div className={styles.insightBlocks}>
                      {summaryStats.topTags.length > 0 && (
                        <div className={styles.insightBlock}>
                          <h4>高频标签</h4>
                          <div className={styles.themeChips}>
                            {summaryStats.topTags.map((item) => (
                              <span key={item.tag} className={styles.themeChip}>
                                {item.tag} · {item.count}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {summaryStats.topResearchKeywords.length > 0 && (
                        <div className={styles.insightBlock}>
                          <h4>研究关键词</h4>
                          <div className={styles.keywordChips}>
                            {summaryStats.topResearchKeywords.map((item) => (
                              <span key={item.keyword} className={styles.keywordChip}>
                                {item.keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {summaryStats.claimLabelDistribution.length > 0 && (
                    <div className={styles.claimRows}>
                      {summaryStats.claimLabelDistribution.map((item) => (
                        <div key={item.label} className={styles.claimRow}>
                          <span className={styles.claimRowLabel}>{CLAIM_LABEL_TEXT[item.label as ClaimLabel] ?? item.label}</span>
                          <div className={styles.claimRowBar}>
                            <span
                              className={styles.claimRowFill}
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round((item.count / Math.max(summaryStats.totalSummaries || 1, 1)) * 100)
                                )}%`
                              }}
                            />
                          </div>
                          <span className={styles.claimRowCount}>{item.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.emptyCard}>
                  <p>暂无统计数据</p>
                </div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>历史摘要</h2>
                <div className={styles.segmented}>
                  <button
                    type="button"
                    className={historyPeriod === 'daily' ? styles.segmentedActive : styles.segmentedBtn}
                    onClick={() => setHistoryPeriod('daily')}
                  >
                    日摘要
                  </button>
                  <button
                    type="button"
                    className={historyPeriod === 'weekly' ? styles.segmentedActive : styles.segmentedBtn}
                    onClick={() => setHistoryPeriod('weekly')}
                  >
                    周摘要
                  </button>
                </div>
              </div>

              {digestHistory.length === 0 ? (
                <div className={styles.emptyCard}>
                  <p>暂无历史摘要，点击顶部刷新按钮同步数据</p>
                </div>
              ) : (
                <div className={styles.historyList}>
                  {digestHistory.map((digest, index) => {
                    const digestTime = digest?.generatedAt ?? digest?.updatedAt ?? digest?.createdAt;
                    const hasThemes = (digest?.topThemes ?? []).length > 0;
                    const hasItems = (digest?.topItems ?? []).length > 0;
                    const hasContent = hasThemes || hasItems;
                    return (
                      <article key={`${digest?._id ?? digest?.periodKey ?? 'digest'}-${index}`} className={styles.historyCard}>
                        <div className={styles.historyHeader}>
                          <strong>{formatPeriodKey(digest?.periodKey) || '未知周期'}</strong>
                          {digestTime && <span>{formatRelativeTime(digestTime)}</span>}
                        </div>
                        {hasThemes && (
                          <div className={styles.historyThemes}>
                            {(digest?.topThemes ?? []).map((theme) => (
                              <span key={`${digest?.periodKey ?? 'theme'}-${theme}`} className={styles.feedTag}>
                                {theme}
                              </span>
                            ))}
                          </div>
                        )}
                        {hasItems ? (
                          <ul className={styles.historyItems}>
                            {(digest?.topItems ?? []).slice(0, 2).map((item) => (
                              <li key={`${digest?.periodKey ?? 'item'}-${item.tweetId}`}>{item.reason}</li>
                            ))}
                          </ul>
                        ) : (
                          !hasContent && (
                            <p className={styles.historyEmpty}>该摘要暂无内容</p>
                          )
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              {historyNextCursor && (
                <div className={styles.loadMoreWrap}>
                  <button
                    type="button"
                    className={styles.loadMoreBtn}
                    disabled={loadingHistoryMore}
                    onClick={() => void loadMoreHistory()}
                  >
                    {loadingHistoryMore ? (
                      <>
                        <span className={styles.spinner} />
                        加载中...
                      </>
                    ) : (
                      '加载更多历史'
                    )}
                  </button>
                </div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>最新条目</h2>
                {items.length > 0 && <span className={styles.count}>{items.length} 条</span>}
              </div>

              <div className={styles.filterBar}>
                <div className={styles.filterRow}>
                  <span className={styles.filterLabel}>每页</span>
                  <div className={styles.filterChips}>
                    <button
                      type="button"
                      className={itemLimit === 10 ? styles.filterChipActive : styles.filterChip}
                      onClick={() => void applyItemFilters({ limit: 10 })}
                    >
                      10
                    </button>
                    <button
                      type="button"
                      className={itemLimit === 20 ? styles.filterChipActive : styles.filterChip}
                      onClick={() => void applyItemFilters({ limit: 20 })}
                    >
                      20
                    </button>
                  </div>
                </div>

                <div className={styles.filterRow}>
                  <span className={styles.filterLabel}>类型</span>
                  <div className={styles.filterChips}>
                    <button
                      type="button"
                      className={!filterClaimLabel ? styles.filterChipActive : styles.filterChip}
                      onClick={() => void applyItemFilters({ claimLabel: '' })}
                    >
                      全部
                    </button>
                    {(['fact', 'opinion', 'speculation'] as const).map((label) => (
                      <button
                        key={label}
                        type="button"
                        className={filterClaimLabel === label ? styles.filterChipActive : styles.filterChip}
                        onClick={() => void applyItemFilters({ claimLabel: label })}
                      >
                        {CLAIM_LABEL_TEXT[label]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.filterRow}>
                  <span className={styles.filterLabel}>质量</span>
                  <div className={styles.filterChips}>
                    <button
                      type="button"
                      className={!filterQualityMin ? styles.filterChipActive : styles.filterChip}
                      onClick={() => void applyItemFilters({ qualityMin: '' })}
                    >
                      全部
                    </button>
                    {['0.6', '0.75', '0.9'].map((q) => (
                      <button
                        key={q}
                        type="button"
                        className={filterQualityMin === q ? styles.filterChipActive : styles.filterChip}
                        onClick={() => void applyItemFilters({ qualityMin: q })}
                      >
                        ≥{q}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.filterRow}>
                  <span className={styles.filterLabel}>标签</span>
                  <div className={styles.filterChipsScroll}>
                    <button
                      type="button"
                      className={!filterTag ? styles.filterChipActive : styles.filterChip}
                      onClick={() => void applyItemFilters({ tag: '' })}
                    >
                      全部
                    </button>
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={filterTag === tag ? styles.filterChipActive : styles.filterChip}
                        onClick={() => void applyItemFilters({ tag })}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {filterTag || filterClaimLabel || filterQualityMin ? (
                  <button
                    type="button"
                    className={styles.filterReset}
                    onClick={() => void resetItemFilters()}
                  >
                    清除筛选
                  </button>
                ) : null}
              </div>

              {items.length === 0 ? (
                <div className={styles.emptyCard}>
                  <p>暂无条目，点击顶部刷新按钮同步数据</p>
                </div>
              ) : (
                <div className={styles.feed}>
                  {items.map((item, index) => (
                    <button
                      type="button"
                      key={`${item.tweetId}-${index}`}
                      className={styles.feedItem}
                      onClick={() => void openItemDetail(item.tweetId)}
                    >
                      <div className={styles.feedItemMeta}>
                        <span className={styles.feedAuthor}>{item.authorName || '未知'}</span>
                        <span className={styles.feedTime}>{item.createdAtX ? formatRelativeTime(item.createdAtX) : ''}</span>
                      </div>
                      <h3 className={styles.feedItemTitle}>{item.summary?.oneLinerZh || '暂无摘要'}</h3>
                      <p className={styles.feedItemExcerpt}>{(item.text || '').slice(0, 120)}</p>
                      <div className={styles.feedFoot}>
                        {(item.summary?.tagsZh ?? []).length > 0 && (
                          <div className={styles.feedTags}>
                            {(item.summary?.tagsZh ?? []).slice(0, 3).map((tag) => (
                              <span key={tag} className={styles.feedTag}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {typeof item.summary?.qualityScore === 'number' && (
                          <span className={styles.qualityPill}>质量 {item.summary.qualityScore.toFixed(2)}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {nextCursor && (
                <div className={styles.loadMoreWrap}>
                  <button
                    type="button"
                    className={styles.loadMoreBtn}
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? (
                      <>
                        <span className={styles.spinner} />
                        加载中...
                      </>
                    ) : (
                      '加载更多'
                    )}
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {(selectedItem || loadingDetail) && (
        <div className={styles.drawerOverlay} onClick={() => setSelectedItem(null)} aria-hidden="true">
          <aside className={styles.drawer} onClick={(event) => event.stopPropagation()} role="dialog" aria-label="条目详情">
            <div className={styles.drawerHeader}>
              <h2>详情</h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setSelectedItem(null)}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            {loadingDetail && !selectedItem ? (
              <div className={styles.drawerLoading}>
                <span className={styles.spinner} />
                <p>加载中...</p>
              </div>
            ) : selectedItem ? (
              <div className={styles.drawerBody}>
                <div className={styles.drawerMeta}>Tweet #{selectedItem.tweetId}</div>
                <p className={styles.drawerText}>{selectedItem.text}</p>

                <h4>摘要</h4>
                <p>{selectedItem.summary?.oneLinerZh || '暂无'}</p>
                {(selectedItem.summary?.bulletsZh ?? []).length > 0 && (
                  <ul>
                    {(selectedItem.summary?.bulletsZh ?? []).map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}

                {selectedItem.summary?.coreViewpoint && (
                  <>
                    <h4>核心观点</h4>
                    <p>{selectedItem.summary.coreViewpoint}</p>
                  </>
                )}

                {selectedItem.summary?.underlyingProblem && (
                  <>
                    <h4>底层问题</h4>
                    <p>{selectedItem.summary.underlyingProblem}</p>
                  </>
                )}

                {(selectedItem.summary?.keyTechnologies ?? []).length > 0 && (
                  <>
                    <h4>关键技术/概念</h4>
                    <ul>
                      {(selectedItem.summary?.keyTechnologies ?? []).map((item) => (
                        <li key={`${item.concept}-${item.solves}`}>
                          <strong>{item.concept}</strong>：{item.solves}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {(selectedItem.summary?.claimTypes ?? []).length > 0 && (
                  <>
                    <h4>判断类型</h4>
                    <div className={styles.claimTypeList}>
                      {(selectedItem.summary?.claimTypes ?? []).slice(0, 4).map((item, index) => (
                        <span key={`${item.statement}-${index}`} className={styles.claimTypePill}>
                          {CLAIM_LABEL_TEXT[item.label]} · {item.statement}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {(selectedItem.summary?.actions ?? []).length > 0 && (
                  <>
                    <h4>行动建议</h4>
                    <ul>
                      {(selectedItem.summary?.actions ?? []).map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </>
                )}

                {(selectedItem.summary?.researchKeywordsEn ?? []).length > 0 && (
                  <>
                    <h4>英文研究关键词</h4>
                    <div className={styles.keywordChips}>
                      {(selectedItem.summary?.researchKeywordsEn ?? []).map((keyword) => (
                        <span key={keyword} className={styles.keywordChip}>
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {selectedItem.url && (
                  <a className={styles.sourceLink} href={selectedItem.url} target="_blank" rel="noreferrer">
                    查看原文 →
                  </a>
                )}
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
