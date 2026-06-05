import { Test, TestingModule } from '@nestjs/testing';
import { AccountMovementsController } from './account-movements.controller';

describe('AccountMovementsController', () => {
  let controller: AccountMovementsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountMovementsController],
    }).compile();

    controller = module.get<AccountMovementsController>(
      AccountMovementsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
