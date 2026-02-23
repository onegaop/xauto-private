import { Injectable, Logger } from '@nestjs/common';
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

export type VocabularyLookupInput = {
  term: string;
  context?: string;
  sourceLangHint?: string;
  targetLang?: string;
};

export type VocabularyLookupResult = {
  term: string;
  normalizedTerm: string;
  sourceLanguage: 'en' | 'zh' | 'mixed' | 'unknown';
  targetLanguage: string;
  translation: string;
  shortDefinitionZh: string;
  shortDefinitionEn: string;
  phonetic: {
    ipa: string;
    us: string;
    uk: string;
  };
  partOfSpeech: string[];
  domainTags: string[];
  collocations: Array<{ text: string; translation: string }>;
  example: {
    source: string;
    target: string;
  };
  confusable: Array<{ word: string; diff: string }>;
  confidence: number;
  provider: ProviderName;
  model: string;
  source: 'model';
  cachedAt: string;
};

const VOCAB_LOOKUP_SYSTEM_PROMPT_V1 = `你是“技术语境双语词汇助手”。你的任务是根据用户给出的单词/短语和上下文，输出轻量但高质量的查词结果。

必须遵守：
1. 只输出一个 JSON object。
2. 禁止输出 markdown、解释文字、代码块、额外前后缀。
3. 不得使用占位词（N/A、未知、待补充、无）。
4. 若上下文不足，给出最常见技术语义，并适当降低 confidence。
5. 所有中文输出使用简体中文。
6. 保持“轻量卡片”信息密度，避免长篇分析。

JSON Schema（字段必须全部出现）：
{
  "term": "string",
  "normalizedTerm": "string",
  "sourceLanguage": "en|zh|mixed|unknown",
  "targetLanguage": "string",
  "translation": "string",
  "shortDefinitionZh": "string",
  "shortDefinitionEn": "string",
  "phonetic": {
    "ipa": "string",
    "us": "string",
    "uk": "string"
  },
  "partOfSpeech": ["string"],
  "domainTags": ["string"],
  "collocations": [
    { "text": "string", "translation": "string" }
  ],
  "example": {
    "source": "string",
    "target": "string"
  },
  "confusable": [
    { "word": "string", "diff": "string" }
  ],
  "confidence": 0.0
}

长度与数量约束：
- translation <= 24 字符
- shortDefinitionZh <= 60 字符
- shortDefinitionEn <= 80 字符
- partOfSpeech 1~3 项
- domainTags 0~3 项
- collocations 0~3 项
- confusable 0~2 项
- confidence 范围 [0,1]

语义选择规则：
- 优先使用 context 决定词义。
- 若 term 为技术词，优先输出技术语义，不要泛化成日常语义。
- 若 term 是缩写（如 RAG、K8s），保留缩写并给扩展解释。`;

const VOCAB_LOOKUP_REPAIR_PROMPT_V1 = `你将收到一段可能不合规的模型输出。
任务：在不新增事实的前提下，重排为符合指定 schema 的 JSON object。
只输出 JSON object，不要任何解释。
若某字段无法确定，使用最小合理值并降低 confidence。`;

@Injectable()
export class AiService {
  private static readonly RESEARCH_KEYWORD_BLOCKLIST = new Set([
    'x-post-analysis',
    'post-analysis',
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
    'n-a',
    'na',
    'none'
  ]);

  private static readonly RESEARCH_KEYWORD_STOPWORDS = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'for',
    'from',
    'how',
    'in',
    'is',
    'it',
    'of',
    'on',
    'or',
    'that',
    'the',
    'this',
    'to',
    'was',
    'we',
    'with',
    'you',
    'your',
    'key',
    'point',
    'post',
    'tweet',
    'thread'
  ]);

  private static readonly PLACEHOLDER_WORDS = new Set([
    'n/a',
    'na',
    'none',
    'unknown',
    '待补充',
    '未知',
    '无',
    '暂无'
  ]);
  private readonly logger = new Logger(AiService.name);

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

        const normalized = this.normalizeMini(response, provider.provider, provider.miniModel, item.text);
        this.assertMiniSummaryShape(normalized);
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

    const fallbackProvider = providers[0]?.provider ?? 'gemini';
    const fallback: SummaryResult = {
      oneLinerZh: '模型暂时不可用，已标记为待重试',
      oneLinerEn: 'Model unavailable; marked for retry.',
      bulletsZh: ['本条内容暂未拿到稳定结构化输出，建议稍后重试摘要。'],
      bulletsEn: ['Structured output is temporarily unavailable; please retry summary later.'],
      tagsZh: ['系统降级'],
      tagsEn: ['system-fallback'],
      actions: ['在 Admin 中执行刷新摘要重试该条目'],
      renderMarkdown: '',
      coreViewpoint: '模型暂时不可用，已标记为待重试',
      underlyingProblem: '当前无法稳定获取结构化结果，需要稍后重试。',
      keyTechnologies: [],
      claimTypes: [],
      researchKeywordsEn: [],
      qualityScore: 0.2,
      provider: fallbackProvider,
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

  async lookupVocabularyCard(input: VocabularyLookupInput): Promise<VocabularyLookupResult> {
    const term = input.term.trim().slice(0, 64);
    if (!term) {
      throw new Error('Term is required');
    }

    const normalizedInput = {
      term,
      context: (input.context ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
      sourceLangHint: this.toSourceLanguage(input.sourceLangHint),
      targetLang: (input.targetLang ?? 'zh-CN').trim().slice(0, 16) || 'zh-CN'
    };

    const usageRatio = await this.budgetService.getUsageRatio();
    const providers = await this.pickProviders('mini', usageRatio);

    for (const provider of providers) {
      try {
        const userPrompt =
          `term: ${normalizedInput.term}\n`
          + `context: ${normalizedInput.context || '(empty)'}\n`
          + `source_lang_hint: ${normalizedInput.sourceLangHint}\n`
          + `target_lang: ${normalizedInput.targetLang}\n\n`
          + '请按 system 要求返回 JSON。';

        const rawText = await this.callModelText(provider.baseUrl, provider.apiKey, provider.miniModel, [
          {
            role: 'system',
            content: VOCAB_LOOKUP_SYSTEM_PROMPT_V1
          },
          {
            role: 'user',
            content: userPrompt
          }
        ]);

        let payload: Record<string, unknown>;
        try {
          payload = extractJsonObject(rawText);
        } catch {
          payload = await this.repairVocabularyPayload(rawText, provider.baseUrl, provider.apiKey, provider.miniModel);
        }

        const normalized = this.normalizeVocabularyLookup(
          payload,
          normalizedInput,
          provider.provider,
          provider.miniModel
        );
        this.assertVocabularyLookupShape(normalized);
        await this.budgetService.recordUsageCny(
          this.estimateVocabularyLookupCost(normalizedInput.term, normalizedInput.context)
        );
        this.logger.log(
          `Vocabulary model success term="${normalizedInput.term}" provider="${provider.provider}" model="${provider.miniModel}" confidence=${normalized.confidence.toFixed(
            2
          )}`
        );
        return normalized;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(
          `Vocabulary model failed term="${normalizedInput.term}" provider="${provider.provider}" model="${provider.miniModel}": ${message}`
        );
        continue;
      }
    }

    throw new Error('Vocabulary lookup unavailable');
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

    const response = await this.postChatCompletionsWithRetry(url, apiKey, {
      model,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });

    const choices = Array.isArray(response?.choices) ? response.choices : [];
    const firstMessage =
      choices.length > 0 && choices[0] && typeof choices[0] === 'object'
        ? (choices[0] as Record<string, unknown>).message
        : undefined;
    const content =
      firstMessage && typeof firstMessage === 'object'
        ? (firstMessage as Record<string, unknown>).content
        : undefined;

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

    const response = await this.postChatCompletionsWithRetry(url, apiKey, {
      model,
      messages,
      temperature: 0.4
    });

    const choices = Array.isArray(response?.choices) ? response.choices : [];
    const firstMessage =
      choices.length > 0 && choices[0] && typeof choices[0] === 'object'
        ? (choices[0] as Record<string, unknown>).message
        : undefined;
    const content =
      firstMessage && typeof firstMessage === 'object'
        ? (firstMessage as Record<string, unknown>).content
        : undefined;
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

  private async postChatCompletionsWithRetry(
    url: string,
    apiKey: string,
    payload: Record<string, unknown>,
    maxAttempts = 3
  ): Promise<Record<string, unknown>> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const response = await axios.post(url, payload, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });

        return response.data as Record<string, unknown>;
      } catch (error) {
        lastError = error;
        if (!this.shouldRetryModelError(error) || attempt >= maxAttempts) {
          throw error;
        }
        await this.sleep(this.retryDelayMs(attempt));
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Model call failed after retries');
  }

  private normalizeMini(
    payload: Record<string, unknown>,
    provider: ProviderName,
    model: string,
    sourceText: string
  ): SummaryResult {
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
    let claimTypes = this.parseClaimTypes(payload);

    const claimStatementFallback = claimTypes.find((item) => item.statement.trim().length > 0)?.statement ?? '';
    const coreViewpoint =
      coreViewpointRaw
      || oneLinerZhRaw
      || reusableInsights[0]
      || logicStructure[0]
      || hiddenAssumptions[0]
      || counterViews[0]
      || claimStatementFallback
      || '';
    const oneLinerZh = oneLinerZhRaw || coreViewpoint || claimStatementFallback || '';
    const oneLinerEn = oneLinerEnRaw || (oneLinerZh ? `Key point: ${oneLinerZh}` : '');

    if (claimTypes.length === 0 && oneLinerZh) {
      claimTypes = [
        {
          statement: oneLinerZh.slice(0, 300),
          label: 'opinion'
        }
      ];
    }

    const underlyingProblem =
      String(this.pickFromPayload(payload, ['underlying_problem', '底层问题']) ?? '').trim()
      || hiddenAssumptions[0]
      || logicStructure[0]
      || counterViews[0]
      || claimTypes.find((item) => item.label !== 'fact')?.statement
      || (oneLinerZh ? '该观点背后的关键前提和约束有待进一步验证。' : '');

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

    const parsedTagsEn = this.toStringList(this.pickFromPayload(payload, ['tags_en']));
    let researchKeywordsEn = this.normalizeResearchKeywords(
      this.toStringList(this.pickFromPayload(payload, ['research_keywords_en', 'research_keywords', '英文关键词'])),
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

    let tagsEn = this.takeUniqueStrings([...parsedTagsEn, ...researchKeywordsEn], 5);
    if (tagsEn.length === 0) {
      tagsEn = this.takeUniqueStrings(
        keyTechnologies.map((item) => item.concept),
        5
      );
    }

    if (researchKeywordsEn.length === 0) {
      researchKeywordsEn = this.deriveResearchKeywords({
        sourceText,
        tagsEn,
        keyTechnologies,
        githubLibraries
      });
    }

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
      bulletsZh: bulletsZh.length > 0 ? bulletsZh : (oneLinerZh ? [oneLinerZh] : []),
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

  private assertMiniSummaryShape(summary: SummaryResult): void {
    const oneLinerZh = summary.oneLinerZh.trim();
    const coreViewpoint = summary.coreViewpoint.trim();
    const underlyingProblem = summary.underlyingProblem.trim();

    if (!oneLinerZh || oneLinerZh === '无摘要') {
      throw new Error('Mini summary missing oneLinerZh');
    }

    if (!coreViewpoint || coreViewpoint === '无摘要') {
      throw new Error('Mini summary missing coreViewpoint');
    }

    if (!underlyingProblem || underlyingProblem === '待补充') {
      throw new Error('Mini summary missing underlyingProblem');
    }
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
    const candidateRoots: unknown[] = [
      payload,
      payload.A,
      payload.a,
      payload.analysis,
      payload.data,
      payload.result,
      payload.output
    ];

    for (const key of keys) {
      for (const root of candidateRoots) {
        if (!root || typeof root !== 'object' || Array.isArray(root)) {
          continue;
        }

        const value = this.readPath(root, key);
        if (value === undefined || value === null) {
          continue;
        }

        if (typeof value === 'string' && value.trim().length === 0) {
          continue;
        }

        return value;
      }
    }

    return undefined;
  }

  private shouldRetryModelError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const status = error.response?.status;
    if (!status) {
      return true;
    }

    return status === 408 || status === 429 || (status >= 500 && status < 600);
  }

  private retryDelayMs(attempt: number): number {
    const base = 500 * (2 ** (attempt - 1));
    return Math.min(base, 5000);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
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

  private normalizeResearchKeywords(values: string[], limit: number): string[] {
    const output: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
      const normalized = this.normalizeResearchKeyword(value);
      if (!normalized) {
        continue;
      }
      if (seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      output.push(normalized);
      if (output.length >= limit) {
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
    if (AiService.RESEARCH_KEYWORD_BLOCKLIST.has(normalized)) {
      return null;
    }

    const parts = normalized.split(/[-._/+]/).filter(Boolean);
    if (parts.length === 0) {
      return null;
    }

    if (parts.every((part) => AiService.RESEARCH_KEYWORD_STOPWORDS.has(part))) {
      return null;
    }

    return normalized;
  }

  private deriveResearchKeywords(input: {
    sourceText: string;
    tagsEn: string[];
    keyTechnologies: Array<{ concept: string; solves: string }>;
    githubLibraries: string[];
  }): string[] {
    const githubNames = input.githubLibraries.map((item) => item.split('(')[0]?.trim() ?? item.trim());
    const hashtagKeywords = this.extractHashtagKeywords(input.sourceText);

    const candidates = [
      ...input.tagsEn,
      ...input.keyTechnologies.map((item) => item.concept),
      ...githubNames,
      ...hashtagKeywords
    ];

    return this.normalizeResearchKeywords(candidates, 3);
  }

  private extractHashtagKeywords(text: string): string[] {
    const matches = text.match(/#[A-Za-z][A-Za-z0-9_+\-]{1,32}/g) ?? [];
    return matches.map((item) => item.replace(/^#/, ''));
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

  private async repairVocabularyPayload(
    rawOutput: string,
    baseUrl: string,
    apiKey: string,
    model: string
  ): Promise<Record<string, unknown>> {
    return this.callModel(baseUrl, apiKey, model, [
      {
        role: 'system',
        content: VOCAB_LOOKUP_REPAIR_PROMPT_V1
      },
      {
        role: 'user',
        content: `raw_output:\n<<< ${rawOutput.slice(0, 6000)} >>>`
      }
    ]);
  }

  private normalizeVocabularyLookup(
    payload: Record<string, unknown>,
    input: { term: string; context: string; sourceLangHint: 'en' | 'zh' | 'mixed' | 'unknown'; targetLang: string },
    provider: ProviderName,
    model: string
  ): VocabularyLookupResult {
    const term = this.truncateText(String(payload.term ?? input.term).trim(), 64);
    const normalizedTerm = this.normalizeVocabularyTerm(
      String(payload.normalizedTerm ?? term).trim() || term
    );
    const sourceLanguage = this.toSourceLanguage(
      String(payload.sourceLanguage ?? this.inferSourceLanguage(term, input.sourceLangHint))
    );
    const targetLanguage = this.truncateText(
      String(payload.targetLanguage ?? input.targetLang).trim() || input.targetLang,
      16
    );
    const translation = this.sanitizeVocabularyText(
      String(payload.translation ?? '').trim() || term,
      24,
      '术语释义'
    );
    const shortDefinitionZh = this.sanitizeVocabularyText(
      String(payload.shortDefinitionZh ?? '').trim() || `${translation} 的常见技术语义。`,
      60,
      '技术语义待确认'
    );
    const shortDefinitionEn = this.sanitizeVocabularyText(
      String(payload.shortDefinitionEn ?? '').trim() || `Technical meaning of ${term}.`,
      80,
      `Technical meaning of ${term}.`
    );

    const phoneticRaw = payload.phonetic;
    const phoneticRecord =
      phoneticRaw && typeof phoneticRaw === 'object' && !Array.isArray(phoneticRaw)
        ? (phoneticRaw as Record<string, unknown>)
        : {};
    const phonetic = {
      ipa: this.truncateText(String(phoneticRecord.ipa ?? '').trim(), 32),
      us: this.truncateText(String(phoneticRecord.us ?? '').trim(), 32),
      uk: this.truncateText(String(phoneticRecord.uk ?? '').trim(), 32)
    };

    const partOfSpeech = this.takeUniqueStrings(
      this.toStringList(payload.partOfSpeech).map((item) => this.truncateText(item, 16)),
      3
    );
    const domainTags = this.takeUniqueStrings(
      this.toStringList(payload.domainTags).map((item) => this.normalizeVocabularyTerm(item)),
      3
    );

    const collocations = this.parseVocabularyPairs(payload.collocations, 3);
    const confusable = this.parseVocabularyPairs(payload.confusable, 2, 'word', 'diff').map((item) => ({
      word: item.text,
      diff: item.translation
    }));

    const exampleRaw = payload.example;
    const exampleRecord =
      exampleRaw && typeof exampleRaw === 'object' && !Array.isArray(exampleRaw)
        ? (exampleRaw as Record<string, unknown>)
        : {};
    const exampleSource = this.sanitizeVocabularyText(
      String(exampleRecord.source ?? '').trim() || input.context || `Term: ${term}`,
      120,
      `Term: ${term}`
    );
    const exampleTarget = this.sanitizeVocabularyText(
      String(exampleRecord.target ?? '').trim() || `${translation} 常见于技术语境。`,
      120,
      `${translation} 常见于技术语境。`
    );

    const confidenceRaw = Number(payload.confidence ?? (input.context ? 0.88 : 0.62));
    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0.62;

    return {
      term,
      normalizedTerm,
      sourceLanguage,
      targetLanguage,
      translation,
      shortDefinitionZh,
      shortDefinitionEn,
      phonetic,
      partOfSpeech: partOfSpeech.length > 0 ? partOfSpeech : ['term'],
      domainTags,
      collocations,
      example: {
        source: exampleSource,
        target: exampleTarget
      },
      confusable,
      confidence,
      provider,
      model,
      source: 'model',
      cachedAt: new Date().toISOString()
    };
  }

  private assertVocabularyLookupShape(payload: VocabularyLookupResult): void {
    const required = [
      payload.term,
      payload.normalizedTerm,
      payload.translation,
      payload.shortDefinitionZh,
      payload.shortDefinitionEn,
      payload.example.source,
      payload.example.target
    ];

    for (const value of required) {
      const normalized = value.trim();
      if (!normalized) {
        throw new Error('Vocabulary lookup contains empty required fields');
      }

      const lowered = normalized.toLowerCase();
      if (AiService.PLACEHOLDER_WORDS.has(lowered)) {
        throw new Error('Vocabulary lookup contains placeholder value');
      }
    }

    if (payload.partOfSpeech.length === 0) {
      throw new Error('Vocabulary lookup missing partOfSpeech');
    }
  }

  private parseVocabularyPairs(
    input: unknown,
    limit: number,
    primaryKey = 'text',
    secondaryKey = 'translation'
  ): Array<{ text: string; translation: string }> {
    if (!Array.isArray(input)) {
      return [];
    }

    const output: Array<{ text: string; translation: string }> = [];
    const seen = new Set<string>();

    for (const item of input) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }

      const record = item as Record<string, unknown>;
      const textRaw = String(record[primaryKey] ?? '').trim();
      const translationRaw = String(record[secondaryKey] ?? '').trim();
      const text = this.sanitizeVocabularyText(textRaw, 80, '');
      const translation = this.sanitizeVocabularyText(translationRaw, 120, '');
      if (!text || !translation) {
        continue;
      }

      const key = `${text.toLowerCase()}|${translation.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      output.push({ text, translation });
      if (output.length >= limit) {
        break;
      }
    }

    return output;
  }

  private sanitizeVocabularyText(input: string, maxLength: number, fallback: string): string {
    const compact = input.replace(/\s+/g, ' ').trim();
    if (!compact) {
      return fallback;
    }

    const lowered = compact.toLowerCase();
    if (AiService.PLACEHOLDER_WORDS.has(lowered)) {
      return fallback;
    }

    return this.truncateText(compact, maxLength);
  }

  private truncateText(value: string, maxLength: number): string {
    const chars = Array.from(value);
    if (chars.length <= maxLength) {
      return value;
    }
    return chars.slice(0, maxLength).join('');
  }

  private normalizeVocabularyTerm(value: string): string {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return '';
    }
    return trimmed
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\u4e00-\u9fff+._/-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private inferSourceLanguage(term: string, hint: 'en' | 'zh' | 'mixed' | 'unknown'): 'en' | 'zh' | 'mixed' | 'unknown' {
    if (hint !== 'unknown') {
      return hint;
    }

    const hasChinese = /[\u4e00-\u9fff]/.test(term);
    const hasEnglish = /[A-Za-z]/.test(term);
    if (hasChinese && hasEnglish) {
      return 'mixed';
    }
    if (hasChinese) {
      return 'zh';
    }
    if (hasEnglish) {
      return 'en';
    }
    return 'unknown';
  }

  private toSourceLanguage(value?: string): 'en' | 'zh' | 'mixed' | 'unknown' {
    const normalized = (value ?? '').trim().toLowerCase();
    if (normalized === 'en' || normalized === 'english') {
      return 'en';
    }
    if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'chinese') {
      return 'zh';
    }
    if (normalized === 'mixed') {
      return 'mixed';
    }
    return 'unknown';
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

  private estimateVocabularyLookupCost(term: string, context: string): number {
    const chars = Math.max(1, term.length + context.length);
    return Number((chars * 0.00001).toFixed(6));
  }

  private estimateDigestCost(summaryCount: number): number {
    return Number((Math.max(1, summaryCount) * 0.0002).toFixed(6));
  }
}
