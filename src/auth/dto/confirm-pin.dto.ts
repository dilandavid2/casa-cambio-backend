import { IsString } from 'class-validator';

export class ConfirmPinDto {
  @IsString()
  pin!: string;
}
