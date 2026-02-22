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
    const authHeader = request.headers.authorization;
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : '';

    if (token !== env.INTERNAL_JOB_TOKEN) {
      throw new UnauthorizedException('Invalid internal job token');
    }

    return true;
  }
}
