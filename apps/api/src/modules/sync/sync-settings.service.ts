import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SyncState, SyncStateDocument } from '../../database/schemas/sync-state.schema';

const SYNC_SETTINGS_KEY = 'config:sync_settings';
const SYNC_LAST_RUN_KEY = 'sync:last_run_at';
const DEFAULT_SYNC_INTERVAL_HOURS = 24;
const MIN_SYNC_INTERVAL_HOURS = 1;
const MAX_SYNC_INTERVAL_HOURS = 168;

export type SyncSettingsSnapshot = {
  syncIntervalHours: number;
  updatedAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

@Injectable()
export class SyncSettingsService {
  constructor(
    @InjectModel(SyncState.name)
    private readonly syncStateModel: Model<SyncStateDocument>
  ) {}

  async getSettings(): Promise<SyncSettingsSnapshot> {
    const [settingsDoc, runDoc] = await Promise.all([
      this.syncStateModel.findOne({ key: SYNC_SETTINGS_KEY }),
      this.syncStateModel.findOne({ key: SYNC_LAST_RUN_KEY })
    ]);

    const syncIntervalHours = this.normalizeInterval(settingsDoc?.value?.syncIntervalHours);
    const updatedAt = this.parseIsoString(settingsDoc?.value?.updatedAt);
    const lastRunAt = this.parseIsoString(runDoc?.value?.at);
    const nextRunAt = this.computeNextRunAt(lastRunAt, syncIntervalHours);

    return {
      syncIntervalHours,
      updatedAt,
      lastRunAt,
      nextRunAt
    };
  }

  async updateSettings(syncIntervalHours: number): Promise<SyncSettingsSnapshot> {
    const normalized = this.normalizeInterval(syncIntervalHours);
    const nowIso = new Date().toISOString();

    await this.syncStateModel.updateOne(
      { key: SYNC_SETTINGS_KEY },
      {
        $set: {
          value: {
            syncIntervalHours: normalized,
            updatedAt: nowIso
          }
        }
      },
      { upsert: true }
    );

    return this.getSettings();
  }

  async shouldRunNow(now = new Date()): Promise<{
    shouldRun: boolean;
    reason: 'first_run' | 'interval_reached' | 'interval_not_reached';
    settings: SyncSettingsSnapshot;
  }> {
    const settings = await this.getSettings();

    if (!settings.lastRunAt) {
      return {
        shouldRun: true,
        reason: 'first_run',
        settings
      };
    }

    const nextRunAtMs = settings.nextRunAt ? new Date(settings.nextRunAt).getTime() : NaN;

    if (!Number.isFinite(nextRunAtMs) || now.getTime() >= nextRunAtMs) {
      return {
        shouldRun: true,
        reason: 'interval_reached',
        settings
      };
    }

    return {
      shouldRun: false,
      reason: 'interval_not_reached',
      settings
    };
  }

  async markSyncRun(ranAt = new Date()): Promise<void> {
    const nowIso = ranAt.toISOString();

    await this.syncStateModel.updateOne(
      { key: SYNC_LAST_RUN_KEY },
      {
        $set: {
          value: {
            at: nowIso,
            updatedAt: nowIso
          }
        }
      },
      { upsert: true }
    );
  }

  private normalizeInterval(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      return DEFAULT_SYNC_INTERVAL_HOURS;
    }

    if (parsed < MIN_SYNC_INTERVAL_HOURS) {
      return MIN_SYNC_INTERVAL_HOURS;
    }

    if (parsed > MAX_SYNC_INTERVAL_HOURS) {
      return MAX_SYNC_INTERVAL_HOURS;
    }

    return parsed;
  }

  private parseIsoString(value: unknown): string | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  }

  private computeNextRunAt(lastRunAt: string | null, syncIntervalHours: number): string | null {
    if (!lastRunAt) {
      return null;
    }

    const lastMs = new Date(lastRunAt).getTime();
    if (!Number.isFinite(lastMs)) {
      return null;
    }

    return new Date(lastMs + syncIntervalHours * 60 * 60 * 1000).toISOString();
  }
}
