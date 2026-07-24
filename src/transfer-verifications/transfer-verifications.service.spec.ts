import { BadRequestException } from '@nestjs/common';
import { TransferVerificationsService } from './transfer-verifications.service';

describe('TransferVerificationsService', () => {
  const transactionClient = {
    transferVerification: {
      update: jest.fn(),
    },
    operationPayment: {
      updateMany: jest.fn(),
    },
    operation: {
      update: jest.fn(),
    },
  };
  const prisma = {
    transferVerification: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    operationStatus: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (client: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    ),
  };
  const auditLogs = {
    createLog: jest.fn(),
  };
  const service = new TransferVerificationsService(
    prisma as never,
    auditLogs as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('confirma una entrada VES con el usuario autenticado', async () => {
    prisma.transferVerification.findUnique.mockResolvedValue({
      id: 9,
      status: 'PENDING',
      operationId: 21,
      operation: {
        code: 'OP-TEST',
        sourceCurrency: { code: 'VES' },
      },
    });
    prisma.operationStatus.findFirst.mockResolvedValue({ id: 4 });
    transactionClient.transferVerification.update.mockResolvedValue({
      id: 9,
      status: 'CONFIRMED',
    });

    await service.confirm(9, { notes: 'Confirmada' }, 7);

    expect(transactionClient.transferVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verifiedById: 7 }),
      }),
    );
    expect(transactionClient.operation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 21 },
        data: expect.objectContaining({ statusId: 4 }),
      }),
    );
    expect(auditLogs.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
    );
  });

  it('rechaza verificaciones que no corresponden a una entrada VES', async () => {
    prisma.transferVerification.findUnique.mockResolvedValue({
      id: 10,
      status: 'PENDING',
      operationId: 22,
      operation: {
        code: 'OP-USD',
        sourceCurrency: { code: 'USD' },
      },
    });

    await expect(service.confirm(10, {}, 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('impide confirmar dos veces la misma transferencia', async () => {
    prisma.transferVerification.findUnique.mockResolvedValue({
      id: 11,
      status: 'CONFIRMED',
      operationId: 23,
      operation: {
        code: 'OP-VES',
        sourceCurrency: { code: 'VES' },
      },
    });

    await expect(service.confirm(11, {}, 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
