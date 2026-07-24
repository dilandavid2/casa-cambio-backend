import { BadRequestException } from '@nestjs/common';
import { OperationsService } from './operations.service';

describe('OperationsService', () => {
  const prisma = {
    operation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    operationStatus: {
      findFirst: jest.fn(),
    },
    transferVerification: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  const service = new OperationsService(prisma as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('impide completar una operación con entrada VES pendiente de verificar', async () => {
    prisma.operation.findUnique.mockResolvedValue({
      id: 31,
      completedAt: null,
      paymentMode: 'IMMEDIATE',
      paymentStatus: 'PAID',
      status: { name: 'En verificación' },
      sourceCurrency: { code: 'VES' },
      targetCurrency: { code: 'COP' },
    });
    prisma.operationStatus.findFirst.mockResolvedValue({
      id: 4,
      name: 'Completada',
    });
    prisma.transferVerification.findFirst.mockResolvedValue({
      id: 12,
      status: 'PENDING',
    });

    await expect(
      service.complete(31, {
        amountTargetFinal: 100,
        confirmedByUserId: 7,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.operation.update).not.toHaveBeenCalled();
  });
});
