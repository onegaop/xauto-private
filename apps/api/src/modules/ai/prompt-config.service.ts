import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SyncState, SyncStateDocument } from '../../database/schemas/sync-state.schema';
import { UpdatePromptsDto } from './dto/update-prompts.dto';

const MINI_PROMPT_KEY = 'prompt:mini_summary_system';
const DIGEST_PROMPT_KEY = 'prompt:digest_system';

const DEFAULT_MINI_PROMPT = `你是技术分析师。

请对下面这条 X post 做“拆解式理解”，并输出为严格 JSON（不要输出 markdown）：

1. 核心观点（一句话）
2. 背后的底层问题是什么？
3. 涉及哪些关键技术或概念？分别在解决什么？
4. 这是事实、观点还是推测？标注清楚。
5. 如果我想深入研究，给 3 个英文关键词。

JSON 必须包含以下字段：
- core_viewpoint
- underlying_problem
- key_technologies: [{ concept, solves }]
- claim_types: [{ statement, label }]，label 只能是 fact / opinion / speculation
- research_keywords_en: [string, string, string]

兼容字段（必须同时提供）：
- one_liner_zh
- one_liner_en
- bullets_zh
- bullets_en
- tags_zh
- tags_en
- actions
- quality_score

要求：
- 中英双语信息尽量完整。
- quality_score 为 0 到 1 的数字。
- 严格返回 JSON object。`;

const DEFAULT_DIGEST_PROMPT =
  'You are a strict digest assistant. Output JSON keys: top_themes, top_items[{tweet_id,reason,next_step}], risks, tomorrow_actions.';

type PromptSnapshot = {
  miniSummarySystem: string;
  digestSystem: string;
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

  async updatePrompts(dto: UpdatePromptsDto): Promise<PromptSnapshot> {
    if (!dto.miniSummarySystem && !dto.digestSystem) {
      throw new BadRequestException('At least one prompt field is required');
    }

    const now = new Date().toISOString();

    if (dto.miniSummarySystem) {
      await this.syncStateModel.updateOne(
        { key: MINI_PROMPT_KEY },
        {
          $set: {
            value: {
              text: dto.miniSummarySystem,
              updatedAt: now
            }
          }
        },
        { upsert: true }
      );
    }

    if (dto.digestSystem) {
      await this.syncStateModel.updateOne(
        { key: DIGEST_PROMPT_KEY },
        {
          $set: {
            value: {
              text: dto.digestSystem,
              updatedAt: now
            }
          }
        },
        { upsert: true }
      );
    }

    this.cache = null;
    return this.getPromptSnapshot(true);
  }

  private async getPromptSnapshot(forceRefresh = false): Promise<PromptSnapshot> {
    const now = Date.now();
    if (!forceRefresh && this.cache && now - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache.snapshot;
    }

    const docs = await this.syncStateModel.find({ key: { $in: [MINI_PROMPT_KEY, DIGEST_PROMPT_KEY] } });

    const byKey = new Map(docs.map((item) => [item.key, item]));
    const miniSummarySystem = this.extractPrompt(byKey.get(MINI_PROMPT_KEY), DEFAULT_MINI_PROMPT);
    const digestSystem = this.extractPrompt(byKey.get(DIGEST_PROMPT_KEY), DEFAULT_DIGEST_PROMPT);

    const snapshot: PromptSnapshot = {
      miniSummarySystem,
      digestSystem
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
