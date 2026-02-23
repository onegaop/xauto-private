import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes, createHash } from 'crypto';
import { Model } from 'mongoose';
import { PatToken, PatTokenDocument } from '../../database/schemas/pat-token.schema';
import { ProviderConfigService } from '../ai/provider-config.service';
import { UpsertProviderDto } from '../ai/dto/upsert-provider.dto';
import { UpdatePromptsDto } from '../ai/dto/update-prompts.dto';
import { PromptConfigService } from '../ai/prompt-config.service';
import { UpdateSyncSettingsDto } from './dto/update-sync-settings.dto';
import { JobsService } from '../jobs/jobs.service';
import { SyncSettingsService } from '../sync/sync-settings.service';
import { CreatePatDto } from './dto/create-pat.dto';
import { AdminUser, AdminUserDocument } from '../../database/schemas/admin-user.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(PatToken.name)
    private readonly patTokenModel: Model<PatTokenDocument>,
    @InjectModel(AdminUser.name)
    private readonly adminUserModel: Model<AdminUserDocument>,
    private readonly providerConfigService: ProviderConfigService,
    private readonly promptConfigService: PromptConfigService,
    private readonly jobsService: JobsService,
    private readonly syncSettingsService: SyncSettingsService
  ) {}

  async markAdminLogin(email: string): Promise<void> {
    await this.adminUserModel.updateOne(
      { email },
      {
        $set: {
          email,
          role: 'owner',
          lastLoginAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  async getProviders(): Promise<Array<Record<string, unknown>>> {
    return this.providerConfigService.listPublicConfigs();
  }

  async upsertProvider(dto: UpsertProviderDto): Promise<Record<string, unknown>> {
    return this.providerConfigService.upsertProvider(dto);
  }

  async getPrompts(): Promise<Record<string, unknown>> {
    return this.promptConfigService.listPrompts();
  }

  async updatePrompts(dto: UpdatePromptsDto): Promise<Record<string, unknown>> {
    return this.promptConfigService.updatePrompts(dto);
  }

  async getSyncSettings(): Promise<Record<string, unknown>> {
    return this.syncSettingsService.getSettings();
  }

  async updateSyncSettings(dto: UpdateSyncSettingsDto): Promise<Record<string, unknown>> {
    return this.syncSettingsService.updateSettings(dto.syncIntervalHours);
  }

  async getJobs(limit?: string): Promise<Array<Record<string, unknown>>> {
    const parsed = Number(limit ?? 30);
    const runs = await this.jobsService.listRuns(parsed);
    return runs.map((run) => run.toObject() as unknown as Record<string, unknown>);
  }

  async runJob(name: string, payload?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (name === 'sync') {
      const force = typeof payload?.force === 'boolean' ? payload.force : true;
      return this.jobsService.triggerSync({ force, source: 'admin' });
    }

    if (name === 'digest_daily') {
      return this.jobsService.triggerDailyDigest();
    }

    if (name === 'digest_weekly') {
      return this.jobsService.triggerWeeklyDigest();
    }

    if (name === 'resummarize') {
      return this.jobsService.triggerResummarize(payload);
    }

    throw new Error(`Unsupported job: ${name}`);
  }

  async createPat(dto: CreatePatDto): Promise<Record<string, unknown>> {
    const rawToken = `pat_${randomBytes(24).toString('base64url')}`;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const last4 = rawToken.slice(-4);

    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const saved = await this.patTokenModel.create({
      name: dto.name,
      tokenHash,
      last4,
      status: 'ACTIVE',
      expiresAt
    });
    const createdAt = saved.get('createdAt') as Date | undefined;

    return {
      id: saved.id,
      name: saved.name,
      token: rawToken,
      last4,
      expiresAt: expiresAt?.toISOString() ?? null,
      createdAt: createdAt?.toISOString() ?? null
    };
  }

  async revokePat(id: string): Promise<{ revoked: boolean }> {
    await this.patTokenModel.updateOne(
      { _id: id },
      {
        $set: {
          status: 'REVOKED',
          revokedAt: new Date()
        }
      }
    );

    return { revoked: true };
  }
}
