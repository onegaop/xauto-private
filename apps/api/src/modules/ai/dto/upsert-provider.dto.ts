import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertProviderDto {
  @IsIn(['deepseek', 'qwen', 'gemini'])
  provider!: 'deepseek' | 'qwen' | 'gemini';

  @IsString()
  @IsNotEmpty()
  baseUrl!: string;

  @IsString()
  @IsNotEmpty()
  apiKey!: string;

  @IsString()
  @IsNotEmpty()
  miniModel!: string;

  @IsString()
  @IsNotEmpty()
  digestModel!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(1)
  @Max(1000)
  priority!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  monthlyBudgetCny?: number;
}
