import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAccountMovementDto {
  @IsInt()
  accountId!: number;

  @IsOptional()
  @IsInt()
  operationId?: number;

  @IsString()
  type!: string; // IN, OUT, ADJUSTMENT, TRANSFER

  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsOptional()
  @IsNumber()
  valueCOP?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
