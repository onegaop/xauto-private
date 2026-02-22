import { Controller, Get } from '@nestjs/common';

@Controller('/healthz')
export class HealthController {
  @Get()
  check(): { ok: boolean; timestamp: string } {
    return {
      ok: true,
      timestamp: new Date().toISOString()
    };
  }
}
