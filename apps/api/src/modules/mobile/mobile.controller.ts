import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PatGuard } from '../../common/guards/pat.guard';
import { MobileService } from './mobile.service';
import { LookupVocabularyDto } from './dto/lookup-vocabulary.dto';

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

  @Get('/digest/history')
  async getDigestHistory(
    @Query('period') period?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string
  ): Promise<Record<string, unknown>> {
    return this.mobileService.getDigestHistory(period, limit, cursor);
  }

  @Get('/summary/stats')
  async getSummaryStats(@Query('range') range?: string): Promise<Record<string, unknown>> {
    return this.mobileService.getSummaryStats(range);
  }

  @Get('/items')
  async listItems(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('tag') tag?: string,
    @Query('claimLabel') claimLabel?: string,
    @Query('qualityMin') qualityMin?: string
  ): Promise<Record<string, unknown>> {
    return this.mobileService.listItems(limit, cursor, tag, claimLabel, qualityMin);
  }

  @Get('/items/:tweetId')
  async getItem(@Param('tweetId') tweetId: string): Promise<Record<string, unknown>> {
    return this.mobileService.getItem(tweetId);
  }

  @Post('/vocabulary/lookup')
  async lookupVocabulary(@Body() dto: LookupVocabularyDto): Promise<Record<string, unknown>> {
    return this.mobileService.lookupVocabulary(dto);
  }
}
