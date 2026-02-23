import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SyncState, SyncStateDocument } from '../../database/schemas/sync-state.schema';
import { UpdatePromptsDto } from './dto/update-prompts.dto';

const MINI_PROMPT_KEY = 'prompt:mini_summary_system';
const DIGEST_PROMPT_KEY = 'prompt:digest_system';
const MINI_MARKDOWN_PROMPT_KEY = 'prompt:mini_markdown_system';

const DEFAULT_MINI_PROMPT = `你是技术分析师。

请拆解这条 X post，中文输出、简洁，严格返回 JSON object（不要 markdown）：

1. 提取事实 vs 观点
2. 给出逻辑结构
3. 列出隐含假设
4. 提供反方视角
5. 总结可复用洞察（<=3条）
6. 如果有涉及的 GitHub 开源库，列出名字和链接

建议字段（用于上述 1-6）：
- fact_vs_opinion: { facts: [], opinions: [], speculations: [] }
- logic_structure: []
- hidden_assumptions: []
- counter_views: []
- reusable_insights: []
- github_libraries: [{ name, url }]

兼容字段（必须同时提供，保证前端稳定）：
- core_viewpoint
- underlying_problem
- key_technologies: [{ concept, solves }]
- claim_types: [{ statement, label }]，label 只能是 fact / opinion / speculation
- research_keywords_en: [string, string, string]
- one_liner_zh
- one_liner_en
- bullets_zh
- bullets_en
- tags_zh
- tags_en
- actions
- quality_score

要求：
- 中英双语信息尽量完整（若英文不足，可简短补齐）。
- quality_score 为 0 到 1 的数字。
- 严格返回 JSON object。`;

const DEFAULT_DIGEST_PROMPT =
  'You are a strict digest assistant. Output JSON keys: top_themes, top_items[{tweet_id,reason,next_step}], risks, tomorrow_actions.';

const DEFAULT_MINI_MARKDOWN_PROMPT = `你是技术洞察编辑，请基于输入的 X post 与结构化摘要，输出一份可直接展示的 Markdown。

要求：
- 使用中文为主，可混合少量英文术语。
- 输出结构建议：标题、核心结论、关键要点（3-5 条）、可执行建议（1-3 条）。
- 保持简洁、可读，避免空话。
- 只输出 Markdown 正文，不要 JSON，不要代码块围栏。`;

type PromptSnapshot = {
  miniSummarySystem: string;
  digestSystem: string;
  miniMarkdownSystem: string;
  miniSummarySystemEditable: boolean;
  digestSystemEditable: boolean;
  miniMarkdownSystemEditable: boolean;
};

@Injectable()
export class PromptConfigService {
  private cache: { snapshot: PromptSnapshot; fetchedAt: number } | null = null;
  private readonly cacheTtlMs = 30_000;

  constructor(
    @InjectModel(SyncState.name)
    private readonly syncStateModel: Model<SyncStateDocument>
  ) {}

  async listPrompts(): Promise<PromptSnapshot> {
    return this.getPromptSnapshot(true);
  }

  async getMiniSummarySystemPrompt(): Promise<string> {
    const snapshot = await this.getPromptSnapshot();
    return snapshot.miniSummarySystem;
  }

  async getDigestSystemPrompt(): Promise<string> {
    const snapshot = await this.getPromptSnapshot();
    return snapshot.digestSystem;
  }

  async getMiniMarkdownSystemPrompt(): Promise<string> {
    const snapshot = await this.getPromptSnapshot();
    return snapshot.miniMarkdownSystem;
  }

  async updatePrompts(dto: UpdatePromptsDto): Promise<PromptSnapshot> {
    if (!dto.miniSummarySystem && !dto.digestSystem && !dto.miniMarkdownSystem) {
      throw new BadRequestException('At least one prompt field is required');
    }

    if (dto.miniSummarySystem || dto.digestSystem) {
      throw new BadRequestException(
        'Structured prompts are locked to protect output schema. Use non-structured prompts for freeform editing.'
      );
    }

    if (!dto.miniMarkdownSystem) {
      throw new BadRequestException('Only miniMarkdownSystem can be updated');
    }

    const now = new Date().toISOString();
    await this.syncStateModel.updateOne(
      { key: MINI_MARKDOWN_PROMPT_KEY },
      {
        $set: {
          value: {
            text: dto.miniMarkdownSystem,
            updatedAt: now
          }
        }
      },
      { upsert: true }
    );

    this.cache = null;
    return this.getPromptSnapshot(true);
  }

  private async getPromptSnapshot(forceRefresh = false): Promise<PromptSnapshot> {
    const now = Date.now();
    if (!forceRefresh && this.cache && now - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache.snapshot;
    }

    const docs = await this.syncStateModel.find({
      key: { $in: [MINI_PROMPT_KEY, DIGEST_PROMPT_KEY, MINI_MARKDOWN_PROMPT_KEY] }
    });

    const byKey = new Map(docs.map((item) => [item.key, item]));
    const miniSummarySystem = this.extractPrompt(byKey.get(MINI_PROMPT_KEY), DEFAULT_MINI_PROMPT);
    const digestSystem = this.extractPrompt(byKey.get(DIGEST_PROMPT_KEY), DEFAULT_DIGEST_PROMPT);
    const miniMarkdownSystem = this.extractPrompt(byKey.get(MINI_MARKDOWN_PROMPT_KEY), DEFAULT_MINI_MARKDOWN_PROMPT);

    const snapshot: PromptSnapshot = {
      miniSummarySystem,
      digestSystem,
      miniMarkdownSystem,
      miniSummarySystemEditable: false,
      digestSystemEditable: false,
      miniMarkdownSystemEditable: true
    };

    this.cache = {
      snapshot,
      fetchedAt: now
    };

    return snapshot;
  }

  private extractPrompt(doc: SyncStateDocument | undefined, fallback: string): string {
    const text = doc?.value?.text;
    if (typeof text === 'string' && text.trim().length > 0) {
      return text;
    }
    return fallback;
  }
}
