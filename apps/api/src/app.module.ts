import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getEnv } from './config/env';
import { AuthXController } from './modules/auth-x/auth-x.controller';
import { AuthXService } from './modules/auth-x/auth-x.service';
import { JobsController } from './modules/jobs/jobs.controller';
import { JobsService } from './modules/jobs/jobs.service';
import { SyncService } from './modules/sync/sync.service';
import { XApiService } from './modules/sync/x-api.service';
import { DigestService } from './modules/digest/digest.service';
import { MobileController } from './modules/mobile/mobile.controller';
import { MobileService } from './modules/mobile/mobile.service';
import { AdminController } from './modules/admin/admin.controller';
import { AdminService } from './modules/admin/admin.service';
import { AiService } from './modules/ai/ai.service';
import { BudgetService } from './modules/ai/budget.service';
import { ProviderConfigService } from './modules/ai/provider-config.service';
import { HealthController } from './modules/health/health.controller';
import { BookmarkItem, BookmarkItemSchema } from './database/schemas/bookmark-item.schema';
import { ItemSummary, ItemSummarySchema } from './database/schemas/item-summary.schema';
import { DigestReport, DigestReportSchema } from './database/schemas/digest-report.schema';
import { SyncState, SyncStateSchema } from './database/schemas/sync-state.schema';
import { ProviderConfig, ProviderConfigSchema } from './database/schemas/provider-config.schema';
import { PatToken, PatTokenSchema } from './database/schemas/pat-token.schema';
import { JobRun, JobRunSchema } from './database/schemas/job-run.schema';
import { AdminUser, AdminUserSchema } from './database/schemas/admin-user.schema';
import { InternalJobGuard } from './common/guards/internal-job.guard';
import { AdminGuard } from './common/guards/admin.guard';
import { PatGuard } from './common/guards/pat.guard';

@Module({
  imports: [
    MongooseModule.forRoot(getEnv().MONGODB_URI, {
      lazyConnection: true
    }),
    MongooseModule.forFeature([
      { name: BookmarkItem.name, schema: BookmarkItemSchema },
      { name: ItemSummary.name, schema: ItemSummarySchema },
      { name: DigestReport.name, schema: DigestReportSchema },
      { name: SyncState.name, schema: SyncStateSchema },
      { name: ProviderConfig.name, schema: ProviderConfigSchema },
      { name: PatToken.name, schema: PatTokenSchema },
      { name: JobRun.name, schema: JobRunSchema },
      { name: AdminUser.name, schema: AdminUserSchema }
    ])
  ],
  controllers: [
    AuthXController,
    JobsController,
    MobileController,
    AdminController,
    HealthController
  ],
  providers: [
    AuthXService,
    JobsService,
    SyncService,
    XApiService,
    DigestService,
    MobileService,
    AdminService,
    AiService,
    BudgetService,
    ProviderConfigService,
    InternalJobGuard,
    AdminGuard,
    PatGuard
  ]
})
export class AppModule {}
