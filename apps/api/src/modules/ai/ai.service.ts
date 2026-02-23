import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { extractJsonObject } from '../../common/utils/json';
import { ProviderName } from '@xauto/shared-types';
import { BudgetService } from './budget.service';
import { ProviderConfigService } from './provider-config.service';
import { PromptConfigService } from './prompt-config.service';

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
  renderMarkdown: string;
  coreViewpoint: string;
  underlyingProblem: string;
  keyTechnologies: Array<{ concept: string; solves: string }>;
  claimTypes: Array<{ statement: string; label: 'fact' | 'opinion' | 'speculation' }>;
  researchKeywordsEn: string[];
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
    private readonly budgetService: BudgetService,
    private readonly promptConfigService: PromptConfigService
  ) {}

  async generateMiniSummary(item: BookmarkInput): Promise<SummaryResult> {
    const usageRatio = await this.budgetService.getUsageRatio();
    const providers = await this.pickProviders('mini', usageRatio);

    for (const provider of providers) {
      try {
        const systemPrompt = await this.promptConfigService.getMiniSummarySystemPrompt();
        const response = await this.callModel(provider.baseUrl, provider.apiKey, provider.miniModel, [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Post:\n<<< ${item.text} >>>`
          }
        ]);

        const normalized = this.normalizeMini(response, provider.provider, provider.miniModel);
        await this.budgetService.recordUsageCny(this.estimateMiniCost(item.text));
        const renderMarkdown = await this.generateMiniMarkdown(item, normalized, provider).catch(() =>
          this.buildMiniMarkdownFallback(normalized)
        );

        return {
          ...normalized,
          renderMarkdown
        };
      } catch {
        continue;
      }
    }

    const fallback: SummaryResult = {
      oneLinerZh: item.text.slice(0, 20) || '无摘要',
      oneLinerEn: item.text.slice(0, 40) || 'No summary',
      bulletsZh: [item.text.slice(0, 80)],
      bulletsEn: [item.text.slice(0, 120)],
      tagsZh: ['未分类'],
      tagsEn: ['uncategorized'],
      actions: [],
      renderMarkdown: '',
      coreViewpoint: item.text.slice(0, 60) || '无核心观点',
      underlyingProblem: '待补充',
      keyTechnologies: [],
      claimTypes: [],
      researchKeywordsEn: [],
      qualityScore: 0.4,
      provider: 'deepseek',
      model: 'fallback'
    };

    return {
      ...fallback,
      renderMarkdown: this.buildMiniMarkdownFallback(fallback)
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
        const systemPrompt = await this.promptConfigService.getDigestSystemPrompt();
        const response = await this.callModel(provider.baseUrl, provider.apiKey, provider.digestModel, [
          {
            role: 'system',
            content: systemPrompt
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

  private async callModelText(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    const response = await axios.post(
      url,
      {
        model,
        messages,
        temperature: 0.4
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
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const joined = content
        .map((item) => (item && typeof item === 'object' ? String((item as Record<string, unknown>).text ?? '') : ''))
        .join('\n')
        .trim();
      if (joined) {
        return joined;
      }
    }

    throw new Error('Model response content missing');
  }

  private normalizeMini(payload: Record<string, unknown>, provider: ProviderName, model: string): SummaryResult {
    const valueAsStringArray = (input: unknown): string[] =>
      Array.isArray(input) ? input.map((item) => String(item)).filter(Boolean) : [];
    const claimLabelSet = new Set(['fact', 'opinion', 'speculation']);
    const toClaimLabel = (input: unknown): 'fact' | 'opinion' | 'speculation' => {
      const value = String(input ?? '').toLowerCase();
      if (value === 'fact' || value === 'opinion' || value === 'speculation') {
        return value;
      }
      return 'opinion';
    };

    const quality = Number(payload.quality_score ?? 0.5);
    const oneLinerZh = String(payload.one_liner_zh ?? '无摘要');
    const oneLinerEn = String(payload.one_liner_en ?? 'No summary');

    const keyTechnologies = Array.isArray(payload.key_technologies)
      ? payload.key_technologies
          .flatMap((item): Array<{ concept: string; solves: string }> => {
            if (!item || typeof item !== 'object') {
              return [];
            }

            const value = item as Record<string, unknown>;
            const concept = String(value.concept ?? '').trim();
            const solves = String(value.solves ?? '').trim();
            if (!concept || !solves) {
              return [];
            }

            return [{ concept, solves }];
          })
          .slice(0, 8)
      : [];

    const claimTypes = Array.isArray(payload.claim_types)
      ? payload.claim_types
          .flatMap((item): Array<{ statement: string; label: 'fact' | 'opinion' | 'speculation' }> => {
            if (!item || typeof item !== 'object') {
              return [];
            }

            const value = item as Record<string, unknown>;
            const statement = String(value.statement ?? '').trim();
            const label = toClaimLabel(value.label);
            if (!statement || !claimLabelSet.has(label)) {
              return [];
            }

            return [{ statement, label }];
          })
          .slice(0, 10)
      : [];

    const researchKeywordsEn = valueAsStringArray(payload.research_keywords_en).slice(0, 6);
    const coreViewpoint = String(payload.core_viewpoint ?? oneLinerZh).trim() || oneLinerZh;
    const underlyingProblem = String(payload.underlying_problem ?? '').trim();

    return {
      oneLinerZh,
      oneLinerEn,
      bulletsZh: valueAsStringArray(payload.bullets_zh).slice(0, 3),
      bulletsEn: valueAsStringArray(payload.bullets_en).slice(0, 3),
      tagsZh: valueAsStringArray(payload.tags_zh).slice(0, 5),
      tagsEn: valueAsStringArray(payload.tags_en).slice(0, 5),
      actions: valueAsStringArray(payload.actions).slice(0, 2),
      renderMarkdown: '',
      coreViewpoint,
      underlyingProblem,
      keyTechnologies,
      claimTypes,
      researchKeywordsEn,
      qualityScore: Number.isFinite(quality) ? Math.max(0, Math.min(1, quality)) : 0.5,
      provider,
      model
    };
  }

  private async generateMiniMarkdown(
    item: BookmarkInput,
    summary: Omit<SummaryResult, 'renderMarkdown'>,
    provider: { provider: ProviderName; baseUrl: string; apiKey: string; miniModel: string }
  ): Promise<string> {
    const systemPrompt = await this.promptConfigService.getMiniMarkdownSystemPrompt();
    const payload = {
      tweet_id: item.tweetId,
      one_liner_zh: summary.oneLinerZh,
      one_liner_en: summary.oneLinerEn,
      bullets_zh: summary.bulletsZh,
      tags_zh: summary.tagsZh,
      actions: summary.actions,
      core_viewpoint: summary.coreViewpoint,
      underlying_problem: summary.underlyingProblem
    };

    const content = await this.callModelText(provider.baseUrl, provider.apiKey, provider.miniModel, [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: `Post:\n<<< ${item.text} >>>\n\nStructured summary:\n${JSON.stringify(payload)}`
      }
    ]);

    const markdown = this.normalizeMarkdown(content);
    if (!markdown) {
      throw new Error('Markdown content is empty');
    }

    await this.budgetService.recordUsageCny(this.estimateMiniMarkdownCost(item.text));
    return markdown;
  }

  private normalizeMarkdown(input: string): string {
    return input.replace(/\r\n/g, '\n').trim().slice(0, 8000);
  }

  private buildMiniMarkdownFallback(summary: Omit<SummaryResult, 'renderMarkdown'>): string {
    const bullets = summary.bulletsZh.length > 0 ? summary.bulletsZh : [summary.oneLinerZh];
    const actions = summary.actions.length > 0 ? summary.actions : ['持续跟踪后续信息'];
    const tags = summary.tagsZh.length > 0 ? summary.tagsZh.join(' / ') : '未分类';

    return [
      `## 核心结论`,
      summary.oneLinerZh,
      '',
      `## 关键要点`,
      ...bullets.map((item) => `- ${item}`),
      '',
      `## 行动建议`,
      ...actions.map((item) => `- ${item}`),
      '',
      `## 标签`,
      tags
    ].join('\n');
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

  private estimateMiniMarkdownCost(text: string): number {
    return Number((Math.max(1, text.length) * 0.00001).toFixed(6));
  }

  private estimateDigestCost(summaryCount: number): number {
    return Number((Math.max(1, summaryCount) * 0.0002).toFixed(6));
  }
}
