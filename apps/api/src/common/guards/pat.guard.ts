import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { PatToken, PatTokenDocument } from '../../database/schemas/pat-token.schema';

@Injectable()
export class PatGuard implements CanActivate {
  constructor(
    @InjectModel(PatToken.name)
    private readonly patTokenModel: Model<PatTokenDocument>
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : '';

    if (!token) {
      throw new UnauthorizedException('Missing PAT token');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const found = await this.patTokenModel.findOne({
      tokenHash,
      status: 'ACTIVE',
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    });

    if (!found) {
      throw new UnauthorizedException('Invalid or expired PAT token');
    }

    request.patTokenId = found.id;
    return true;
  }
}
