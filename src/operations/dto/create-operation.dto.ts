import { Type } from 'class-transformer';
import { OperationPaymentStatus } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  Min,
  ValidateNested,
  IsEnum,
} from 'class-validator';

export class OperationSplitDto {
  @IsInt()
  targetCurrencyId: number;

  @IsOptional()
  @IsInt()
  accountId?: number;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsNumber()
  manualRateToCOP?: number;

  @IsOptional()
  @IsNumber()
  valueCOP?: number;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOperationDto {
  @IsString()
  code: string;

  @IsInt()
  clientId: number;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsInt()
  typeId: number;

  @IsInt()
  statusId: number;

  @IsInt()
  sourceCurrencyId: number;

  @IsOptional()
  @IsInt()
  sourceAccountId?: number;

  @IsInt()
  targetCurrencyId: number;

  @IsOptional()
  @IsInt()
  targetAccountId?: number;

  @IsNumber()
  @Min(0.0001)
  amountSource: number;

  @IsOptional()
  @IsBoolean()
  requiresCashDelivery?: boolean;

  @IsDateString()
  operationDate: string;

  @IsOptional()
  @IsEnum(OperationPaymentStatus)
  paymentStatus?: OperationPaymentStatus;

  @IsOptional()
  @IsNumber()
  amountPaid?: number;

  @IsOptional()
  @IsNumber()
  amountTargetEstimated?: number;

  @IsOptional()
  @IsString()
  paymentMode?: string;

  @IsInt()
  createdById: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperationSplitDto)
  splits?: OperationSplitDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperationPaymentDto)
  payments?: OperationPaymentDto[];

  @IsOptional()
  @IsNumber()
  manualRateToCOP?: number;

  @IsOptional()
  @IsNumber()
  copToTargetRate?: number;
}

export class OperationPaymentDto {
  @IsInt()
  paymentMethodId: number;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
