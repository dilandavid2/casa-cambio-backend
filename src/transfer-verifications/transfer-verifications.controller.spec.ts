import { Test, TestingModule } from '@nestjs/testing';
import { TransferVerificationsController } from './transfer-verifications.controller';

describe('TransferVerificationsController', () => {
  let controller: TransferVerificationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransferVerificationsController],
    }).compile();

    controller = module.get<TransferVerificationsController>(
      TransferVerificationsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
