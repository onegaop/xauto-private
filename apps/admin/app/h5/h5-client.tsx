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
      setStatusText('Syncing live data...');

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
        setStatusText('Live data loaded');
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to fetch mobile data');
        setStatusText('Connection failed');
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
      setError(loadError instanceof Error ? loadError.message : 'Failed to load more items');
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
      setError(detailError instanceof Error ? detailError.message : 'Failed to load detail');
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
    setStatusText('Disconnected');
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

  return (
    <div className={styles.shell}>
      <div className={styles.glowOne} />
      <div className={styles.glowTwo} />
      <main className={styles.container}>
        <header className={`${styles.hero} ${styles.reveal}`}>
          <p className={styles.kicker}>XAuto H5 Showcase</p>
          <h1 className={styles.title}>Bookmark Intelligence Radar</h1>
          <p className={styles.subtitle}>
            一页展示今日/本周摘要与重点条目，适合直接在手机浏览器演示。
          </p>
          <div className={styles.heroActions}>
            <a className={styles.ghostButton} href="/">
              Back to Admin
            </a>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => void (patToken ? refreshAll(patToken) : Promise.resolve())}
              disabled={!patToken || loading}
            >
              {loading ? 'Refreshing...' : 'Refresh Live Data'}
            </button>
          </div>
        </header>

        <section className={`${styles.card} ${styles.revealDelayOne}`}>
          <div className={styles.sectionHeader}>
            <h2>Connect With PAT</h2>
            <span className={styles.status}>{statusText}</span>
          </div>
          <form className={styles.tokenForm} onSubmit={connectPat}>
            <label htmlFor="pat-input">PAT Token</label>
            <div className={styles.tokenRow}>
              <input
                id="pat-input"
                type={showToken ? 'text' : 'password'}
                value={patInput}
                onChange={(event) => setPatInput(event.target.value)}
                placeholder="Paste your PAT token"
                autoComplete="off"
              />
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setShowToken((value) => !value)}
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className={styles.tokenActions}>
              <button className={styles.primaryButton} type="submit">
                Connect
              </button>
              <button className={styles.ghostButton} type="button" onClick={disconnectPat}>
                Disconnect
              </button>
            </div>
          </form>
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>

        <section className={`${styles.grid} ${styles.revealDelayTwo}`}>
          <article className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Digest</h2>
              <div className={styles.tabs}>
                <button
                  type="button"
                  className={activeTab === 'today' ? styles.tabActive : styles.tab}
                  onClick={() => setActiveTab('today')}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={activeTab === 'week' ? styles.tabActive : styles.tab}
                  onClick={() => setActiveTab('week')}
                >
                  Week
                </button>
              </div>
            </div>

            {activeDigest ? (
              <div className={styles.digestBody}>
                <div className={styles.metaRow}>
                  <span>{activeDigest.periodKey ? `Key: ${activeDigest.periodKey}` : 'No period key'}</span>
                  <span>{generatedAt ? new Date(generatedAt).toLocaleString() : 'No timestamp'}</span>
                </div>
                <div className={styles.chips}>
                  {(activeDigest.topThemes ?? []).map((theme) => (
                    <span key={theme} className={styles.chip}>
                      {theme}
                    </span>
                  ))}
                </div>

                <h3>Top Items</h3>
                <ul className={styles.list}>
                  {(activeDigest.topItems ?? []).map((item) => (
                    <li key={`${item.tweetId}-${item.reason.slice(0, 8)}`}>
                      <strong>#{item.tweetId}</strong> {item.reason}
                    </li>
                  ))}
                </ul>

                <h3>Tomorrow Actions</h3>
                <ul className={styles.list}>
                  {(activeDigest.tomorrowActions ?? []).map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>

                <h3>Risks</h3>
                <ul className={styles.list}>
                  {(activeDigest.risks ?? []).map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className={styles.empty}>No digest yet. Connect PAT and refresh to load live data.</p>
            )}
          </article>

          <article className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Latest Items</h2>
              <span className={styles.status}>{items.length} loaded</span>
            </div>
            {items.length === 0 ? (
              <p className={styles.empty}>No item data yet.</p>
            ) : (
              <div className={styles.itemFeed}>
                {items.map((item, index) => (
                  <button
                    type="button"
                    key={`${item.tweetId}-${index}`}
                    className={styles.itemCard}
                    onClick={() => void openItemDetail(item.tweetId)}
                  >
                    <div className={styles.itemMeta}>
                      <span>{item.authorName || 'Unknown author'}</span>
                      <span>{item.createdAtX ? new Date(item.createdAtX).toLocaleString() : 'No date'}</span>
                    </div>
                    <h3>{item.summary?.oneLinerZh || 'No summary yet'}</h3>
                    <p>{(item.text || '').slice(0, 160)}</p>
                    <div className={styles.chips}>
                      {(item.summary?.tagsZh ?? []).slice(0, 4).map((tag) => (
                        <span className={styles.chipSoft} key={`${item.tweetId}-${tag}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className={styles.loadMoreWrap}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!nextCursor || loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? 'Loading...' : nextCursor ? 'Load More' : 'All Loaded'}
              </button>
            </div>
          </article>
        </section>
      </main>

      {(selectedItem || loadingDetail) ? (
        <aside className={styles.drawer}>
          <div className={styles.drawerHeader}>
            <h2>Item Detail</h2>
            <button type="button" className={styles.ghostButton} onClick={() => setSelectedItem(null)}>
              Close
            </button>
          </div>

          {loadingDetail && !selectedItem ? <p className={styles.empty}>Loading...</p> : null}

          {selectedItem ? (
            <div className={styles.drawerBody}>
              <p className={styles.drawerMeta}>Tweet ID: {selectedItem.tweetId}</p>
              <p>{selectedItem.text}</p>

              <h3>Summary (ZH)</h3>
              <p>{selectedItem.summary?.oneLinerZh || 'No one-liner'}</p>
              <ul className={styles.list}>
                {(selectedItem.summary?.bulletsZh ?? []).map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>

              <h3>Actions</h3>
              <ul className={styles.list}>
                {(selectedItem.summary?.actions ?? []).map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>

              {selectedItem.url ? (
                <p>
                  <a className={styles.link} href={selectedItem.url} target="_blank" rel="noreferrer">
                    Open Source Link
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
