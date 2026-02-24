import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JobRun, JobRunDocument } from '../../database/schemas/job-run.schema';
import { SyncState, SyncStateDocument } from '../../database/schemas/sync-state.schema';
import { DigestService } from '../digest/digest.service';
import { SyncService } from '../sync/sync.service';
import { SyncSettingsService } from '../sync/sync-settings.service';

@Injectable()
export class JobsService {
  private static readonly AUTO_DAILY_DIGEST_STATE_KEY = 'digest:auto_daily:last_trigger_at';
  private static readonly AUTO_DAILY_DIGEST_COOLDOWN_MS = 30 * 60 * 1000;

  constructor(
    @InjectModel(JobRun.name)
    private readonly jobRunModel: Model<JobRunDocument>,
    @InjectModel(SyncState.name)
    private readonly syncStateModel: Model<SyncStateDocument>,
    private readonly syncService: SyncService,
    private readonly digestService: DigestService,
    private readonly syncSettingsService: SyncSettingsService
  ) {}

  async triggerSync(options?: { force?: boolean; source?: 'internal' | 'admin' }): Promise<Record<string, unknown>> {
    const force = options?.force === true;
    const source = options?.source ?? (force ? 'admin' : 'internal');

    if (!force) {
      const decision = await this.syncSettingsService.shouldRunNow();
      if (!decision.shouldRun) {
        return {
          jobName: 'sync',
          status: 'SKIPPED',
          source,
          reason: decision.reason,
          syncIntervalHours: decision.settings.syncIntervalHours,
          lastRunAt: decision.settings.lastRunAt,
          nextRunAt: decision.settings.nextRunAt
        };
      }
    }

    return this.executeJob('sync', async () => {
      const result = await this.syncService.runIncrementalSync();
      await this.syncSettingsService.markSyncRun(new Date());
      const autoDailyDigest = await this.maybeTriggerAutoDailyDigest(result);

      return {
        ...result,
        source,
        forced: force,
        autoDailyDigest
      };
    });
  }

  async triggerDailyDigest(): Promise<Record<string, unknown>> {
    return this.executeJob('digest_daily', async () => this.digestService.generateDailyDigest());
  }

  async triggerWeeklyDigest(): Promise<Record<string, unknown>> {
    return this.executeJob('digest_weekly', async () => this.digestService.generateWeeklyDigest());
  }

  async triggerResummarize(payload?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const limitRaw = Number(payload?.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 50;
    const overwrite = typeof payload?.overwrite === 'boolean' ? payload.overwrite : true;
    const sinceSyncedAt = typeof payload?.sinceSyncedAt === 'string' ? payload.sinceSyncedAt : undefined;
    const tweetIds = Array.isArray(payload?.tweetIds)
      ? payload.tweetIds.map((item) => String(item)).filter(Boolean).slice(0, 50)
      : undefined;

    return this.executeJob('resummarize', async () =>
      this.syncService.rerunSummaries({
        limit,
        overwrite,
        sinceSyncedAt,
        tweetIds
      })
    );
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

  private async maybeTriggerAutoDailyDigest(syncResult: Record<string, unknown>): Promise<Record<string, unknown>> {
    const totalInsertedRaw = Number(syncResult.totalInserted ?? 0);
    const totalInserted = Number.isFinite(totalInsertedRaw) ? totalInsertedRaw : 0;

    if (totalInserted <= 0) {
      return {
        triggered: false,
        reason: 'no_new_items',
        totalInserted
      };
    }

    const now = new Date();
    const cooldown = await this.getAutoDailyDigestCooldownState(now);
    if (!cooldown.allowed) {
      return {
        triggered: false,
        reason: 'cooldown',
        totalInserted,
        lastTriggeredAt: cooldown.lastTriggeredAt,
        nextAllowedAt: cooldown.nextAllowedAt
      };
    }

    try {
      const digestResult = await this.triggerDailyDigest();
      await this.syncStateModel.updateOne(
        { key: JobsService.AUTO_DAILY_DIGEST_STATE_KEY },
        {
          $set: {
            value: {
              at: now.toISOString(),
              source: 'sync',
              totalInserted
            }
          }
        },
        { upsert: true }
      );

      return {
        triggered: true,
        totalInserted,
        digestJob: digestResult
      };
    } catch (error) {
      return {
        triggered: true,
        totalInserted,
        digestJob: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  private async getAutoDailyDigestCooldownState(now: Date): Promise<{
    allowed: boolean;
    lastTriggeredAt: string | null;
    nextAllowedAt: string | null;
  }> {
    const state = await this.syncStateModel.findOne({ key: JobsService.AUTO_DAILY_DIGEST_STATE_KEY }).lean();
    const rawAt = state?.value?.at;
    const lastTriggeredAt = typeof rawAt === 'string' ? rawAt : null;
    if (!lastTriggeredAt) {
      return {
        allowed: true,
        lastTriggeredAt: null,
        nextAllowedAt: null
      };
    }

    const lastMs = new Date(lastTriggeredAt).getTime();
    if (!Number.isFinite(lastMs)) {
      return {
        allowed: true,
        lastTriggeredAt: null,
        nextAllowedAt: null
      };
    }

    const nextAllowedAtMs = lastMs + JobsService.AUTO_DAILY_DIGEST_COOLDOWN_MS;
    if (now.getTime() >= nextAllowedAtMs) {
      return {
        allowed: true,
        lastTriggeredAt,
        nextAllowedAt: new Date(nextAllowedAtMs).toISOString()
      };
    }

    return {
      allowed: false,
      lastTriggeredAt,
      nextAllowedAt: new Date(nextAllowedAtMs).toISOString()
    };
  }
}
