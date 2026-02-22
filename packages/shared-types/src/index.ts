export type ProviderName = 'deepseek' | 'qwen' | 'gemini';

export type SummaryV1 = {
  tweetId: string;
  oneLinerZh: string;
  oneLinerEn: string;
  bulletsZh: string[];
  bulletsEn: string[];
  tagsZh: string[];
  tagsEn: string[];
  actions: string[];
  qualityScore: number;
  provider: ProviderName;
  model: string;
  summarizedAt: string;
};

export type DigestItem = {
  tweetId: string;
  reason: string;
  nextStep: string;
};

export type DigestV1 = {
  period: 'daily' | 'weekly';
  periodKey: string;
  topThemes: string[];
  topItems: DigestItem[];
  risks: string[];
  tomorrowActions: string[];
  generatedAt: string;
};

export type ProviderConfigV1 = {
  id: string;
  provider: ProviderName;
  baseUrl: string;
  miniModel: string;
  digestModel: string;
  enabled: boolean;
  priority: number;
  monthlyBudgetCny: number;
};
