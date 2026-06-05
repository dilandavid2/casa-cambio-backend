import { Test, TestingModule } from '@nestjs/testing';
import { MarketRatesService } from './market-rates.service';

describe('MarketRatesService', () => {
  let service: MarketRatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketRatesService],
    }).compile();

    service = module.get<MarketRatesService>(MarketRatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
