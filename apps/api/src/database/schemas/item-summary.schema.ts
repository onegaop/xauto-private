import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ItemSummaryDocument = HydratedDocument<ItemSummary>;

@Schema({ collection: 'item_summaries', timestamps: true })
export class ItemSummary {
  @Prop({ required: true, index: true })
  tweetId!: string;

  @Prop({ required: true, default: 1 })
  version!: number;

  @Prop({ required: true })
  oneLinerZh!: string;

  @Prop({ required: true })
  oneLinerEn!: string;

  @Prop({ type: [String], default: [] })
  bulletsZh!: string[];

  @Prop({ type: [String], default: [] })
  bulletsEn!: string[];

  @Prop({ type: [String], default: [] })
  tagsZh!: string[];

  @Prop({ type: [String], default: [] })
  tagsEn!: string[];

  @Prop({ type: [String], default: [] })
  actions!: string[];

  @Prop({ default: '' })
  coreViewpoint!: string;

  @Prop({ default: '' })
  underlyingProblem!: string;

  @Prop({
    type: [
      {
        concept: { type: String, required: true },
        solves: { type: String, required: true }
      }
    ],
    default: []
  })
  keyTechnologies!: Array<{ concept: string; solves: string }>;

  @Prop({
    type: [
      {
        statement: { type: String, required: true },
        label: { type: String, enum: ['fact', 'opinion', 'speculation'], required: true }
      }
    ],
    default: []
  })
  claimTypes!: Array<{ statement: string; label: 'fact' | 'opinion' | 'speculation' }>;

  @Prop({ type: [String], default: [] })
  researchKeywordsEn!: string[];

  @Prop({ required: true })
  qualityScore!: number;

  @Prop({ required: true })
  provider!: string;

  @Prop({ required: true })
  model!: string;

  @Prop({ required: true })
  summarizedAt!: Date;
}

export const ItemSummarySchema = SchemaFactory.createForClass(ItemSummary);
ItemSummarySchema.index({ tweetId: 1, version: 1 }, { unique: true });
