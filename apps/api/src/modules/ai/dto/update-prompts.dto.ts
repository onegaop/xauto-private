import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePromptsDto {
  @IsOptional()
  @IsString()
  @MinLength(20)
  miniSummarySystem?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  digestSystem?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  miniMarkdownSystem?: string;
}
