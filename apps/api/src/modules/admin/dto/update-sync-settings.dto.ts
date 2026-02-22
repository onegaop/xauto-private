import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateSyncSettingsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  syncIntervalHours!: number;
}
