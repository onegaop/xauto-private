import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProviderConfigDocument = HydratedDocument<ProviderConfig>;

@Schema({ collection: 'provider_configs', timestamps: true })
export class ProviderConfig {
  @Prop({ required: true, enum: ['deepseek', 'qwen'], unique: true, index: true })
  provider!: 'deepseek' | 'qwen';

  @Prop({ required: true })
  baseUrl!: string;

  @Prop({ required: true })
  encryptedApiKey!: string;

  @Prop({ required: true })
  keyIv!: string;

  @Prop({ required: true })
  keyTag!: string;

  @Prop({ required: true })
  miniModel!: string;

  @Prop({ required: true })
  digestModel!: string;

  @Prop({ required: true, default: true })
  enabled!: boolean;

  @Prop({ required: true, default: 100 })
  priority!: number;

  @Prop({ required: true, default: 100 })
  monthlyBudgetCny!: number;
}

export const ProviderConfigSchema = SchemaFactory.createForClass(ProviderConfig);
