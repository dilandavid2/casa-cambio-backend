import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class TransferAccountMovementDto {
  @IsInt()
  fromAccountId!: number;

  @IsInt()
  toAccountId!: number;

  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsInt()
  createdById!: number;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
