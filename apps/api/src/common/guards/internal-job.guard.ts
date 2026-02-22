import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { getEnv } from '../../config/env';

@Injectable()
export class InternalJobGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const env = getEnv();
    if (!env.INTERNAL_JOB_TOKEN) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const customHeader = request.headers['x-internal-job-token'];
    const customToken = typeof customHeader === 'string' ? customHeader : '';
    const authHeader = request.headers.authorization;
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : '';

    const effectiveToken = customToken || token;

    if (effectiveToken !== env.INTERNAL_JOB_TOKEN) {
      throw new UnauthorizedException('Invalid internal job token');
    }

    return true;
  }
}
