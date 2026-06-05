import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountMovementDto } from './dto/create-account-movement.dto';
import { TransferAccountMovementDto } from './dto/transfer-account-movement.dto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ClientType,
  MovementType,
  OperationPaymentStatus,
} from '@prisma/client';

@Injectable()
export class AccountMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAccountMovementDto) {
    const account = await this.prisma.account.findUnique({
      where: { id: dto.accountId },
    });

    if (!account) {
      throw new NotFoundException(
        `No existe la cuenta con id ${dto.accountId}`,
      );
    }

    const movement = await this.prisma.accountMovement.create({
      data: {
        accountId: dto.accountId,
        operationId: dto.operationId,
        type: dto.type as MovementType,
        amount: dto.amount,
        valueCOP: dto.valueCOP ?? 0,
        description: dto.description,
      },
      include: {
        account: true,
        operation: true,
      },
    });

    return movement;
  }

  async findAll() {
    return this.prisma.accountMovement.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        account: true,
        operation: true,
      },
    });
  }

  async transfer(dto: TransferAccountMovementDto) {
    const fromAccount = await this.prisma.account.findUnique({
      where: { id: dto.fromAccountId },
    });

    const toAccount = await this.prisma.account.findUnique({
      where: { id: dto.toAccountId },
    });

    if (!fromAccount) {
      throw new NotFoundException(
        `No existe la cuenta origen ${dto.fromAccountId}`,
      );
    }

    if (!toAccount) {
      throw new NotFoundException(
        `No existe la cuenta destino ${dto.toAccountId}`,
      );
    }

    if (!fromAccount.isActive || fromAccount.status !== 'ACTIVE') {
      throw new BadRequestException(`La cuenta origen está inactiva`);
    }

    if (!toAccount.isActive || toAccount.status !== 'ACTIVE') {
      throw new BadRequestException(`La cuenta destino está inactiva`);
    }

    if (fromAccount.id === toAccount.id) {
      throw new BadRequestException('No puedes transferir a la misma cuenta');
    }

    // NUEVO: misma moneda
    if (fromAccount.currencyId !== toAccount.currencyId) {
      throw new BadRequestException('Las cuentas deben tener la misma moneda');
    }

    // NUEVO: mismo país
    if (fromAccount.country !== toAccount.country) {
      throw new BadRequestException(
        'Las cuentas deben pertenecer al mismo país',
      );
    }

    if (fromAccount.balance < dto.amount) {
      throw new BadRequestException(
        `Saldo insuficiente en ${fromAccount.name}`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: dto.createdById,
      },
    });

    if (!user) {
      throw new NotFoundException(`No existe el usuario ${dto.createdById}`);
    }

    let client = await this.prisma.client.findFirst({
      where: {
        name: 'Sistema interno',
      },
    });

    if (!client) {
      client = await this.prisma.client.create({
        data: {
          name: 'Sistema interno',
          type: ClientType.GENERIC,
        },
      });
    }

    const type = await this.prisma.operationType.findFirst({
      where: {
        name: 'Transferencia interna',
      },
    });

    if (!type) {
      throw new BadRequestException(
        'Crea primero el tipo "Transferencia interna"',
      );
    }

    const status = await this.prisma.operationStatus.findFirst({
      where: {
        name: 'Completada',
      },
    });

    if (!status) {
      throw new BadRequestException('No existe estado Completada');
    }

    const operation = await this.prisma.operation.create({
      data: {
        code: dto.code || `TRF-${Date.now()}`,

        clientId: client.id,

        typeId: type.id,

        statusId: status.id,

        sourceCurrencyId: fromAccount.currencyId,

        targetCurrencyId: toAccount.currencyId,

        amountSource: dto.amount,

        amountTargetEstimated: dto.amount,

        amountTargetFinal: dto.amount,

        valueCOP: dto.amount,

        marketRate: 1,
        operationalPercent: 0,
        effectiveRate: 1,
        clientRate: 1,
        realProfitCOP: 0,
        estimatedProfitCOP: 0,
        operationDate: new Date(),

        paymentStatus: OperationPaymentStatus.PAID,

        amountPaid: dto.amount,

        pendingAmount: 0,

        completedAt: new Date(),

        createdById: dto.createdById,
      },
    });

    const newOriginBalance = fromAccount.balance - dto.amount;

    const newDestinationBalance = toAccount.balance + dto.amount;

    await this.prisma.account.update({
      where: {
        id: fromAccount.id,
      },
      data: {
        balance: newOriginBalance,
      },
    });

    await this.prisma.account.update({
      where: {
        id: toAccount.id,
      },
      data: {
        balance: newDestinationBalance,
      },
    });

    await this.prisma.accountMovement.create({
      data: {
        accountId: fromAccount.id,
        operationId: operation.id,
        type: MovementType.EXIT,
        amount: dto.amount,
        valueCOP: dto.amount,

        description: dto.description || `Transferencia a ${toAccount.name}`,
      },
    });

    await this.prisma.accountMovement.create({
      data: {
        accountId: toAccount.id,
        operationId: operation.id,
        type: MovementType.ENTRY,
        amount: dto.amount,
        valueCOP: dto.amount,

        description:
          dto.description || `Transferencia desde ${fromAccount.name}`,
      },
    });

    return {
      success: true,
      operation,
      fromBalance: newOriginBalance,
      toBalance: newDestinationBalance,
    };
  }
}
