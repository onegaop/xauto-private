import { Controller, Post, UseGuards } from '@nestjs/common';
import { InternalJobGuard } from '../../common/guards/internal-job.guard';
import { JobsService } from './jobs.service';

@Controller('/v1/internal/jobs')
@UseGuards(InternalJobGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post('/sync')
  async runSync(): Promise<Record<string, unknown>> {
    return this.jobsService.triggerSync({ force: false, source: 'internal' });
  }

  @Post('/digest/daily')
  async runDailyDigest(): Promise<Record<string, unknown>> {
    return this.jobsService.triggerDailyDigest();
  }

  @Post('/digest/weekly')
  async runWeeklyDigest(): Promise<Record<string, unknown>> {
    return this.jobsService.triggerWeeklyDigest();
  }
}
