import { Controller, Get, Query } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { AuthXService } from './auth-x.service';

class XOAuthCallbackQuery {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;
}

@Controller('/v1/auth/x')
export class AuthXController {
  constructor(private readonly authXService: AuthXService) {}

  @Get('/start')
  async startOAuth(): Promise<{ authorizeUrl: string; state: string }> {
    return this.authXService.startOAuth();
  }

  @Get('/callback')
  async callback(@Query() query: XOAuthCallbackQuery): Promise<{ connected: boolean }> {
    return this.authXService.handleCallback(query.code, query.state);
  }
}
