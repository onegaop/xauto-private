import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { extractJsonObject } from '../../common/utils/json';
import { ProviderName } from '@xauto/shared-types';
import { BudgetService } from './budget.service';
import { ProviderConfigService } from './provider-config.service';

export type BookmarkInput = {
  tweetId: string;
  text: string;
};

export type SummaryResult = {
  oneLinerZh: string;
  oneLinerEn: string;
  bulletsZh: string[];
  bulletsEn: string[];
  tagsZh: string[];
  tagsEn: string[];
  actions: string[];
  qualityScore: number;
  provider: ProviderName;
  model: string;
};

export type DigestResult = {
  topThemes: string[];
  topItems: Array<{ tweetId: string; reason: string; nextStep: string }>;
  risks: string[];
  tomorrowActions: string[];
  provider: ProviderName;
  model: string;
};

@Injectable()
export class AiService {
  constructor(
    private readonly providerConfigService: ProviderConfigService,
    private readonly budgetService: BudgetService
  ) {}

  async generateMiniSummary(item: BookmarkInput): Promise<SummaryResult> {
    const usageRatio = await this.budgetService.getUsageRatio();
    const providers = await this.pickProviders('mini', usageRatio);

    for (const provider of providers) {
      try {
        const response = await this.callModel(provider.baseUrl, provider.apiKey, provider.miniModel, [
          {
            role: 'system',
            content:
              'You are a strict knowledge assistant. Output must be valid JSON with keys: one_liner_zh, one_liner_en, bullets_zh, bullets_en, tags_zh, tags_en, actions, quality_score.'
          },
          {
            role: 'user',
            content: `Tweet:\n${item.text}`
          }
        ]);

        const normalized = this.normalizeMini(response, provider.provider, provider.miniModel);
        await this.budgetService.recordUsageCny(this.estimateMiniCost(item.text));
        return normalized;
      } catch {
        continue;
      }
    }

    return {
      oneLinerZh: item.text.slice(0, 20) || '无摘要',
      oneLinerEn: item.text.slice(0, 40) || 'No summary',
      bulletsZh: [item.text.slice(0, 80)],
      bulletsEn: [item.text.slice(0, 120)],
      tagsZh: ['未分类'],
      tagsEn: ['uncategorized'],
      actions: [],
      qualityScore: 0.4,
      provider: 'deepseek',
      model: 'fallback'
    };
  }

  async generateDigest(
    period: 'daily' | 'weekly',
    summaries: Array<{
      tweetId: string;
      oneLinerZh: string;
      oneLinerEn: string;
      tagsZh: string[];
      actions: string[];
    }>
  ): Promise<DigestResult> {
    const usageRatio = await this.budgetService.getUsageRatio();
    if (usageRatio >= 1) {
      return this.fallbackDigest(summaries);
    }

    const providers = await this.pickProviders('digest', usageRatio);

    for (const provider of providers) {
      try {
        const response = await this.callModel(provider.baseUrl, provider.apiKey, provider.digestModel, [
          {
            role: 'system',
            content:
              'You are a strict digest assistant. Output JSON keys: top_themes, top_items[{tweet_id,reason,next_step}], risks, tomorrow_actions.'
          },
          {
            role: 'user',
            content: `Period: ${period}\nSummaries: ${JSON.stringify(summaries)}`
          }
        ]);

        const digest = this.normalizeDigest(response, provider.provider, provider.digestModel);
        await this.budgetService.recordUsageCny(this.estimateDigestCost(summaries.length));
        return digest;
      } catch {
        continue;
      }
    }

    return this.fallbackDigest(summaries);
  }

  private async pickProviders(task: 'mini' | 'digest', usageRatio: number): Promise<Array<{
    provider: ProviderName;
    baseUrl: string;
    apiKey: string;
    miniModel: string;
    digestModel: string;
  }>> {
    const configs = await this.providerConfigService.getActiveProviderCredentials();

    if (configs.length === 0) {
      return [];
    }

    const sorted = usageRatio >= 0.7 ? [...configs].sort((a, b) => b.priority - a.priority) : configs;

    return sorted.map((item) => ({
      provider: item.provider,
      baseUrl: item.baseUrl,
      apiKey: item.apiKey,
      miniModel: item.miniModel,
      digestModel: item.digestModel
    }));
  }

  private async callModel(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<Record<string, unknown>> {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    const response = await axios.post(
      url,
      {
        model,
        messages,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const content = response.data?.choices?.[0]?.message?.content;

    if (typeof content !== 'string') {
      throw new Error('Model response content missing');
    }

    return extractJsonObject(content);
  }

  private normalizeMini(payload: Record<string, unknown>, provider: ProviderName, model: string): SummaryResult {
    const valueAsStringArray = (input: unknown): string[] =>
      Array.isArray(input) ? input.map((item) => String(item)).filter(Boolean) : [];

    const quality = Number(payload.quality_score ?? 0.5);

    return {
      oneLinerZh: String(payload.one_liner_zh ?? '无摘要'),
      oneLinerEn: String(payload.one_liner_en ?? 'No summary'),
      bulletsZh: valueAsStringArray(payload.bullets_zh).slice(0, 3),
      bulletsEn: valueAsStringArray(payload.bullets_en).slice(0, 3),
      tagsZh: valueAsStringArray(payload.tags_zh).slice(0, 5),
      tagsEn: valueAsStringArray(payload.tags_en).slice(0, 5),
      actions: valueAsStringArray(payload.actions).slice(0, 2),
      qualityScore: Number.isFinite(quality) ? Math.max(0, Math.min(1, quality)) : 0.5,
      provider,
      model
    };
  }

  private normalizeDigest(payload: Record<string, unknown>, provider: ProviderName, model: string): DigestResult {
    const toStringArray = (input: unknown): string[] =>
      Array.isArray(input) ? input.map((item) => String(item)).filter(Boolean) : [];

    const rawTopItems = Array.isArray(payload.top_items) ? payload.top_items : [];

    return {
      topThemes: toStringArray(payload.top_themes).slice(0, 3),
      topItems: rawTopItems
        .map((item) => {
          if (item && typeof item === 'object') {
            return {
              tweetId: String((item as Record<string, unknown>).tweet_id ?? ''),
              reason: String((item as Record<string, unknown>).reason ?? ''),
              nextStep: String((item as Record<string, unknown>).next_step ?? '')
            };
          }

          return null;
        })
        .filter((item): item is { tweetId: string; reason: string; nextStep: string } => Boolean(item?.tweetId))
        .slice(0, 5),
      risks: toStringArray(payload.risks).slice(0, 5),
      tomorrowActions: toStringArray(payload.tomorrow_actions).slice(0, 5),
      provider,
      model
    };
  }

  private fallbackDigest(
    summaries: Array<{ tweetId: string; oneLinerZh: string; tagsZh: string[]; actions: string[] }>
  ): DigestResult {
    const topThemes = summaries.flatMap((item) => item.tagsZh).slice(0, 3);

    return {
      topThemes: topThemes.length > 0 ? topThemes : ['无主题'],
      topItems: summaries.slice(0, 5).map((item) => ({
        tweetId: item.tweetId,
        reason: item.oneLinerZh,
        nextStep: item.actions[0] ?? '继续观察'
      })),
      risks: ['模型预算限制，已使用降级结果'],
      tomorrowActions: ['复查高优先级条目'],
      provider: 'deepseek',
      model: 'fallback'
    };
  }

  private estimateMiniCost(text: string): number {
    return Number((Math.max(1, text.length) * 0.00002).toFixed(6));
  }

  private estimateDigestCost(summaryCount: number): number {
    return Number((Math.max(1, summaryCount) * 0.0002).toFixed(6));
  }
}
