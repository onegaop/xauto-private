import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type JobRunDocument = HydratedDocument<JobRun>;

@Schema({ collection: 'job_runs', timestamps: true })
export class JobRun {
  @Prop({ required: true, index: true })
  jobName!: string;

  @Prop({ required: true, enum: ['RUNNING', 'SUCCESS', 'FAILED'] })
  status!: 'RUNNING' | 'SUCCESS' | 'FAILED';

  @Prop({ required: true })
  startedAt!: Date;

  @Prop()
  finishedAt?: Date;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop()
  error?: string;

  @Prop({ default: 0 })
  retryCount!: number;

  @Prop({ default: 0 })
  costEstimateCny!: number;
}

export const JobRunSchema = SchemaFactory.createForClass(JobRun);
JobRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
