import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes, createHash } from 'crypto';
import { Model } from 'mongoose';
import { PatToken, PatTokenDocument } from '../../database/schemas/pat-token.schema';
import { ProviderConfigService } from '../ai/provider-config.service';
import { UpsertProviderDto } from '../ai/dto/upsert-provider.dto';
import { JobsService } from '../jobs/jobs.service';
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
    private readonly jobsService: JobsService
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

  async getJobs(limit?: string): Promise<Array<Record<string, unknown>>> {
    const parsed = Number(limit ?? 30);
    const runs = await this.jobsService.listRuns(parsed);
    return runs.map((run) => run.toObject() as unknown as Record<string, unknown>);
  }

  async runJob(name: string): Promise<Record<string, unknown>> {
    if (name === 'sync') {
      return this.jobsService.triggerSync();
    }

    if (name === 'digest_daily') {
      return this.jobsService.triggerDailyDigest();
    }

    if (name === 'digest_weekly') {
      return this.jobsService.triggerWeeklyDigest();
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
