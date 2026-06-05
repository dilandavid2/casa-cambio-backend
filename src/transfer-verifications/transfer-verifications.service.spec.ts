import { Test, TestingModule } from '@nestjs/testing';
import { TransferVerificationsService } from './transfer-verifications.service';

describe('TransferVerificationsService', () => {
  let service: TransferVerificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransferVerificationsService],
    }).compile();

    service = module.get<TransferVerificationsService>(
      TransferVerificationsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
