import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { getEnv } from '../../config/env';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const env = getEnv();
    const request = context.switchToHttp().getRequest();

    const adminEmailHeader = request.headers['x-admin-email'];
    const adminEmail = typeof adminEmailHeader === 'string' ? adminEmailHeader.toLowerCase() : '';

    if (!adminEmail || !env.adminAllowedEmails.includes(adminEmail)) {
      throw new UnauthorizedException('Admin email not allowed');
    }

    if (env.ADMIN_INTERNAL_TOKEN) {
      const tokenHeader = request.headers['x-admin-internal-token'];
      const token = typeof tokenHeader === 'string' ? tokenHeader : '';
      if (token !== env.ADMIN_INTERNAL_TOKEN) {
        throw new UnauthorizedException('Invalid admin internal token');
      }
    }

    request.adminEmail = adminEmail;
    return true;
  }
}
