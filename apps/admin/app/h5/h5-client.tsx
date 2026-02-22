'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import styles from './h5.module.css';

type DigestTopItem = {
  tweetId: string;
  reason: string;
  nextStep: string;
};

type DigestData = {
  _id?: string;
  period?: 'daily' | 'weekly';
  periodKey?: string;
  topThemes?: string[];
  topItems?: DigestTopItem[];
  risks?: string[];
  tomorrowActions?: string[];
  generatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
} | null;

type SummaryData = {
  oneLinerZh?: string;
  oneLinerEn?: string;
  bulletsZh?: string[];
  bulletsEn?: string[];
  tagsZh?: string[];
  tagsEn?: string[];
  actions?: string[];
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
  items?: ItemData[];
  nextCursor?: string | null;
};

const PAT_STORAGE_KEY = 'xauto_h5_pat';

const asStringArray = (input: unknown): string[] =>
  Array.isArray(input) ? input.map((item) => String(item)).filter(Boolean) : [];

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
            summary: value.summary && typeof value.summary === 'object' ? (value.summary as SummaryData) : null
          }
        ];
      })
    : [];

  return {
    items,
    nextCursor: typeof record.nextCursor === 'string' ? record.nextCursor : null
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

export default function H5Client(): JSX.Element {
  const [patInput, setPatInput] = useState<string>('');
  const [patToken, setPatToken] = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);

  const [todayDigest, setTodayDigest] = useState<DigestData>(null);
  const [weekDigest, setWeekDigest] = useState<DigestData>(null);
  const [items, setItems] = useState<ItemData[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'today' | 'week'>('today');
  const [selectedItem, setSelectedItem] = useState<ItemData | null>(null);
  const [digestExpanded, setDigestExpanded] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
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

  const refreshAll = useCallback(
    async (token: string): Promise<void> => {
      setLoading(true);
      setError('');
      setStatusText('正在同步...');

      try {
        const [todayRaw, weekRaw, itemsRaw] = await Promise.all([
          requestJson('/api/mobile/digest/today', token),
          requestJson('/api/mobile/digest/week', token),
          requestJson('/api/mobile/items?limit=18', token)
        ]);

        setTodayDigest(toDigest(todayRaw));
        setWeekDigest(toDigest(weekRaw));
        const itemPayload = toItemsPayload(itemsRaw);
        setItems(itemPayload.items ?? []);
        setNextCursor(itemPayload.nextCursor ?? null);
        setStatusText('已同步');
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : '无法获取数据');
        setStatusText('同步失败');
      } finally {
        setLoading(false);
      }
    },
    [requestJson]
  );

  const loadMore = async (): Promise<void> => {
    if (!patToken || !nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setError('');
    try {
      const payload = await requestJson(`/api/mobile/items?limit=18&cursor=${encodeURIComponent(nextCursor)}`, patToken);
      const normalized = toItemsPayload(payload);
      setItems((previous) => [...previous, ...(normalized.items ?? [])]);
      setNextCursor(normalized.nextCursor ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载更多失败');
    } finally {
      setLoadingMore(false);
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
      const normalized = toItemsPayload({ items: [payload] }).items?.[0] ?? null;
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
    setItems([]);
    setNextCursor(null);
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
  }, [refreshAll]);

  const activeDigest = useMemo(() => (activeTab === 'today' ? todayDigest : weekDigest), [activeTab, todayDigest, weekDigest]);
  const generatedAt = activeDigest?.generatedAt ?? activeDigest?.updatedAt ?? activeDigest?.createdAt ?? null;

  const hasDigestContent =
    (activeDigest?.topThemes?.length ?? 0) > 0 ||
    (activeDigest?.topItems?.length ?? 0) > 0 ||
    (activeDigest?.tomorrowActions?.length ?? 0) > 0 ||
    (activeDigest?.risks?.length ?? 0) > 0;

  return (
    <div className={styles.shell}>
      {/* 顶部导航 */}
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
          /* 未连接：居中欢迎卡片 */
          <section className={styles.welcomeSection}>
            <div className={styles.welcomeCard}>
              <div className={styles.welcomeIcon}>🔐</div>
              <h1 className={styles.welcomeTitle}>连接你的书签</h1>
              <p className={styles.welcomeDesc}>
                粘贴 PAT token 以同步书签摘要与最新条目，适合在手机浏览器中快速查看。
              </p>
              <form className={styles.connectForm} onSubmit={connectPat}>
                <div className={styles.inputGroup}>
                  <input
                    id="pat-input"
                    type={showToken ? 'text' : 'password'}
                    value={patInput}
                    onChange={(e) => setPatInput(e.target.value)}
                    placeholder="粘贴 PAT token"
                    autoComplete="off"
                    className={styles.input}
                  />
                  <button
                    type="button"
                    className={styles.inputSuffix}
                    onClick={() => setShowToken((v) => !v)}
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
          /* 已连接：内容区 */
          <>
            {error ? <p className={styles.errorBanner}>{error}</p> : null}

            {/* 摘要卡片 */}
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
                      <div className={styles.digestMeta}>
                        {generatedAt && (
                          <span className={styles.digestTime}>{formatRelativeTime(generatedAt)}</span>
                        )}
                      </div>
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
                        onClick={() => setDigestExpanded((e) => !e)}
                        aria-expanded={digestExpanded}
                      >
                        {digestExpanded ? '收起详情' : '展开详情'}
                        <span className={`${styles.expandIcon} ${digestExpanded ? styles.expandIconActive : ''}`}>▼</span>
                      </button>
                    </>
                  )}
                  {!hasDigestContent && (
                    <p className={styles.digestEmpty}>暂无摘要内容</p>
                  )}
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

            {/* 最新条目 */}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>最新条目</h2>
                {items.length > 0 && <span className={styles.count}>{items.length} 条</span>}
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
                        <span className={styles.feedTime}>
                          {item.createdAtX ? formatRelativeTime(item.createdAtX) : ''}
                        </span>
                      </div>
                      <h3 className={styles.feedItemTitle}>
                        {item.summary?.oneLinerZh || '暂无摘要'}
                      </h3>
                      <p className={styles.feedItemExcerpt}>{(item.text || '').slice(0, 120)}</p>
                      {(item.summary?.tagsZh ?? []).length > 0 && (
                        <div className={styles.feedTags}>
                          {(item.summary?.tagsZh ?? []).slice(0, 4).map((tag) => (
                            <span key={tag} className={styles.feedTag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
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

      {/* 详情抽屉 */}
      {(selectedItem || loadingDetail) && (
        <div className={styles.drawerOverlay} onClick={() => setSelectedItem(null)} aria-hidden="true">
          <aside
            className={styles.drawer}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="条目详情"
          >
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
