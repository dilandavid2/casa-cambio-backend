import { IsOptional, IsString } from 'class-validator';

export class ConfirmTransferVerificationDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
