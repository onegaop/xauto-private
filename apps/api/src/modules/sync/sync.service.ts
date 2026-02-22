import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookmarkItem, BookmarkItemDocument } from '../../database/schemas/bookmark-item.schema';
import { ItemSummary, ItemSummaryDocument } from '../../database/schemas/item-summary.schema';
import { SyncState, SyncStateDocument } from '../../database/schemas/sync-state.schema';
import { AuthXService } from '../auth-x/auth-x.service';
import { AiService } from '../ai/ai.service';
import { XApiService } from './x-api.service';

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

    const sinceState = await this.syncStateModel.findOne({ key: 'sync:last_tweet_id' });
    let sinceId = typeof sinceState?.value?.tweetId === 'string' ? sinceState.value.tweetId : undefined;

    let page = 0;
    let nextToken: string | undefined;
    let totalFetched = 0;
    let totalInserted = 0;

    while (page < 5) {
      const response = await this.xApiService.fetchBookmarks(accessToken, userId, {
        paginationToken: nextToken,
        sinceId
      });

      const items = response.items;
      if (items.length === 0) {
        break;
      }

      totalFetched += items.length;
      nextToken = response.nextToken;

      const tweetIds = items.map((item) => item.tweetId);
      const existing = await this.bookmarkItemModel.find({ tweetId: { $in: tweetIds } }).select('tweetId');
      const existingIds = new Set(existing.map((item) => item.tweetId));

      const newItems = items.filter((item) => !existingIds.has(item.tweetId));
      totalInserted += newItems.length;

      if (items.length > 0) {
        await this.bookmarkItemModel.bulkWrite(
          items.map((item) => ({
            updateOne: {
              filter: { tweetId: item.tweetId },
              update: {
                $set: {
                  createdAtX: item.createdAtX,
                  authorName: item.authorName,
                  text: item.text,
                  url: item.url,
                  rawJson: item.rawJson,
                  syncedAt: new Date()
                }
              },
              upsert: true
            }
          }))
        );
      }

      for (const item of newItems) {
        const summary = await this.aiService.generateMiniSummary({
          tweetId: item.tweetId,
          text: item.text
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
              qualityScore: summary.qualityScore,
              provider: summary.provider,
              model: summary.model,
              summarizedAt: new Date()
            }
          },
          { upsert: true }
        );
      }

      const maxTweetId = items.reduce<string | undefined>((max, item) => {
        if (!max) {
          return item.tweetId;
        }

        try {
          return BigInt(item.tweetId) > BigInt(max) ? item.tweetId : max;
        } catch {
          return item.tweetId > max ? item.tweetId : max;
        }
      }, sinceId);

      if (maxTweetId) {
        sinceId = maxTweetId;
      }

      if (!nextToken) {
        break;
      }

      page += 1;
    }

    if (sinceId) {
      await this.syncStateModel.updateOne(
        { key: 'sync:last_tweet_id' },
        {
          $set: {
            value: {
              tweetId: sinceId,
              updatedAt: new Date().toISOString()
            }
          }
        },
        { upsert: true }
      );
    }

    return {
      totalFetched,
      totalInserted,
      sinceId,
      pages: page + 1
    };
  }
}
