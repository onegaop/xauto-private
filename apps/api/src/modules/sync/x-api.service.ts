import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { getEnv } from '../../config/env';
import { sleep } from '../../common/utils/sleep';

export type XBookmarkItem = {
  tweetId: string;
  createdAtX: Date;
  rawJson: Record<string, unknown>;
};

export type XTweetDetailItem = {
  tweetId: string;
  createdAtX: Date;
  authorName: string;
  authorAvatarUrl: string;
  text: string;
  url: string;
  rawJson: Record<string, unknown>;
};

@Injectable()
export class XApiService {
  private readonly retryBackoffMs = [60_000, 300_000, 900_000];

  async fetchCurrentUser(accessToken: string): Promise<{ id: string }> {
    const env = getEnv();
    const response = await axios.get<{ data: { id: string } }>(`${env.X_API_BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000
    });

    return { id: response.data.data.id };
  }

  async fetchBookmarks(
    accessToken: string,
    userId: string,
    options: { paginationToken?: string; maxResults?: number }
  ): Promise<{ items: XBookmarkItem[]; nextToken?: string }> {
    const env = getEnv();

    const params: Record<string, string> = {
      // Use bookmark list for ID-level incremental detection only.
      'tweet.fields': 'created_at,author_id',
      max_results: String(options.maxResults ?? 10)
    };

    if (options.paginationToken) {
      params.pagination_token = options.paginationToken;
    }

    const response = await this.requestWithRetry(async () =>
      axios.get<{
        data?: Array<Record<string, unknown>>;
        includes?: { users?: Array<Record<string, unknown>> };
        meta?: { next_token?: string };
      }>(`${env.X_API_BASE_URL}/users/${userId}/bookmarks`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params,
        timeout: 20000
      })
    );

    const items: XBookmarkItem[] = (response.data.data ?? []).reduce<XBookmarkItem[]>((acc, tweet) => {
        const tweetId = String(tweet.id ?? '').trim();
        if (!tweetId) {
          return acc;
        }

        acc.push({
          tweetId,
          createdAtX: new Date(String(tweet.created_at ?? new Date().toISOString())),
          rawJson: {
            id: tweetId,
            author_id: String(tweet.author_id ?? ''),
            created_at: String(tweet.created_at ?? '')
          }
        });

        return acc;
      }, []);

    return {
      items,
      nextToken: response.data.meta?.next_token
    };
  }

  async fetchTweetDetailsByIds(accessToken: string, tweetIds: string[]): Promise<XTweetDetailItem[]> {
    const env = getEnv();
    const ids = [...new Set(tweetIds.map((item) => item.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return [];
    }

    const out: XTweetDetailItem[] = [];
    const chunkSize = 100;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const params: Record<string, string> = {
        ids: chunk.join(','),
        'tweet.fields': 'created_at,author_id,text',
        expansions: 'author_id',
        'user.fields': 'name,username,profile_image_url'
      };

      const response = await this.requestWithRetry(async () =>
        axios.get<{
          data?: Array<Record<string, unknown>>;
          includes?: { users?: Array<Record<string, unknown>> };
        }>(`${env.X_API_BASE_URL}/tweets`, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          params,
          timeout: 20000
        })
      );

      const users = response.data.includes?.users ?? [];
      const usersById = new Map(users.map((user) => [String(user.id), user]));

      for (const tweet of response.data.data ?? []) {
        const tweetId = String(tweet.id ?? '');
        if (!tweetId) {
          continue;
        }

        const authorId = String(tweet.author_id ?? '');
        const user = usersById.get(authorId);
        const authorName = String(user?.name ?? user?.username ?? 'unknown');
        const authorAvatarUrl = this.readAvatarUrl(user);
        const username = String(user?.username ?? '');

        out.push({
          tweetId,
          createdAtX: new Date(String(tweet.created_at ?? new Date().toISOString())),
          authorName,
          authorAvatarUrl,
          text: String(tweet.text ?? ''),
          url: this.buildTweetUrl(tweetId, username),
          rawJson: tweet
        });
      }
    }

    return out;
  }

  private buildTweetUrl(tweetId: string, usernameRaw: string): string {
    const username = usernameRaw.trim().replace(/^@+/, '');
    if (!username) {
      return `https://x.com/i/web/status/${tweetId}`;
    }

    return `https://x.com/${encodeURIComponent(username)}/status/${tweetId}`;
  }

  private readAvatarUrl(user: Record<string, unknown> | undefined): string {
    const raw = typeof user?.profile_image_url === 'string' ? user.profile_image_url.trim() : '';
    if (!raw) {
      return '';
    }

    return raw.replace('_normal.', '_400x400.');
  }

  private async requestWithRetry<T>(requestFn: () => Promise<T>): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await requestFn();
      } catch (error) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;

        if (status === 429 && attempt < this.retryBackoffMs.length) {
          await sleep(this.retryBackoffMs[attempt]);
          attempt += 1;
          continue;
        }

        const details = this.readErrorDetails(axiosError);
        const statusPart = status ? `status=${status}` : 'status=unknown';
        const detailPart = details ? ` detail=${details}` : '';
        throw new ServiceUnavailableException(`Failed to fetch bookmarks from X API (${statusPart}${detailPart})`);
      }
    }
  }

  private readErrorDetails(error: AxiosError): string {
    const data = error.response?.data;

    if (!data) {
      return error.message;
    }

    if (typeof data === 'string') {
      return data.slice(0, 240);
    }

    if (typeof data !== 'object') {
      return String(data).slice(0, 240);
    }

    const payload = data as Record<string, unknown>;
    const candidates: string[] = [];

    if (typeof payload.error === 'string') {
      candidates.push(payload.error);
    }

    if (typeof payload.title === 'string') {
      candidates.push(payload.title);
    }

    if (typeof payload.detail === 'string') {
      candidates.push(payload.detail);
    }

    if (Array.isArray(payload.errors)) {
      for (const item of payload.errors) {
        if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).message === 'string') {
          candidates.push(String((item as Record<string, unknown>).message));
        }
      }
    }

    const compact = candidates
      .map((item) => item.trim())
      .filter(Boolean)
      .join(' | ');

    if (compact) {
      return compact.slice(0, 240);
    }

    return JSON.stringify(payload).slice(0, 240);
  }
}
