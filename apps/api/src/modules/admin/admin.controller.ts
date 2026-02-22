import { Body, Controller, Delete, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AdminService } from './admin.service';
import { UpsertProviderDto } from '../ai/dto/upsert-provider.dto';
import { CreatePatDto } from './dto/create-pat.dto';
import { UpdatePromptsDto } from '../ai/dto/update-prompts.dto';
import { UpdateSyncSettingsDto } from './dto/update-sync-settings.dto';

@Controller('/v1/admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('/providers')
  async getProviders(@Headers('x-admin-email') adminEmail: string): Promise<Array<Record<string, unknown>>> {
    await this.adminService.markAdminLogin(String(adminEmail || '').toLowerCase());
    return this.adminService.getProviders();
  }

  @Post('/providers')
  async upsertProvider(
    @Headers('x-admin-email') adminEmail: string,
    @Body() dto: UpsertProviderDto
  ): Promise<Record<string, unknown>> {
    await this.adminService.markAdminLogin(String(adminEmail || '').toLowerCase());
    return this.adminService.upsertProvider(dto);
  }

  @Get('/prompts')
  async getPrompts(@Headers('x-admin-email') adminEmail: string): Promise<Record<string, unknown>> {
    await this.adminService.markAdminLogin(String(adminEmail || '').toLowerCase());
    return this.adminService.getPrompts();
  }

  @Post('/prompts')
  async updatePrompts(
    @Headers('x-admin-email') adminEmail: string,
    @Body() dto: UpdatePromptsDto
  ): Promise<Record<string, unknown>> {
    await this.adminService.markAdminLogin(String(adminEmail || '').toLowerCase());
    return this.adminService.updatePrompts(dto);
  }

  @Get('/sync-settings')
  async getSyncSettings(@Headers('x-admin-email') adminEmail: string): Promise<Record<string, unknown>> {
    await this.adminService.markAdminLogin(String(adminEmail || '').toLowerCase());
    return this.adminService.getSyncSettings();
  }

  @Post('/sync-settings')
  async updateSyncSettings(
    @Headers('x-admin-email') adminEmail: string,
    @Body() dto: UpdateSyncSettingsDto
  ): Promise<Record<string, unknown>> {
    await this.adminService.markAdminLogin(String(adminEmail || '').toLowerCase());
    return this.adminService.updateSyncSettings(dto);
  }

  @Get('/jobs')
  async listJobs(
    @Headers('x-admin-email') adminEmail: string,
    @Query('limit') limit?: string
  ): Promise<Array<Record<string, unknown>>> {
    await this.adminService.markAdminLogin(String(adminEmail || '').toLowerCase());
    return this.adminService.getJobs(limit);
  }

  @Post('/jobs/:name/run')
  async runJob(
    @Headers('x-admin-email') adminEmail: string,
    @Param('name') name: string
  ): Promise<Record<string, unknown>> {
    await this.adminService.markAdminLogin(String(adminEmail || '').toLowerCase());
    return this.adminService.runJob(name);
  }

  @Post('/pat')
  async createPat(
    @Headers('x-admin-email') adminEmail: string,
    @Body() dto: CreatePatDto
  ): Promise<Record<string, unknown>> {
    await this.adminService.markAdminLogin(String(adminEmail || '').toLowerCase());
    return this.adminService.createPat(dto);
  }

  @Delete('/pat/:id')
  async revokePat(
    @Headers('x-admin-email') adminEmail: string,
    @Param('id') id: string
  ): Promise<{ revoked: boolean }> {
    await this.adminService.markAdminLogin(String(adminEmail || '').toLowerCase());
    return this.adminService.revokePat(id);
  }
}
