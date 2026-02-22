import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getEnv } from '../../config/env';
import { ProviderConfig, ProviderConfigDocument } from '../../database/schemas/provider-config.schema';
import { decryptText, encryptText } from '../../common/utils/crypto';
import { UpsertProviderDto } from './dto/upsert-provider.dto';

@Injectable()
export class ProviderConfigService {
  constructor(
    @InjectModel(ProviderConfig.name)
    private readonly providerConfigModel: Model<ProviderConfigDocument>
  ) {}

  async listPublicConfigs(): Promise<Array<Record<string, unknown>>> {
    const configs = await this.providerConfigModel.find().sort({ priority: 1 });

    return configs.map((item) => ({
      id: item.id,
      provider: item.provider,
      baseUrl: item.baseUrl,
      miniModel: item.miniModel,
      digestModel: item.digestModel,
      enabled: item.enabled,
      priority: item.priority,
      monthlyBudgetCny: item.monthlyBudgetCny,
      hasApiKey: Boolean(item.encryptedApiKey)
    }));
  }

  async upsertProvider(dto: UpsertProviderDto): Promise<Record<string, unknown>> {
    const env = getEnv();
    const encrypted = encryptText(dto.apiKey, env.ENCRYPTION_MASTER_KEY);

    const doc = await this.providerConfigModel.findOneAndUpdate(
      { provider: dto.provider },
      {
        $set: {
          provider: dto.provider,
          baseUrl: dto.baseUrl,
          encryptedApiKey: encrypted.ciphertext,
          keyIv: encrypted.iv,
          keyTag: encrypted.tag,
          miniModel: dto.miniModel,
          digestModel: dto.digestModel,
          enabled: dto.enabled,
          priority: dto.priority,
          monthlyBudgetCny: dto.monthlyBudgetCny ?? 100
        }
      },
      { new: true, upsert: true }
    );

    return {
      id: doc.id,
      provider: doc.provider,
      enabled: doc.enabled,
      priority: doc.priority,
      miniModel: doc.miniModel,
      digestModel: doc.digestModel,
      monthlyBudgetCny: doc.monthlyBudgetCny
    };
  }

  async getActiveProviderCredentials(): Promise<Array<{
    provider: 'deepseek' | 'qwen';
    baseUrl: string;
    miniModel: string;
    digestModel: string;
    apiKey: string;
    priority: number;
  }>> {
    const env = getEnv();
    const configs = await this.providerConfigModel.find({ enabled: true }).sort({ priority: 1 });

    return configs.map((item) => ({
      provider: item.provider,
      baseUrl: item.baseUrl,
      miniModel: item.miniModel,
      digestModel: item.digestModel,
      apiKey: decryptText(
        {
          ciphertext: item.encryptedApiKey,
          iv: item.keyIv,
          tag: item.keyTag
        },
        env.ENCRYPTION_MASTER_KEY
      ),
      priority: item.priority
    }));
  }
}
