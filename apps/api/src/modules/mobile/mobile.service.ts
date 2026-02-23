import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { BookmarkItem, BookmarkItemDocument } from '../../database/schemas/bookmark-item.schema';
import { DigestReport, DigestReportDocument } from '../../database/schemas/digest-report.schema';
import { ItemSummary, ItemSummaryDocument } from '../../database/schemas/item-summary.schema';
import { getEnv } from '../../config/env';
import { dayKey, nowInTimezone, weekKey } from '../../common/utils/date';
import { LookupVocabularyDto } from './dto/lookup-vocabulary.dto';
import { AiService } from '../ai/ai.service';

type DigestPeriod = 'daily' | 'weekly';
type ClaimLabel = 'fact' | 'opinion' | 'speculation';
type DigestTopItem = { tweetId: string; reason: string; nextStep: string };

@Injectable()
export class MobileService {
  private static readonly RESEARCH_KEYWORD_BLOCKLIST = new Set([
    'x-post-analysis',
    'analysis',
    'research',
    'keyword',
    'keywords',
    'summary',
    'summaries',
    'insight',
    'insights',
    'topic',
    'topics',
    'model-retry',
    'summary-fallback',
    'system-fallback',
    'http',
    'https',
    'www',
    'com',
    'org',
    'net',
    't.co',
    'uncategorized',
    'unknown',
    'none',
    'n-a',
    'na'
  ]);
  private readonly logger = new Logger(MobileService.name);

  constructor(
    @InjectModel(BookmarkItem.name)
    private readonly bookmarkItemModel: Model<BookmarkItemDocument>,
    @InjectModel(ItemSummary.name)
    private readonly itemSummaryModel: Model<ItemSummaryDocument>,
    @InjectModel(DigestReport.name)
    private readonly digestReportModel: Model<DigestReportDocument>,
    private readonly aiService: AiService
  ) {}

  async getTodayDigest(): Promise<Record<string, unknown> | null> {
    const env = getEnv();
    const key = dayKey(nowInTimezone(env.TIMEZONE));

    const digest = await this.digestReportModel.findOne({ period: 'daily', periodKey: key }).lean();
    return this.sortDigestTopItemsBySyncedAt(digest as Record<string, unknown> | null);
  }

  async getWeekDigest(): Promise<Record<string, unknown> | null> {
    const env = getEnv();
    const key = weekKey(nowInTimezone(env.TIMEZONE));

    const digest = await this.digestReportModel.findOne({ period: 'weekly', periodKey: key }).lean();
    return this.sortDigestTopItemsBySyncedAt(digest as Record<string, unknown> | null);
  }

  async getDigestHistory(periodRaw?: string, limitRaw?: string, cursor?: string): Promise<Record<string, unknown>> {
    const period: DigestPeriod = periodRaw === 'weekly' ? 'weekly' : 'daily';
    const limit = this.parseLimit(limitRaw, 20);

    const filter: Record<string, unknown> = { period };
    const decoded = this.decodeDigestCursor(cursor);
    if (decoded) {
      filter.$or = [
        { generatedAt: { $lt: decoded.generatedAt } },
        { generatedAt: decoded.generatedAt, _id: { $lt: new Types.ObjectId(decoded.id) } }
      ];
    }

    const docs = await this.digestReportModel
      .find(filter)
      .sort({ generatedAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    const orderedItems = await this.sortDigestListTopItemsBySyncedAt(items as Array<Record<string, unknown>>);
    const last = items.at(-1);
    const generatedAt = last?.generatedAt ? new Date(last.generatedAt) : null;
    const nextCursor = hasMore && last
      && generatedAt
      && this.isValidDate(generatedAt)
      && last._id
      ? this.encodeCursor({ generatedAt: generatedAt.toISOString(), id: String(last._id) })
      : null;

    return {
      items: orderedItems,
      nextCursor
    };
  }

  async getSummaryStats(rangeRaw?: string): Promise<Record<string, unknown>> {
    const range = rangeRaw === '30d' || rangeRaw === '90d' ? rangeRaw : '7d';
    const dayCount = range === '30d' ? 30 : range === '90d' ? 90 : 7;
    const now = new Date();
    const from = new Date(now.getTime() - dayCount * 24 * 60 * 60 * 1000);

    const result = await this.itemSummaryModel.aggregate([
      {
        $match: {
          version: 1,
          summarizedAt: { $gte: from }
        }
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalSummaries: { $sum: 1 },
                avgQualityScore: { $avg: '$qualityScore' },
                actionItemCount: { $sum: { $size: { $ifNull: ['$actions', []] } } }
              }
            }
          ],
          topTags: [
            { $unwind: { path: '$tagsZh', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$tagsZh', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 12 }
          ],
          claimLabelDistribution: [
            { $unwind: { path: '$claimTypes', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$claimTypes.label', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } }
          ],
          topResearchKeywords: [
            { $unwind: { path: '$researchKeywordsEn', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$researchKeywordsEn', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 50 }
          ]
        }
      }
    ]);

    const facet = result[0] as {
      totals?: Array<{ totalSummaries: number; avgQualityScore: number; actionItemCount: number }>;
      topTags?: Array<{ _id: string; count: number }>;
      claimLabelDistribution?: Array<{ _id: string; count: number }>;
      topResearchKeywords?: Array<{ _id: string; count: number }>;
    } | undefined;

    const totals = facet?.totals?.[0];
    const topResearchKeywords = this.filterTopResearchKeywords(facet?.topResearchKeywords ?? []);

    return {
      range,
      from: from.toISOString(),
      to: now.toISOString(),
      totalSummaries: totals?.totalSummaries ?? 0,
      avgQualityScore: Number((totals?.avgQualityScore ?? 0).toFixed(4)),
      actionItemCount: totals?.actionItemCount ?? 0,
      topTags: (facet?.topTags ?? []).map((item) => ({
        tag: item._id,
        count: item.count
      })),
      claimLabelDistribution: (facet?.claimLabelDistribution ?? []).map((item) => ({
        label: item._id,
        count: item.count
      })),
      topResearchKeywords: topResearchKeywords.map((item) => ({
        keyword: item._id,
        count: item.count
      }))
    };
  }

  async listItems(
    limitRaw?: string,
    cursor?: string,
    tagRaw?: string,
    claimLabelRaw?: string,
    qualityMinRaw?: string
  ): Promise<Record<string, unknown>> {
    const limit = this.parseLimit(limitRaw, 20);
    const tag = typeof tagRaw === 'string' ? tagRaw.trim() : '';
    const claimLabel: ClaimLabel | '' =
      claimLabelRaw === 'fact' || claimLabelRaw === 'opinion' || claimLabelRaw === 'speculation'
        ? claimLabelRaw
        : '';
    const qualityRaw = typeof qualityMinRaw === 'string' ? qualityMinRaw.trim() : '';
    const qualityMinNumber = qualityRaw ? Number(qualityRaw) : Number.NaN;
    const qualityMin = Number.isFinite(qualityMinNumber) ? Math.max(0, Math.min(1, qualityMinNumber)) : null;

    const match: Record<string, unknown> = {};
    const decoded = this.decodeItemsCursor(cursor);
    if (decoded) {
      match.$or = [
        { createdAtX: { $lt: decoded.createdAtX } },
        { createdAtX: decoded.createdAtX, _id: { $lt: new Types.ObjectId(decoded.id) } }
      ];
    }

    const pipeline: Array<Record<string, unknown>> = [
      { $match: match },
      { $sort: { createdAtX: -1, _id: -1 } },
      {
        $lookup: {
          from: 'item_summaries',
          let: { tweetId: '$tweetId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$tweetId', '$$tweetId'] }, { $eq: ['$version', 1] }]
                }
              }
            }
          ],
          as: 'summaryDocs'
        }
      },
      {
        $set: {
          summary: { $arrayElemAt: ['$summaryDocs', 0] }
        }
      },
      {
        $project: {
          summaryDocs: 0
        }
      }
    ];

    const summaryFilters: Array<Record<string, unknown>> = [];
    if (tag) {
      summaryFilters.push({
        $or: [{ 'summary.tagsZh': tag }, { 'summary.tagsEn': tag }]
      });
    }

    if (claimLabel) {
      summaryFilters.push({
        'summary.claimTypes': { $elemMatch: { label: claimLabel } }
      });
    }

    if (qualityMin !== null) {
      summaryFilters.push({
        'summary.qualityScore': { $gte: qualityMin }
      });
    }

    if (summaryFilters.length > 0) {
      pipeline.push({
        $match: {
          summary: { $ne: null },
          $and: summaryFilters
        }
      });
    }

    pipeline.push({ $limit: limit + 1 });
    const rows = (await this.bookmarkItemModel.aggregate(pipeline as unknown as PipelineStage[])) as Array<
      Record<string, unknown>
    >;
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const last = items.at(-1) as { createdAtX?: Date | string; _id?: Types.ObjectId | string } | undefined;
    const createdAt = last?.createdAtX ? new Date(last.createdAtX) : null;
    const nextCursor = hasMore && createdAt && last?._id
      && this.isValidDate(createdAt)
      ? this.encodeCursor({ createdAtX: createdAt.toISOString(), id: String(last._id) })
      : null;

    return {
      items,
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

  async lookupVocabulary(dto: LookupVocabularyDto): Promise<Record<string, unknown>> {
    const term = (dto.term ?? '').trim().slice(0, 64);
    if (!term) {
      throw new BadRequestException('Term is required');
    }

    const context = this.normalizeContext(dto.context);
    const sourceLangHint = this.normalizeLangHint(dto.sourceLangHint);
    const targetLang = this.normalizeTargetLang(dto.targetLang);

    try {
      const result = await this.aiService.lookupVocabularyCard({
        term,
        context,
        sourceLangHint,
        targetLang
      });
      this.logger.log(
        `Vocabulary lookup success term="${term}" sourceLangHint="${sourceLangHint}" targetLang="${targetLang}" provider="${String(
          result.provider
        )}" model="${result.model}" confidence=${result.confidence.toFixed(2)}`
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vocabulary lookup failed';
      this.logger.warn(
        `Vocabulary lookup failed term="${term}" sourceLangHint="${sourceLangHint}" targetLang="${targetLang}": ${message}`
      );
      throw new ServiceUnavailableException(message);
    }
  }

  private parseLimit(limitRaw: string | undefined, fallback: number): number {
    const parsed = Number(limitRaw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(50, Math.max(1, Math.trunc(parsed)));
  }

  private normalizeContext(contextRaw?: string): string {
    if (!contextRaw) {
      return '';
    }
    return contextRaw.replace(/\s+/g, ' ').trim().slice(0, 240);
  }

  private normalizeLangHint(raw?: string): string {
    if (!raw) {
      return 'unknown';
    }
    const value = raw.trim().toLowerCase();
    if (!value) {
      return 'unknown';
    }
    if (value === 'en' || value === 'english') {
      return 'en';
    }
    if (value === 'zh' || value === 'zh-cn' || value === 'chinese') {
      return 'zh';
    }
    if (value === 'mixed') {
      return 'mixed';
    }
    return 'unknown';
  }

  private normalizeTargetLang(raw?: string): string {
    const normalized = raw?.trim();
    return normalized && normalized.length > 0 ? normalized.slice(0, 16) : 'zh-CN';
  }

  private filterTopResearchKeywords(
    rows: Array<{ _id: string; count: number }>
  ): Array<{ _id: string; count: number }> {
    const output: Array<{ _id: string; count: number }> = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const normalized = this.normalizeResearchKeyword(row._id);
      if (!normalized) {
        continue;
      }
      if (seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      output.push({ _id: normalized, count: row.count });
      if (output.length >= 10) {
        break;
      }
    }

    return output;
  }

  private normalizeResearchKeyword(value: string): string | null {
    let normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    normalized = normalized.replace(/^#/, '');
    normalized = normalized.replace(/https?:\/\/\S+/g, ' ');
    normalized = normalized.replace(/[^\x00-\x7F]/g, ' ');
    normalized = normalized.replace(/[^a-z0-9+._/\-\s]/g, ' ');
    normalized = normalized.replace(/\s+/g, '-');
    normalized = normalized.replace(/-+/g, '-').replace(/^-|-$/g, '');

    if (!normalized || normalized.length < 3 || normalized.length > 40) {
      return null;
    }
    if (!/[a-z]/.test(normalized)) {
      return null;
    }
    if (MobileService.RESEARCH_KEYWORD_BLOCKLIST.has(normalized)) {
      return null;
    }
    return normalized;
  }

  private decodeDigestCursor(cursor?: string): { generatedAt: Date; id: string } | null {
    const payload = this.decodeCursorPayload(cursor);
    if (!payload) {
      return null;
    }

    const generatedAtRaw = typeof payload.generatedAt === 'string' ? payload.generatedAt : '';
    const id = typeof payload.id === 'string' ? payload.id : '';

    if (!generatedAtRaw || !id || !Types.ObjectId.isValid(id)) {
      return null;
    }

    const generatedAt = new Date(generatedAtRaw);
    if (!this.isValidDate(generatedAt)) {
      return null;
    }

    return { generatedAt, id };
  }

  private decodeItemsCursor(cursor?: string): { createdAtX: Date; id: string } | null {
    const payload = this.decodeCursorPayload(cursor);
    if (!payload) {
      return null;
    }

    const createdAtXRaw = typeof payload.createdAtX === 'string' ? payload.createdAtX : '';
    const id = typeof payload.id === 'string' ? payload.id : '';

    if (!createdAtXRaw || !id || !Types.ObjectId.isValid(id)) {
      return null;
    }

    const createdAtX = new Date(createdAtXRaw);
    if (!this.isValidDate(createdAtX)) {
      return null;
    }

    return { createdAtX, id };
  }

  private decodeCursorPayload(cursor?: string): Record<string, unknown> | null {
    if (!cursor) {
      return null;
    }

    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
      if (!decoded || typeof decoded !== 'object') {
        return null;
      }
      return decoded as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private encodeCursor(payload: Record<string, string>): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private async sortDigestTopItemsBySyncedAt(
    digest: Record<string, unknown> | null
  ): Promise<Record<string, unknown> | null> {
    if (!digest) {
      return null;
    }

    const [ordered] = await this.sortDigestListTopItemsBySyncedAt([digest]);
    return ordered ?? digest;
  }

  private async sortDigestListTopItemsBySyncedAt(
    digests: Array<Record<string, unknown>>
  ): Promise<Array<Record<string, unknown>>> {
    if (digests.length === 0) {
      return digests;
    }

    const tweetIds = new Set<string>();
    const parsedTopItemsByDigest = digests.map((digest) => {
      const topItems = this.parseDigestTopItems(digest.topItems);
      for (const item of topItems) {
        tweetIds.add(item.tweetId);
      }
      return topItems;
    });

    if (tweetIds.size === 0) {
      return digests;
    }

    const bookmarks = await this.bookmarkItemModel
      .find({ tweetId: { $in: Array.from(tweetIds) } })
      .select('tweetId syncedAt createdAt')
      .lean();

    const syncedAtMsByTweetId = new Map<string, number>();
    for (const bookmark of bookmarks) {
      const syncedAt = bookmark.syncedAt instanceof Date ? bookmark.syncedAt : null;
      const createdAt = (bookmark as { createdAt?: Date }).createdAt instanceof Date
        ? (bookmark as { createdAt?: Date }).createdAt
        : null;
      const effectiveDate = syncedAt ?? createdAt;
      if (effectiveDate) {
        syncedAtMsByTweetId.set(bookmark.tweetId, effectiveDate.getTime());
      }
    }

    return digests.map((digest, index) => {
      const topItems = parsedTopItemsByDigest[index] ?? [];
      if (topItems.length < 2) {
        return digest;
      }

      const sortedTopItems = topItems
        .map((item, itemIndex) => ({
          item,
          itemIndex,
          syncedAtMs: syncedAtMsByTweetId.get(item.tweetId) ?? Number.MIN_SAFE_INTEGER
        }))
        .sort((a, b) => {
          if (a.syncedAtMs !== b.syncedAtMs) {
            return b.syncedAtMs - a.syncedAtMs;
          }
          return a.itemIndex - b.itemIndex;
        })
        .map((entry) => entry.item);

      return {
        ...digest,
        topItems: sortedTopItems
      };
    });
  }

  private parseDigestTopItems(raw: unknown): DigestTopItem[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    const out: DigestTopItem[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const tweetId = typeof record.tweetId === 'string' ? record.tweetId.trim() : '';
      if (!tweetId) {
        continue;
      }

      out.push({
        tweetId,
        reason: typeof record.reason === 'string' ? record.reason : '',
        nextStep: typeof record.nextStep === 'string' ? record.nextStep : ''
      });
    }

    return out;
  }

  private isValidDate(date: Date): boolean {
    return Number.isFinite(date.getTime());
  }
}
