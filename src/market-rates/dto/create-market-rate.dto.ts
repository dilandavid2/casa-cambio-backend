import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMarketRateDto {
  @IsInt()
  currencyId: number;

  @IsNumber()
  @Min(0)
  rateToCOP: number;

  @IsOptional()
  @IsString()
  source?: string;
}
