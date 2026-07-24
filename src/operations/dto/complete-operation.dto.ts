import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class CompleteOperationDto {
  @IsNumber()
  @Min(0.0001)
  amountTargetFinal: number;

  @IsOptional()
  @IsInt()
  confirmedByUserId?: number;

  @IsOptional()
  @IsInt()
  accountId?: number;

}
