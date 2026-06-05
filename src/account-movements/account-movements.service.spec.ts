import { Test, TestingModule } from '@nestjs/testing';
import { AccountMovementsService } from './account-movements.service';

describe('AccountMovementsService', () => {
  let service: AccountMovementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountMovementsService],
    }).compile();

    service = module.get<AccountMovementsService>(AccountMovementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
