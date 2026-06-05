import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class AddOperationPaymentDto {
  @IsInt()
  accountId: number;

  @IsInt()
  currencyId: number;

  @IsNumber()
  @Min(0.0001)
  amount: number;

  @IsString()
  paymentDate: string;

  @IsOptional()
  @IsNumber()
  rateToCOP?: number;

  @IsOptional()
  @IsString()
  rateSource?: string;

  @IsOptional()
  @IsBoolean()
  requiresVerification?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
