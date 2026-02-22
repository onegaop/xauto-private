import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BookmarkItem, BookmarkItemDocument } from '../../database/schemas/bookmark-item.schema';
import { DigestReport, DigestReportDocument } from '../../database/schemas/digest-report.schema';
import { ItemSummary, ItemSummaryDocument } from '../../database/schemas/item-summary.schema';
import { getEnv } from '../../config/env';
import { dayKey, nowInTimezone, weekKey } from '../../common/utils/date';
import { Model } from 'mongoose';

@Injectable()
export class MobileService {
  constructor(
    @InjectModel(BookmarkItem.name)
    private readonly bookmarkItemModel: Model<BookmarkItemDocument>,
    @InjectModel(ItemSummary.name)
    private readonly itemSummaryModel: Model<ItemSummaryDocument>,
    @InjectModel(DigestReport.name)
    private readonly digestReportModel: Model<DigestReportDocument>
  ) {}

  async getTodayDigest(): Promise<Record<string, unknown> | null> {
    const env = getEnv();
    const key = dayKey(nowInTimezone(env.TIMEZONE));

    return this.digestReportModel.findOne({ period: 'daily', periodKey: key }).lean();
  }

  async getWeekDigest(): Promise<Record<string, unknown> | null> {
    const env = getEnv();
    const key = weekKey(nowInTimezone(env.TIMEZONE));

    return this.digestReportModel.findOne({ period: 'weekly', periodKey: key }).lean();
  }

  async listItems(limitRaw?: string, cursor?: string): Promise<Record<string, unknown>> {
    const limit = Math.min(50, Math.max(1, Number(limitRaw ?? 20)));

    const filter: Record<string, unknown> = {};
    if (cursor) {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        createdAtX: string;
        id: string;
      };

      const cursorDate = new Date(decoded.createdAtX);
      filter.$or = [
        { createdAtX: { $lt: cursorDate } },
        { createdAtX: cursorDate, _id: { $lt: new Types.ObjectId(decoded.id) } }
      ];
    }

    const items = await this.bookmarkItemModel
      .find(filter)
      .sort({ createdAtX: -1, _id: -1 })
      .limit(limit)
      .lean();

    const tweetIds = items.map((item) => item.tweetId);
    const summaries = await this.itemSummaryModel.find({ tweetId: { $in: tweetIds }, version: 1 }).lean();
    const summaryMap = new Map(summaries.map((item) => [item.tweetId, item]));

    const merged = items.map((item) => ({
      ...item,
      summary: summaryMap.get(item.tweetId) ?? null
    }));

    const last = items.at(-1);
    const nextCursor = last
      ? Buffer.from(JSON.stringify({ createdAtX: last.createdAtX.toISOString(), id: String(last._id) })).toString('base64url')
      : null;

    return {
      items: merged,
      nextCursor
    };
  }

  async getItem(tweetId: string): Promise<Record<string, unknown>> {
    const item = await this.bookmarkItemModel.findOne({ tweetId }).lean();
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const summary = await this.itemSummaryModel.findOne({ tweetId, version: 1 }).lean();

    return {
      ...item,
      summary
    };
  }
}
