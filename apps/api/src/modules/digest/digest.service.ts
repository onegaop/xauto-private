import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DigestReport, DigestReportDocument } from '../../database/schemas/digest-report.schema';
import { ItemSummary, ItemSummaryDocument } from '../../database/schemas/item-summary.schema';
import { BookmarkItem, BookmarkItemDocument } from '../../database/schemas/bookmark-item.schema';
import { getEnv } from '../../config/env';
import { dayKey, dayRange, nowInTimezone, weekKey, weekRange } from '../../common/utils/date';
import { AiService } from '../ai/ai.service';

@Injectable()
export class DigestService {
  constructor(
    @InjectModel(BookmarkItem.name)
    private readonly bookmarkItemModel: Model<BookmarkItemDocument>,
    @InjectModel(ItemSummary.name)
    private readonly itemSummaryModel: Model<ItemSummaryDocument>,
    @InjectModel(DigestReport.name)
    private readonly digestReportModel: Model<DigestReportDocument>,
    private readonly aiService: AiService
  ) {}

  async generateDailyDigest(): Promise<Record<string, unknown>> {
    const env = getEnv();
    const now = nowInTimezone(env.TIMEZONE);
    const key = dayKey(now);
    const range = dayRange(now);
    const syncTimeFilter = this.buildSyncTimeFilter(range);

    const bookmarks = await this.bookmarkItemModel
      .find(syncTimeFilter)
      .sort({ syncedAt: -1, _id: -1 })
      .limit(500);

    const digestItems = await this.buildDigestItemsFromBookmarks(bookmarks);
    const digest = await this.aiService.generateDigest(
      'daily',
      digestItems
    );

    await this.digestReportModel.updateOne(
      { period: 'daily', periodKey: key },
      {
        $set: {
          period: 'daily',
          periodKey: key,
          topThemes: digest.topThemes,
          topItems: digest.topItems,
          risks: digest.risks,
          tomorrowActions: digest.tomorrowActions,
          generatedAt: new Date()
        }
      },
      { upsert: true }
    );

    return {
      period: 'daily',
      periodKey: key,
      summaryCount: digestItems.length,
      provider: digest.provider,
      model: digest.model
    };
  }

  async generateWeeklyDigest(): Promise<Record<string, unknown>> {
    const env = getEnv();
    const now = nowInTimezone(env.TIMEZONE);
    const key = weekKey(now);
    const range = weekRange(now);
    const syncTimeFilter = this.buildSyncTimeFilter(range);

    const bookmarks = await this.bookmarkItemModel
      .find(syncTimeFilter)
      .sort({ syncedAt: -1, _id: -1 })
      .limit(2000);

    const digestItems = await this.buildDigestItemsFromBookmarks(bookmarks);
    const digest = await this.aiService.generateDigest(
      'weekly',
      digestItems
    );

    await this.digestReportModel.updateOne(
      { period: 'weekly', periodKey: key },
      {
        $set: {
          period: 'weekly',
          periodKey: key,
          topThemes: digest.topThemes,
          topItems: digest.topItems,
          risks: digest.risks,
          tomorrowActions: digest.tomorrowActions,
          generatedAt: new Date()
        }
      },
      { upsert: true }
    );

    return {
      period: 'weekly',
      periodKey: key,
      summaryCount: digestItems.length,
      provider: digest.provider,
      model: digest.model
    };
  }

  private async buildDigestItemsFromBookmarks(
    bookmarks: BookmarkItemDocument[]
  ): Promise<Array<{ tweetId: string; oneLinerZh: string; oneLinerEn: string; tagsZh: string[]; actions: string[] }>> {
    if (bookmarks.length === 0) {
      return [];
    }

    const tweetIds = bookmarks.map((item) => item.tweetId);
    const summaries = await this.itemSummaryModel.find({ tweetId: { $in: tweetIds }, version: 1 }).lean();
    const summaryMap = new Map(summaries.map((item) => [item.tweetId, item]));

    return bookmarks.map((item) => {
      const summary = summaryMap.get(item.tweetId);
      if (!summary) {
        const fallbackZh = item.text.slice(0, 80) || '无摘要';
        const fallbackEn = item.text.slice(0, 120) || 'No summary';
        return {
          tweetId: item.tweetId,
          oneLinerZh: fallbackZh,
          oneLinerEn: fallbackEn,
          tagsZh: [],
          actions: []
        };
      }

      return {
        tweetId: summary.tweetId,
        oneLinerZh: summary.oneLinerZh,
        oneLinerEn: summary.oneLinerEn,
        tagsZh: summary.tagsZh,
        actions: summary.actions
      };
    });
  }

  private buildSyncTimeFilter(range: { start: Date; end: Date }): Record<string, unknown> {
    return {
      $or: [
        { syncedAt: { $gte: range.start, $lte: range.end } },
        {
          syncedAt: { $exists: false },
          createdAt: { $gte: range.start, $lte: range.end }
        }
      ]
    };
  }
}
