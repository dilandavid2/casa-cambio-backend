import { PartialType } from '@nestjs/mapped-types';
import { CreateMarketRateDto } from './create-market-rate.dto';

export class UpdateMarketRateDto extends PartialType(CreateMarketRateDto) {}
