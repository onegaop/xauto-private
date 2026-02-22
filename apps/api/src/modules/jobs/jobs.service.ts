import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JobRun, JobRunDocument } from '../../database/schemas/job-run.schema';
import { DigestService } from '../digest/digest.service';
import { SyncService } from '../sync/sync.service';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(JobRun.name)
    private readonly jobRunModel: Model<JobRunDocument>,
    private readonly syncService: SyncService,
    private readonly digestService: DigestService
  ) {}

  async triggerSync(): Promise<Record<string, unknown>> {
    return this.executeJob('sync', async () => this.syncService.runIncrementalSync());
  }

  async triggerDailyDigest(): Promise<Record<string, unknown>> {
    return this.executeJob('digest_daily', async () => this.digestService.generateDailyDigest());
  }

  async triggerWeeklyDigest(): Promise<Record<string, unknown>> {
    return this.executeJob('digest_weekly', async () => this.digestService.generateWeeklyDigest());
  }

  async listRuns(limit = 30): Promise<JobRunDocument[]> {
    return this.jobRunModel.find().sort({ startedAt: -1 }).limit(Math.min(100, Math.max(1, limit)));
  }

  private async executeJob(
    jobName: string,
    task: () => Promise<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    const startedAt = new Date();

    const run = await this.jobRunModel.create({
      jobName,
      status: 'RUNNING',
      startedAt,
      retryCount: 0,
      costEstimateCny: 0
    });

    try {
      const result = await task();

      await this.jobRunModel.updateOne(
        { _id: run.id },
        {
          $set: {
            status: 'SUCCESS',
            finishedAt: new Date(),
            metadata: result
          }
        }
      );

      return {
        jobName,
        status: 'SUCCESS',
        result
      };
    } catch (error) {
      await this.jobRunModel.updateOne(
        { _id: run.id },
        {
          $set: {
            status: 'FAILED',
            finishedAt: new Date(),
            error: error instanceof Error ? error.message : String(error)
          }
        }
      );

      throw error;
    }
  }
}
