import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookmarkItem, BookmarkItemDocument } from '../../database/schemas/bookmark-item.schema';
import { ItemSummary, ItemSummaryDocument } from '../../database/schemas/item-summary.schema';
import { SyncState, SyncStateDocument } from '../../database/schemas/sync-state.schema';
import { AuthXService } from '../auth-x/auth-x.service';
import { AiService, SummaryResult } from '../ai/ai.service';
import { XApiService, XTweetDetailItem } from './x-api.service';

@Injectable()
export class SyncService {
  constructor(
    @InjectModel(BookmarkItem.name)
    private readonly bookmarkItemModel: Model<BookmarkItemDocument>,
    @InjectModel(ItemSummary.name)
    private readonly itemSummaryModel: Model<ItemSummaryDocument>,
    @InjectModel(SyncState.name)
    private readonly syncStateModel: Model<SyncStateDocument>,
    private readonly authXService: AuthXService,
    private readonly xApiService: XApiService,
    private readonly aiService: AiService
  ) {}

  async runIncrementalSync(): Promise<Record<string, unknown>> {
    const tokenState = await this.syncStateModel.findOne({ key: 'oauth:tokens' });

    if (!tokenState?.value?.accessToken || typeof tokenState.value.accessToken !== 'string') {
      throw new UnauthorizedException('X account is not connected');
    }

    let accessToken = tokenState.value.accessToken as string;
    let refreshToken = typeof tokenState.value.refreshToken === 'string' ? tokenState.value.refreshToken : undefined;
    let userId = typeof tokenState.value.userId === 'string' ? tokenState.value.userId : '';

    const expiresAtRaw = tokenState.value.expiresAt;
    if (typeof expiresAtRaw === 'string' && new Date(expiresAtRaw).getTime() < Date.now() && refreshToken) {
      const refreshed = await this.authXService.refreshAccessToken(refreshToken);
      accessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken ?? refreshToken;

      await this.syncStateModel.updateOne(
        { key: 'oauth:tokens' },
        {
          $set: {
            value: {
              ...tokenState.value,
              accessToken,
              refreshToken,
              expiresAt: refreshed.expiresAt ?? null,
              updatedAt: new Date().toISOString()
            }
          }
        }
      );
    }

    if (!userId) {
      const me = await this.xApiService.fetchCurrentUser(accessToken);
      userId = me.id;

      await this.syncStateModel.updateOne(
        { key: 'oauth:tokens' },
        {
          $set: {
            value: {
              ...tokenState.value,
              userId,
              updatedAt: new Date().toISOString()
            }
          }
        }
      );
    }

    let page = 0;
    let nextToken: string | undefined;
    let totalFetched = 0;
    let totalInserted = 0;
    let detailRequested = 0;
    let detailFetched = 0;
    let pagesFetched = 0;
    let stoppedOnFirstNoNewPage = false;
    let stoppedOnFirstExistingPage = false;
    let existingCountOnLastPage = 0;

    while (page < 5) {
      const response = await this.xApiService.fetchBookmarks(accessToken, userId, {
        paginationToken: nextToken
      });
      pagesFetched += 1;

      const items = response.items;
      if (items.length === 0) {
        break;
      }

      totalFetched += items.length;
      nextToken = response.nextToken;

      const seenAt = new Date();
      const tweetIds = items.map((item) => item.tweetId);
      const existing = await this.bookmarkItemModel
        .find({ tweetId: { $in: tweetIds } })
        .select('tweetId')
        .lean();
      const existingIds = new Set(existing.map((item) => item.tweetId));
      const hasExistingInPage = existingIds.size > 0;
      existingCountOnLastPage = existingIds.size;
      const newItems = items.filter((item) => !existingIds.has(item.tweetId));
      totalInserted += newItems.length;
      if (newItems.length === 0) {
        stoppedOnFirstNoNewPage = true;
      }

      let detailsById = new Map<string, XTweetDetailItem>();
      if (newItems.length > 0) {
        detailRequested += newItems.length;
        const details = await this.xApiService.fetchTweetDetailsByIds(
          accessToken,
          newItems.map((item) => item.tweetId)
        );
        detailFetched += details.length;
        detailsById = new Map(details.map((item) => [item.tweetId, item]));

        await this.bookmarkItemModel.bulkWrite(
          newItems.map((item) => {
            const detail = detailsById.get(item.tweetId);
            const text = detail?.text?.trim() ?? '';
            return {
              updateOne: {
                filter: { tweetId: item.tweetId },
                update: {
                  $set: {
                    createdAtX: detail?.createdAtX ?? item.createdAtX,
                    authorName: detail?.authorName ?? 'unknown',
                    authorAvatarUrl: detail?.authorAvatarUrl ?? '',
                    text: text || '[text unavailable]',
                    url: detail?.url ?? `https://x.com/i/web/status/${item.tweetId}`,
                    rawJson: detail?.rawJson ?? item.rawJson,
                    syncedAt: seenAt
                  }
                },
                upsert: true
              }
            };
          })
        );
      }

      for (const item of newItems) {
        const detail = detailsById.get(item.tweetId);
        const text = detail?.text?.trim() ?? '';
        if (!text) {
          continue;
        }

        const summary = await this.aiService.generateMiniSummary({
          tweetId: item.tweetId,
          text
        });

        await this.upsertSummary(item.tweetId, summary);
      }

      // Bookmark pages are sorted by recent bookmark time. Once a page contains
      // existing IDs, older pages are very unlikely to have new records.
      if (hasExistingInPage) {
        stoppedOnFirstExistingPage = true;
        break;
      }

      if (!nextToken) {
        break;
      }

      page += 1;
    }

    return {
      totalFetched,
      totalInserted,
      pages: pagesFetched,
      detailRequested,
      detailFetched,
      stoppedOnFirstNoNewPage,
      stoppedOnFirstExistingPage,
      existingCountOnLastPage
    };
  }

  async rerunSummaries(options?: {
    limit?: number;
    overwrite?: boolean;
    tweetIds?: string[];
    sinceSyncedAt?: string;
  }): Promise<Record<string, unknown>> {
    const limitRaw = Number(options?.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 50;
    const overwrite = options?.overwrite !== false;
    const tweetIds = Array.isArray(options?.tweetIds)
      ? options.tweetIds.map((item) => String(item).trim()).filter(Boolean).slice(0, 500)
      : [];

    const filter: Record<string, unknown> = {
      text: { $exists: true, $ne: '' }
    };

    if (tweetIds.length > 0) {
      filter.tweetId = { $in: tweetIds };
    }

    const sinceSyncedAt = typeof options?.sinceSyncedAt === 'string' ? options.sinceSyncedAt.trim() : '';
    if (sinceSyncedAt) {
      const date = new Date(sinceSyncedAt);
      if (!Number.isNaN(date.getTime())) {
        filter.syncedAt = { $gte: date };
      }
    }

    const items = await this.bookmarkItemModel
      .find(filter)
      .sort({ syncedAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    const existingSet = new Set<string>();
    if (!overwrite && items.length > 0) {
      const existing = await this.itemSummaryModel
        .find({
          tweetId: { $in: items.map((item) => item.tweetId) },
          version: 1
        })
        .select('tweetId')
        .lean();
      for (const row of existing) {
        existingSet.add(row.tweetId);
      }
    }

    let processed = 0;
    let updated = 0;
    let skippedNoText = 0;
    let skippedExisting = 0;
    let failed = 0;
    const errors: Array<{ tweetId: string; error: string }> = [];

    for (const item of items) {
      const text = item.text?.trim();
      if (!text) {
        skippedNoText += 1;
        continue;
      }

      if (!overwrite && existingSet.has(item.tweetId)) {
        skippedExisting += 1;
        continue;
      }

      processed += 1;

      try {
        const summary = await this.aiService.generateMiniSummary({
          tweetId: item.tweetId,
          text
        });
        await this.upsertSummary(item.tweetId, summary);
        updated += 1;
      } catch (error) {
        failed += 1;
        if (errors.length < 20) {
          errors.push({
            tweetId: item.tweetId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    return {
      requestedLimit: limit,
      selected: items.length,
      processed,
      updated,
      skippedNoText,
      skippedExisting,
      failed,
      overwrite,
      sinceSyncedAt: sinceSyncedAt || null,
      errors
    };
  }

  private async upsertSummary(tweetId: string, summary: SummaryResult): Promise<void> {
    await this.itemSummaryModel.updateOne(
      { tweetId, version: 1 },
      {
        $set: {
          tweetId,
          version: 1,
          oneLinerZh: summary.oneLinerZh,
          oneLinerEn: summary.oneLinerEn,
          bulletsZh: summary.bulletsZh,
          bulletsEn: summary.bulletsEn,
          tagsZh: summary.tagsZh,
          tagsEn: summary.tagsEn,
          actions: summary.actions,
          renderMarkdown: summary.renderMarkdown,
          coreViewpoint: summary.coreViewpoint,
          underlyingProblem: summary.underlyingProblem,
          keyTechnologies: summary.keyTechnologies,
          claimTypes: summary.claimTypes,
          researchKeywordsEn: summary.researchKeywordsEn,
          qualityScore: summary.qualityScore,
          provider: summary.provider,
          model: summary.model,
          summarizedAt: new Date()
        }
      },
      { upsert: true }
    );
  }
}
