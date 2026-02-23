import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LookupVocabularyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  term!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  context?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  sourceLangHint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  targetLang?: string;
}
