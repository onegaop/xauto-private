import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { SyncState, SyncStateDocument } from '../../database/schemas/sync-state.schema';
import { getEnv } from '../../config/env';

type XTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

@Injectable()
export class AuthXService {
  private readonly logger = new Logger(AuthXService.name);

  constructor(
    @InjectModel(SyncState.name)
    private readonly syncStateModel: Model<SyncStateDocument>
  ) {}

  async startOAuth(): Promise<{ authorizeUrl: string; state: string }> {
    const env = getEnv();
    this.ensurePaidExternalApisEnabled('startOAuth', env);

    if (!env.X_CLIENT_ID || !env.X_REDIRECT_URI) {
      throw new UnauthorizedException('X OAuth env is not configured');
    }

    const state = randomBytes(16).toString('hex');
    const codeVerifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(codeVerifier).digest('base64url');

    await this.syncStateModel.updateOne(
      { key: `oauth:state:${state}` },
      {
        $set: {
          value: {
            codeVerifier,
            createdAt: new Date().toISOString()
          }
        }
      },
      { upsert: true }
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.X_CLIENT_ID,
      redirect_uri: env.X_REDIRECT_URI,
      scope: 'bookmark.read tweet.read users.read offline.access',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });

    return {
      authorizeUrl: `${env.X_OAUTH_AUTHORIZE_URL}?${params.toString()}`,
      state
    };
  }

  async handleCallback(code: string, state: string): Promise<{ connected: boolean }> {
    const env = getEnv();
    this.ensurePaidExternalApisEnabled('handleCallback', env);

    if (!env.X_CLIENT_ID || !env.X_REDIRECT_URI) {
      throw new UnauthorizedException('X OAuth env is not configured');
    }

    const stateRecord = await this.syncStateModel.findOne({ key: `oauth:state:${state}` });

    if (!stateRecord?.value?.codeVerifier || typeof stateRecord.value.codeVerifier !== 'string') {
      throw new UnauthorizedException('OAuth state invalid or expired');
    }

    const codeVerifier = stateRecord.value.codeVerifier;
    await this.syncStateModel.deleteOne({ key: `oauth:state:${state}` });

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.X_REDIRECT_URI,
      client_id: env.X_CLIENT_ID,
      code_verifier: codeVerifier
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    if (env.X_CLIENT_SECRET) {
      const basic = Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString('base64');
      headers.Authorization = `Basic ${basic}`;
    }

    const response = await axios.post<XTokenResponse>(env.X_OAUTH_TOKEN_URL, body.toString(), {
      headers,
      timeout: 15000
    });

    const userResponse = await axios.get<{ data: { id: string } }>(`${env.X_API_BASE_URL}/users/me`, {
      headers: {
        Authorization: `Bearer ${response.data.access_token}`
      },
      timeout: 15000
    });

    await this.syncStateModel.updateOne(
      { key: 'oauth:tokens' },
      {
        $set: {
          value: {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token ?? null,
            expiresAt: response.data.expires_in
              ? new Date(Date.now() + response.data.expires_in * 1000).toISOString()
              : null,
            userId: userResponse.data.data.id,
            updatedAt: new Date().toISOString()
          }
        }
      },
      { upsert: true }
    );

    return { connected: true };
  }

  async refreshAccessToken(currentRefreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }> {
    const env = getEnv();
    this.ensurePaidExternalApisEnabled('refreshAccessToken', env);

    if (!env.X_CLIENT_ID) {
      throw new UnauthorizedException('X OAuth env is not configured');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
      client_id: env.X_CLIENT_ID
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    if (env.X_CLIENT_SECRET) {
      const basic = Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString('base64');
      headers.Authorization = `Basic ${basic}`;
    }

    const response = await axios.post<XTokenResponse>(env.X_OAUTH_TOKEN_URL, body.toString(), {
      headers,
      timeout: 15000
    });

    const next = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: response.data.expires_in
        ? new Date(Date.now() + response.data.expires_in * 1000).toISOString()
        : undefined
    };

    return next;
  }

  private ensurePaidExternalApisEnabled(action: string, env: ReturnType<typeof getEnv>): void {
    if (!env.BLOCK_PAID_EXTERNAL_APIS) {
      return;
    }

    this.logger.warn(`Blocked AuthXService.${action} because BLOCK_PAID_EXTERNAL_APIS=true`);
    throw new ServiceUnavailableException(
      'X OAuth endpoints are disabled in test mode (BLOCK_PAID_EXTERNAL_APIS=true)'
    );
  }
}
