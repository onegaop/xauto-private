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
