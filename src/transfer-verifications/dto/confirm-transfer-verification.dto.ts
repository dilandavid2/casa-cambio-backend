import { IsInt, IsOptional, IsString } from 'class-validator';

export class ConfirmTransferVerificationDto {
  @IsInt()
  verifiedById: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
