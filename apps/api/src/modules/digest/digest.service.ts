import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DigestReport, DigestReportDocument } from '../../database/schemas/digest-report.schema';
import { ItemSummary, ItemSummaryDocument } from '../../database/schemas/item-summary.schema';
import { getEnv } from '../../config/env';
import { dayKey, dayRange, nowInTimezone, weekKey, weekRange } from '../../common/utils/date';
import { AiService } from '../ai/ai.service';

@Injectable()
export class DigestService {
  constructor(
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

    const summaries = await this.itemSummaryModel
      .find({ summarizedAt: { $gte: range.start, $lte: range.end } })
      .sort({ summarizedAt: -1 })
      .limit(500);

    const digest = await this.aiService.generateDigest(
      'daily',
      summaries.map((item) => ({
        tweetId: item.tweetId,
        oneLinerZh: item.oneLinerZh,
        oneLinerEn: item.oneLinerEn,
        tagsZh: item.tagsZh,
        actions: item.actions
      }))
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
      summaryCount: summaries.length,
      provider: digest.provider,
      model: digest.model
    };
  }

  async generateWeeklyDigest(): Promise<Record<string, unknown>> {
    const env = getEnv();
    const now = nowInTimezone(env.TIMEZONE);
    const key = weekKey(now);
    const range = weekRange(now);

    const summaries = await this.itemSummaryModel
      .find({ summarizedAt: { $gte: range.start, $lte: range.end } })
      .sort({ summarizedAt: -1 })
      .limit(2000);

    const digest = await this.aiService.generateDigest(
      'weekly',
      summaries.map((item) => ({
        tweetId: item.tweetId,
        oneLinerZh: item.oneLinerZh,
        oneLinerEn: item.oneLinerEn,
        tagsZh: item.tagsZh,
        actions: item.actions
      }))
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
      summaryCount: summaries.length,
      provider: digest.provider,
      model: digest.model
    };
  }
}
