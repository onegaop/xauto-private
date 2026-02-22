import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getEnv } from '../../config/env';
import { SyncState, SyncStateDocument } from '../../database/schemas/sync-state.schema';
import { dayKey, nowInTimezone } from '../../common/utils/date';

@Injectable()
export class BudgetService {
  constructor(
    @InjectModel(SyncState.name)
    private readonly syncStateModel: Model<SyncStateDocument>
  ) {}

  private monthStateKey(): string {
    const env = getEnv();
    const now = nowInTimezone(env.TIMEZONE);
    return `budget:${now.format('YYYY-MM')}`;
  }

  async getUsageCny(): Promise<number> {
    const state = await this.syncStateModel.findOne({ key: this.monthStateKey() });
    const value = state?.value?.usageCny;

    if (typeof value === 'number') {
      return value;
    }

    return 0;
  }

  async recordUsageCny(amountCny: number): Promise<void> {
    const key = this.monthStateKey();
    const current = await this.getUsageCny();

    await this.syncStateModel.updateOne(
      { key },
      {
        $set: {
          value: {
            usageCny: Number((current + amountCny).toFixed(6)),
            updatedAt: new Date().toISOString(),
            date: dayKey(nowInTimezone(getEnv().TIMEZONE))
          }
        }
      },
      { upsert: true }
    );
  }

  async getUsageRatio(): Promise<number> {
    const env = getEnv();
    const usage = await this.getUsageCny();

    if (env.BUDGET_CNY_MONTHLY <= 0) {
      return 1;
    }

    return usage / env.BUDGET_CNY_MONTHLY;
  }
}
