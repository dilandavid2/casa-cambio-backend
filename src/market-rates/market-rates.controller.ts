import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { MarketRatesService } from './market-rates.service';
import { CreateMarketRateDto } from './dto/create-market-rate.dto';
import { UpdateMarketRateDto } from './dto/update-market-rate.dto';

@Controller('market-rates')
export class MarketRatesController {
  constructor(private readonly marketRatesService: MarketRatesService) {}

  @Post()
  create(@Body() createMarketRateDto: CreateMarketRateDto) {
    return this.marketRatesService.create(createMarketRateDto);
  }

  @Get()
  findAll() {
    return this.marketRatesService.findAll();
  }

  @Get('latest/currency/:currencyId')
  findLatestByCurrency(@Param('currencyId', ParseIntPipe) currencyId: number) {
    return this.marketRatesService.findLatestByCurrency(currencyId);
  }

  @Get('effective/currency/:currencyId')
  getEffectiveRate(@Param('currencyId', ParseIntPipe) currencyId: number) {
    return this.marketRatesService.getEffectiveRate(currencyId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.marketRatesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMarketRateDto: UpdateMarketRateDto,
  ) {
    return this.marketRatesService.update(id, updateMarketRateDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.marketRatesService.remove(id);
  }
}
