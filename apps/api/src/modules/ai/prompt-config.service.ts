import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SyncState, SyncStateDocument } from '../../database/schemas/sync-state.schema';
import { UpdatePromptsDto } from './dto/update-prompts.dto';

const MINI_PROMPT_KEY = 'prompt:mini_summary_system';
const DIGEST_PROMPT_KEY = 'prompt:digest_system';
const MINI_MARKDOWN_PROMPT_KEY = 'prompt:mini_markdown_system';

const DEFAULT_MINI_PROMPT = `你是技术分析师。

请对输入的 X post 做“拆解式理解”，并且只返回一个 JSON object（禁止 markdown、禁止解释文字、禁止代码块）。

拆解目标：
1. 提取事实 vs 观点（可包含推测）
2. 给出逻辑结构
3. 列出隐含假设
4. 提供反方视角
5. 总结可复用洞察（<=3条）
6. 如提到 GitHub 开源库，列出名字和链接

输出必须同时满足两套字段：

A. 拆解字段（用于分析能力）：
- fact_vs_opinion: { facts: string[], opinions: string[], speculations: string[] }
- logic_structure: string[]
- hidden_assumptions: string[]
- counter_views: string[]
- reusable_insights: string[]
- github_libraries: [{ name: string, url: string }]

B. 结构化业务字段（必须和数据库/iOS 展示兼容）：
- one_liner_zh: string
- one_liner_en: string
- bullets_zh: string[]
- bullets_en: string[]
- tags_zh: string[]
- tags_en: string[]
- actions: string[]
- core_viewpoint: string
- underlying_problem: string
- key_technologies: [{ concept: string, solves: string }]
- claim_types: [{ statement: string, label: "fact" | "opinion" | "speculation" }]
- research_keywords_en: [string, string, string]
- quality_score: number (0~1)

硬性约束：
- 以上字段必须全部出现，不允许缺字段。
- 不允许输出“无摘要”“待补充”“N/A”“未知”等占位词。
- 信息不足时请做最小合理推断，保持简洁具体。
- 中文为主；research_keywords_en 必须是英文关键词。`;

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
