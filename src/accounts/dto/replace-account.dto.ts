import { IsInt, IsOptional, IsString } from 'class-validator';

export class ReplaceAccountDto {
  @IsString()
  name!: string;

  @IsString()
  country!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  identifier?: string;

  @IsInt()
  currencyId!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  confirmationReason?: string;

  @IsInt()
  confirmedByUserId!: number;

  @IsString()
  pin!: string;
}
