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
    const oneLinerZhRaw = String(
      this.pickFromPayload(payload, ['one_liner_zh', 'summary_zh', '核心观点', 'core_viewpoint']) ?? ''
    ).trim();
    const oneLinerEnRaw = String(this.pickFromPayload(payload, ['one_liner_en', 'summary_en']) ?? '').trim();
    const coreViewpointRaw = String(this.pickFromPayload(payload, ['core_viewpoint', '核心观点']) ?? '').trim();

    const logicStructure = this.toStringList(this.pickFromPayload(payload, ['logic_structure', '逻辑结构']));
    const hiddenAssumptions = this.toStringList(
      this.pickFromPayload(payload, ['hidden_assumptions', 'implicit_assumptions', '隐含假设'])
    );
    const counterViews = this.toStringList(
      this.pickFromPayload(payload, ['counter_views', 'counter_arguments', '反方视角'])
    );
    const reusableInsights = this.toStringList(
      this.pickFromPayload(payload, ['reusable_insights', 'actionable_insights', '可复用洞察'])
    );
    const githubLibraries = this.parseGithubLibraries(payload);

    const keyTechnologies = this.parseKeyTechnologies(payload);
    const claimTypes = this.parseClaimTypes(payload);

    const researchKeywordsEn = this.takeUniqueStrings(
      this.toStringList(this.pickFromPayload(payload, ['research_keywords_en', 'research_keywords', '英文关键词'])),
      6
    );

    const coreViewpoint = coreViewpointRaw || oneLinerZhRaw || reusableInsights[0] || logicStructure[0] || '无摘要';
    const oneLinerZh = oneLinerZhRaw || coreViewpoint;
    const oneLinerEn = oneLinerEnRaw || oneLinerZh || 'No summary';

    const underlyingProblem =
      String(this.pickFromPayload(payload, ['underlying_problem', '底层问题']) ?? '').trim()
      || hiddenAssumptions[0]
      || '';

    const bulletsZh = this.takeUniqueStrings(
      [
        ...this.toStringList(this.pickFromPayload(payload, ['bullets_zh', 'key_points_zh', '关键要点'])),
        ...logicStructure.map((item) => `逻辑：${item}`),
        ...hiddenAssumptions.map((item) => `假设：${item}`),
        ...counterViews.map((item) => `反方：${item}`),
        ...githubLibraries.map((item) => `开源库：${item}`)
      ],
      3
    );

    const bulletsEn = this.takeUniqueStrings(
      this.toStringList(this.pickFromPayload(payload, ['bullets_en', 'key_points_en'])),
      3
    );

    const tagsZh = this.takeUniqueStrings(
      [
        ...this.toStringList(this.pickFromPayload(payload, ['tags_zh', '标签'])),
        ...keyTechnologies.map((item) => item.concept),
        ...(githubLibraries.length > 0 ? ['GitHub'] : [])
      ],
      5
    );

    const tagsEn = this.takeUniqueStrings(
      [
        ...this.toStringList(this.pickFromPayload(payload, ['tags_en'])),
        ...researchKeywordsEn
      ],
      5
    );

    const actions = this.takeUniqueStrings(
      [
        ...this.toStringList(this.pickFromPayload(payload, ['actions', 'next_steps', '行动项'])),
        ...reusableInsights,
        ...githubLibraries.map((item) => `查看参考：${item}`)
      ],
      3
    );

    const quality = Number(this.pickFromPayload(payload, ['quality_score', 'quality', '质量分']) ?? 0.5);

    return {
      oneLinerZh,
      oneLinerEn,
      bulletsZh: bulletsZh.length > 0 ? bulletsZh : [oneLinerZh],
      bulletsEn,
      tagsZh,
      tagsEn,
      actions,
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
      underlying_problem: summary.underlyingProblem,
      key_technologies: summary.keyTechnologies,
      claim_types: summary.claimTypes,
      research_keywords_en: summary.researchKeywordsEn
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

  private pickFromPayload(payload: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
      const value = this.readPath(payload, key);
      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value === 'string' && value.trim().length === 0) {
        continue;
      }

      return value;
    }

    return undefined;
  }

  private readPath(source: unknown, path: string): unknown {
    const segments = path.split('.');
    let current: unknown = source;

    for (const segment of segments) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private splitListString(input: string): string[] {
    const normalized = input.replace(/\r\n/g, '\n').trim();
    if (!normalized) {
      return [];
    }

    const lineItems = normalized
      .split('\n')
      .map((item) => item.replace(/^[-*•\d\.\)\s]+/, '').trim())
      .filter(Boolean);
    if (lineItems.length > 1) {
      return lineItems;
    }

    const segmented = normalized
      .split(/[；;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (segmented.length > 1) {
      return segmented;
    }

    return [normalized];
  }

  private toStringList(input: unknown, depth = 0): string[] {
    if (input === undefined || input === null || depth > 2) {
      return [];
    }

    if (Array.isArray(input)) {
      return this.takeUniqueStrings(input.flatMap((item) => this.toStringList(item, depth + 1)), 40);
    }

    if (typeof input === 'string') {
      return this.splitListString(input);
    }

    if (typeof input === 'number' || typeof input === 'boolean') {
      return [String(input)];
    }

    if (typeof input === 'object') {
      const record = input as Record<string, unknown>;
      const preferredKeys = ['items', 'list', 'values', 'points', 'bullets', 'facts', 'opinions', 'speculations'];

      for (const key of preferredKeys) {
        if (!(key in record)) {
          continue;
        }
        const nested = this.toStringList(record[key], depth + 1);
        if (nested.length > 0) {
          return nested;
        }
      }

      const fromEntries = Object.entries(record).flatMap(([key, value]) => {
        if (typeof value === 'string' && value.trim()) {
          return [`${key}: ${value.trim()}`];
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
          return [`${key}: ${String(value)}`];
        }

        if (Array.isArray(value)) {
          return this.toStringList(value, depth + 1).map((item) => `${key}: ${item}`);
        }

        return [];
      });

      return this.takeUniqueStrings(fromEntries, 40);
    }

    return [];
  }

  private takeUniqueStrings(values: string[], limit: number): string[] {
    const output: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
      const normalized = value.trim();
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      output.push(normalized);
      if (output.length >= limit) {
        break;
      }
    }

    return output;
  }

  private toClaimLabel(input: unknown): 'fact' | 'opinion' | 'speculation' {
    const normalized = String(input ?? '').trim().toLowerCase();
    if (normalized === 'fact' || normalized === '事实') {
      return 'fact';
    }
    if (normalized === 'speculation' || normalized === '推测') {
      return 'speculation';
    }
    return 'opinion';
  }

  private parseKeyTechnologies(payload: Record<string, unknown>): Array<{ concept: string; solves: string }> {
    const raw = this.pickFromPayload(payload, [
      'key_technologies',
      'key_concepts',
      'technologies',
      '关键技术',
      '关键技术或概念'
    ]);

    if (!raw) {
      return [];
    }

    const output: Array<{ concept: string; solves: string }> = [];

    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (!item) {
          continue;
        }

        if (typeof item === 'string') {
          const concept = item.trim();
          if (concept) {
            output.push({ concept, solves: '待补充' });
          }
          continue;
        }

        if (typeof item === 'object') {
          const value = item as Record<string, unknown>;
          const concept = String(value.concept ?? value.name ?? value.technology ?? value.keyword ?? '').trim();
          const solves = String(value.solves ?? value.problem ?? value.role ?? value.use_case ?? '待补充').trim();
          if (concept) {
            output.push({ concept, solves: solves || '待补充' });
          }
        }
      }

      return this.takeUniqueStrings(
        output.map((item) => `${item.concept}|||${item.solves}`),
        8
      ).map((item) => {
        const [concept, solves] = item.split('|||');
        return { concept, solves };
      });
    }

    if (typeof raw === 'object') {
      return this.takeUniqueStrings(
        Object.entries(raw as Record<string, unknown>)
          .map(([concept, solves]) => ({ concept: concept.trim(), solves: String(solves ?? '').trim() }))
          .filter((item) => item.concept && item.solves)
          .map((item) => `${item.concept}|||${item.solves}`),
        8
      ).map((item) => {
        const [concept, solves] = item.split('|||');
        return { concept, solves };
      });
    }

    return [];
  }

  private parseClaimTypes(payload: Record<string, unknown>): Array<{ statement: string; label: 'fact' | 'opinion' | 'speculation' }> {
    const explicit = this.pickFromPayload(payload, ['claim_types', 'claims', '判断类型']);
    const output: Array<{ statement: string; label: 'fact' | 'opinion' | 'speculation' }> = [];

    if (Array.isArray(explicit)) {
      for (const item of explicit) {
        if (!item || typeof item !== 'object') {
          continue;
        }

        const value = item as Record<string, unknown>;
        const statement = String(value.statement ?? value.text ?? value.content ?? '').trim();
        const label = this.toClaimLabel(value.label);
        if (statement) {
          output.push({ statement, label });
        }
      }
    }

    const facts = this.toStringList(
      this.pickFromPayload(payload, ['fact_vs_opinion.facts', 'facts', '事实'])
    );
    const opinions = this.toStringList(
      this.pickFromPayload(payload, ['fact_vs_opinion.opinions', 'opinions', '观点'])
    );
    const speculations = this.toStringList(
      this.pickFromPayload(payload, ['fact_vs_opinion.speculations', 'speculations', '推测'])
    );

    output.push(...facts.map((statement) => ({ statement, label: 'fact' as const })));
    output.push(...opinions.map((statement) => ({ statement, label: 'opinion' as const })));
    output.push(...speculations.map((statement) => ({ statement, label: 'speculation' as const })));

    return this.takeUniqueStrings(
      output.map((item) => `${item.label}|||${item.statement}`),
      10
    ).map((item) => {
      const [labelRaw, statement] = item.split('|||');
      return {
        label: this.toClaimLabel(labelRaw),
        statement
      };
    });
  }

  private parseGithubLibraries(payload: Record<string, unknown>): string[] {
    const raw = this.pickFromPayload(payload, [
      'github_libraries',
      'github_repos',
      'open_source_libraries',
      'open_source_repos',
      '开源库',
      'github开源库'
    ]);

    if (!raw) {
      return [];
    }

    if (Array.isArray(raw)) {
      const mapped = raw.flatMap((item): string[] => {
        if (typeof item === 'string') {
          const trimmed = item.trim();
          return trimmed ? [trimmed] : [];
        }

        if (!item || typeof item !== 'object') {
          return [];
        }

        const value = item as Record<string, unknown>;
        const name = String(value.name ?? value.repo ?? value.library ?? value.title ?? '').trim();
        const url = String(value.url ?? value.link ?? value.github ?? '').trim();
        if (name && url) {
          return [`${name} (${url})`];
        }
        if (name) {
          return [name];
        }
        if (url) {
          return [url];
        }
        return [];
      });

      return this.takeUniqueStrings(mapped, 5);
    }

    return this.takeUniqueStrings(this.toStringList(raw), 5);
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
