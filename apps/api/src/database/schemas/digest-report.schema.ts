import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DigestReportDocument = HydratedDocument<DigestReport>;

@Schema({ collection: 'digest_reports', timestamps: true })
export class DigestReport {
  @Prop({ required: true, enum: ['daily', 'weekly'], index: true })
  period!: 'daily' | 'weekly';

  @Prop({ required: true, index: true })
  periodKey!: string;

  @Prop({ type: [String], default: [] })
  topThemes!: string[];

  @Prop({
    type: [
      {
        tweetId: { type: String, required: true },
        reason: { type: String, required: true },
        nextStep: { type: String, required: true }
      }
    ],
    default: []
  })
  topItems!: Array<{ tweetId: string; reason: string; nextStep: string }>;

  @Prop({ type: [String], default: [] })
  risks!: string[];

  @Prop({ type: [String], default: [] })
  tomorrowActions!: string[];

  @Prop({ required: true })
  generatedAt!: Date;
}

export const DigestReportSchema = SchemaFactory.createForClass(DigestReport);
DigestReportSchema.index({ period: 1, periodKey: 1 }, { unique: true });
