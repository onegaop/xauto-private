import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  root(): { ok: boolean; service: string; endpoints: string[] } {
    return {
      ok: true,
      service: 'xauto-api',
      endpoints: ['/healthz', '/v1/auth/x/start']
    };
  }

  @Get('/healthz')
  check(): { ok: boolean; timestamp: string } {
    return {
      ok: true,
      timestamp: new Date().toISOString()
    };
  }
}
