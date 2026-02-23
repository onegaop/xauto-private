import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookmarkItem, BookmarkItemDocument } from '../../database/schemas/bookmark-item.schema';
import { ItemSummary, ItemSummaryDocument } from '../../database/schemas/item-summary.schema';
import { SyncState, SyncStateDocument } from '../../database/schemas/sync-state.schema';
import { AuthXService } from '../auth-x/auth-x.service';
import { AiService } from '../ai/ai.service';
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
      existingCountOnLastPage = existingIds.size;
      const newItems = items.filter((item) => !existingIds.has(item.tweetId));
      totalInserted += newItems.length;

      // Bookmark pages are sorted by recent bookmark time. Once a page has no new IDs,
      // older pages are very unlikely to contain new records for our incremental sync.
      if (newItems.length === 0) {
        stoppedOnFirstNoNewPage = true;
        break;
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

        await this.itemSummaryModel.updateOne(
          { tweetId: item.tweetId, version: 1 },
          {
            $set: {
              tweetId: item.tweetId,
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
      existingCountOnLastPage
    };
  }
}
