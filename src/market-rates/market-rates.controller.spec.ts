import { Test, TestingModule } from '@nestjs/testing';
import { MarketRatesController } from './market-rates.controller';

describe('MarketRatesController', () => {
  let controller: MarketRatesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketRatesController],
    }).compile();

    controller = module.get<MarketRatesController>(MarketRatesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
