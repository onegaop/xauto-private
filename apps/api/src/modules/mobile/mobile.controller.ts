import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PatGuard } from '../../common/guards/pat.guard';
import { MobileService } from './mobile.service';

@Controller('/v1/mobile')
@UseGuards(PatGuard)
export class MobileController {
  constructor(private readonly mobileService: MobileService) {}

  @Get('/digest/today')
  async getTodayDigest(): Promise<Record<string, unknown> | null> {
    return this.mobileService.getTodayDigest();
  }

  @Get('/digest/week')
  async getWeekDigest(): Promise<Record<string, unknown> | null> {
    return this.mobileService.getWeekDigest();
  }

  @Get('/items')
  async listItems(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string
  ): Promise<Record<string, unknown>> {
    return this.mobileService.listItems(limit, cursor);
  }

  @Get('/items/:tweetId')
  async getItem(@Param('tweetId') tweetId: string): Promise<Record<string, unknown>> {
    return this.mobileService.getItem(tweetId);
  }
}
