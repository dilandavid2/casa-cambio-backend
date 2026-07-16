import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ReplaceAccountDto } from './dto/replace-account.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { verify } from 'argon2';

@Injectable()
export class AccountsService {
  private round2(value: number) {
    return Number(value.toFixed(2));
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(createAccountDto: CreateAccountDto) {
    const currency = await this.prisma.currency.findUnique({
      where: { id: createAccountDto.currencyId },
    });

    if (!currency) {
      throw new NotFoundException(
        `No se encontró la moneda con id ${createAccountDto.currencyId}`,
      );
    }

    if (createAccountDto.previousAccountId) {
      const previousAccount = await this.prisma.account.findUnique({
        where: { id: createAccountDto.previousAccountId },
      });

      if (!previousAccount) {
        throw new NotFoundException(
          `No se encontró la cuenta anterior con id ${createAccountDto.previousAccountId}`,
        );
      }
    }

    return this.prisma.account.create({
      data: {
        name: createAccountDto.name,
        country: createAccountDto.country,
        type: createAccountDto.type,
        platform: createAccountDto.platform,
        identifier: createAccountDto.identifier,
        balance: createAccountDto.balance ?? 0,
        isActive: createAccountDto.isActive ?? true,
        status: createAccountDto.status ?? 'ACTIVE',
        notes: createAccountDto.notes,
        currencyId: createAccountDto.currencyId,
        previousAccountId: createAccountDto.previousAccountId,
      },
      include: {
        currency: true,
        previousAccount: true,
        nextAccounts: true,
      },
    });
  }

  async setInitialBalance(id: number, amount: number) {
    const account = await this.prisma.account.findUnique({
      where: { id },
    });

    if (!account) {
      throw new NotFoundException('Cuenta no encontrada');
    }

    const existingMovements = await this.prisma.accountMovement.count({
      where: {
        accountId: id,
      },
    });

    if (existingMovements > 0) {
      throw new BadRequestException(
        'Esta cuenta ya tiene movimientos registrados',
      );
    }

    await this.prisma.accountMovement.create({
      data: {
        accountId: id,
        type: 'ENTRY',
        amount,
        valueCOP: amount,
        description: 'Saldo inicial de cuenta',
      },
    });

    return this.prisma.account.update({
      where: { id },
      data: {
        balance: amount,
      },
    });
  }

  async findAll(currencyId?: number) {
    const accounts = await this.prisma.account.findMany({
      where: {
        isActive: true,
        ...(currencyId ? { currencyId } : {}),
      },
      include: {
        currency: true,
        movements: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    return accounts.map((account) => {
      const balance = account.movements.reduce((total, movement) => {
        if (movement.type === 'ENTRY') return total + movement.amount;
        if (movement.type === 'EXIT') return total - movement.amount;
        return total;
      }, 0);

      return {
        ...account,
        balance: this.round2(balance),
      };
    });
  }

  async findActive() {
    return this.prisma.account.findMany({
      where: {
        isActive: true,
      },
      include: {
        currency: true,
        previousAccount: true,
        nextAccounts: true,
      },
      orderBy: {
        id: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        currency: true,
        previousAccount: true,
        nextAccounts: true,
      },
    });

    if (!account) {
      throw new NotFoundException(`No se encontró la cuenta con id ${id}`);
    }

    return account;
  }

  async update(id: number, updateAccountDto: UpdateAccountDto) {
    await this.findOne(id);

    if (updateAccountDto.currencyId !== undefined) {
      const currency = await this.prisma.currency.findUnique({
        where: { id: updateAccountDto.currencyId },
      });

      if (!currency) {
        throw new NotFoundException(
          `No se encontró la moneda con id ${updateAccountDto.currencyId}`,
        );
      }
    }

    return this.prisma.account.update({
      where: { id },
      data: {
        ...(updateAccountDto.name !== undefined && {
          name: updateAccountDto.name,
        }),
        ...(updateAccountDto.country !== undefined && {
          country: updateAccountDto.country,
        }),
        ...(updateAccountDto.type !== undefined && {
          type: updateAccountDto.type,
        }),
        ...(updateAccountDto.platform !== undefined && {
          platform: updateAccountDto.platform,
        }),
        ...(updateAccountDto.identifier !== undefined && {
          identifier: updateAccountDto.identifier,
        }),
        ...(updateAccountDto.balance !== undefined && {
          balance: updateAccountDto.balance,
        }),
        ...(updateAccountDto.isActive !== undefined && {
          isActive: updateAccountDto.isActive,
        }),
        ...(updateAccountDto.status !== undefined && {
          status: updateAccountDto.status,
        }),
        ...(updateAccountDto.notes !== undefined && {
          notes: updateAccountDto.notes,
        }),
        ...(updateAccountDto.currencyId !== undefined && {
          currencyId: updateAccountDto.currencyId,
        }),
      },
      include: {
        currency: true,
        previousAccount: true,
        nextAccounts: true,
      },
    });
  }

  async deactivate(id: number) {
    await this.findOne(id);

    return this.prisma.account.update({
      where: { id },
      data: {
        isActive: false,
        status: 'CLOSED',
      },
      include: {
        currency: true,
        previousAccount: true,
        nextAccounts: true,
      },
    });
  }

  async remove(id: number, userId: number, pin: string) {
    const account = await this.findOne(id);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    let pinMatches = false;
    try {
      pinMatches = !!user && (await verify(user.pinHash, pin));
    } catch {
      pinMatches = false;
    }
    if (!pinMatches) throw new BadRequestException('PIN incorrecto');

    const relations = await this.prisma.account.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            sourceOperations: true,
            targetOperations: true,
            operationSplits: true,
            operationPayments: true,
            paymentMethods: true,
            nextAccounts: true,
          },
        },
      },
    });
    const relationCount = Object.values(relations!._count).reduce(
      (total, count) => total + count,
      0,
    );
    if (relationCount > 0) {
      throw new BadRequestException(
        `No se puede borrar ${account.name} porque participa en operaciones o tiene cuentas relacionadas`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.accountMovement.deleteMany({
        where: { accountId: id, operationId: null },
      });
      return tx.account.delete({ where: { id } });
    });
  }

  async replace(id: number, replaceAccountDto: ReplaceAccountDto) {
    const oldAccount = await this.findOne(id);

    // 🔐 Validar usuario y PIN
    const user = await this.prisma.user.findUnique({
      where: { id: replaceAccountDto.confirmedByUserId },
    });

    if (!user) {
      throw new NotFoundException(
        `No se encontró el usuario con id ${replaceAccountDto.confirmedByUserId}`,
      );
    }

    let pinMatches = false;
    try {
      pinMatches = await verify(user.pinHash, replaceAccountDto.pin);
    } catch {
      pinMatches = false;
    }
    if (!pinMatches) {
      throw new NotFoundException('PIN incorrecto');
    }

    const currency = await this.prisma.currency.findUnique({
      where: { id: replaceAccountDto.currencyId },
    });

    if (!currency) {
      throw new NotFoundException(
        `No se encontró la moneda con id ${replaceAccountDto.currencyId}`,
      );
    }

    const newAccount = await this.prisma.account.create({
      data: {
        name: replaceAccountDto.name,
        country: replaceAccountDto.country,
        type: replaceAccountDto.type,
        platform: replaceAccountDto.platform,
        identifier: replaceAccountDto.identifier,
        currencyId: replaceAccountDto.currencyId,
        balance: oldAccount.balance,
        isActive: true,
        status: 'ACTIVE',
        notes:
          replaceAccountDto.notes ??
          replaceAccountDto.confirmationReason ??
          `Reemplazo confirmado por usuario ${user.name}`,
        previousAccountId: oldAccount.id,
      },
      include: {
        currency: true,
        previousAccount: true,
        nextAccounts: true,
      },
    });

    await this.prisma.account.update({
      where: { id: oldAccount.id },
      data: {
        isActive: false,
        status: 'REPLACED',
        balance: 0,
      },
    });

    await this.auditLogsService.createLog({
      userId: user.id,
      action: 'REPLACE_ACCOUNT',
      entityType: 'Account',
      entityId: oldAccount.id,
      description: `Cuenta ${oldAccount.name} reemplazada por ${newAccount.name}. Motivo: ${
        replaceAccountDto.confirmationReason ?? 'Sin motivo'
      }`,
    });

    return {
      message: 'Cuenta reemplazada correctamente',
      oldAccountId: oldAccount.id,
      newAccount,
    };
  }

  async getBalanceByAccounts() {
    const accounts = await this.prisma.account.findMany({
      include: {
        currency: {
          include: {
            marketRates: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ country: 'asc' }, { name: 'asc' }],
    });

    return accounts.map((account) => {
      const latestRate = account.currency.marketRates[0];
      const marketRate = latestRate ? latestRate.rateToCOP : 0;
      const operationalPercent =
        account.currency.defaultOperationalPercent || 0;
      const effectiveRate = Number(
        (marketRate * (1 - operationalPercent / 100)).toFixed(2),
      );
      const valueCOP = Number((account.balance * effectiveRate).toFixed(2));

      return {
        accountId: account.id,
        name: account.name,
        country: account.country,
        type: account.type,
        platform: account.platform,
        identifier: account.identifier,
        isActive: account.isActive,
        status: account.status,
        balance: account.balance,
        currency: account.currency.code,
        marketRate,
        operationalPercent,
        effectiveRate,
        valueCOP,
      };
    });
  }

  async getGroupedBalanceSummary() {
    const accounts = await this.prisma.account.findMany({
      where: {
        isActive: true,
      },
      include: {
        currency: {
          include: {
            marketRates: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ country: 'asc' }, { id: 'asc' }],
    });

    const grouped = new Map<
      string,
      {
        country: string;
        currency: string;
        accountsCount: number;
        totalBalance: number;
        marketRate: number;
        operationalPercent: number;
        effectiveRate: number;
        valueCOP: number;
      }
    >();

    for (const account of accounts) {
      const latestRate = account.currency.marketRates[0];
      const marketRate = latestRate ? latestRate.rateToCOP : 0;
      const operationalPercent =
        account.currency.defaultOperationalPercent || 0;
      const effectiveRate = Number(
        (marketRate * (1 - operationalPercent / 100)).toFixed(2),
      );

      const key = `${account.country}__${account.currency.code}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          country: account.country,
          currency: account.currency.code,
          accountsCount: 0,
          totalBalance: 0,
          marketRate,
          operationalPercent,
          effectiveRate,
          valueCOP: 0,
        });
      }

      const group = grouped.get(key)!;
      group.accountsCount += 1;
      group.totalBalance = Number(
        (group.totalBalance + account.balance).toFixed(2),
      );
      group.valueCOP = Number((group.totalBalance * effectiveRate).toFixed(2));
    }

    return Array.from(grouped.values());
  }

  async transferBetweenAccounts(
    fromAccountId: number,
    toAccountId: number,
    amount: number,
    description?: string,
    operationDate?: string,
    createdById?: number,
  ) {
    if (fromAccountId === toAccountId) {
      throw new BadRequestException(
        'La cuenta origen y destino no pueden ser iguales',
      );
    }

    if (!amount || amount <= 0) {
      throw new BadRequestException('El monto debe ser mayor a 0');
    }

    const fromAccount = await this.prisma.account.findUnique({
      where: { id: fromAccountId },
      include: { currency: true },
    });

    const toAccount = await this.prisma.account.findUnique({
      where: { id: toAccountId },
      include: { currency: true },
    });

    if (!fromAccount)
      throw new NotFoundException('Cuenta origen no encontrada');
    if (!toAccount) throw new NotFoundException('Cuenta destino no encontrada');

    if (fromAccount.currencyId !== toAccount.currencyId) {
      throw new BadRequestException(
        'Solo puedes transferir entre cuentas de la misma moneda',
      );
    }

    if (fromAccount.balance < amount) {
      throw new BadRequestException('Saldo insuficiente en la cuenta origen');
    }

    const movementDate = operationDate ? new Date(operationDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const transferType = await tx.operationType.findFirst({
        where: { name: 'Transferencia interna' },
      });

      const completedStatus = await tx.operationStatus.findFirst({
        where: { name: 'Completada' },
      });

      if (!transferType || !completedStatus || !createdById) {
        throw new BadRequestException(
          'Faltan catálogos iniciales o el usuario autenticado',
        );
      }

      let systemClient = await tx.client.findFirst({
        where: { name: 'Sistema interno' },
      });

      if (!systemClient) {
        systemClient = await tx.client.create({
          data: {
            name: 'Sistema interno',
            type: 'GENERIC',
          },
        });
      }

      const operation = await tx.operation.create({
        data: {
          code: `TRF-${Date.now()}`,
          clientId: systemClient.id,
          typeId: transferType.id,
          statusId: completedStatus.id,
          sourceCurrencyId: fromAccount.currencyId,
          sourceAccountId: fromAccountId,
          targetCurrencyId: toAccount.currencyId,
          amountSource: amount,
          amountTargetEstimated: amount,
          marketRate: 1,
          operationalPercent: 0,
          effectiveRate: 1,
          clientRate: 1,
          valueCOP: amount,
          paymentStatus: 'PAID',
          amountPaid: amount,
          pendingAmount: 0,
          operationDate: movementDate,
          createdById,
        },
      });
      const updatedFrom = await tx.account.update({
        where: { id: fromAccountId },
        data: { balance: this.round2(fromAccount.balance - amount) },
      });

      const updatedTo = await tx.account.update({
        where: { id: toAccountId },
        data: { balance: this.round2(toAccount.balance + amount) },
      });

      await tx.accountMovement.create({
        data: {
          accountId: fromAccountId,
          type: 'EXIT',
          amount,
          valueCOP: amount,
          operationId: operation.id,
          createdAt: movementDate,
          description:
            description ?? `Transferencia enviada a ${toAccount.name}`,
        },
      });

      await tx.accountMovement.create({
        data: {
          accountId: toAccountId,
          type: 'ENTRY',
          amount,
          valueCOP: amount,
          operationId: operation.id,
          createdAt: movementDate,
          description:
            description ?? `Transferencia recibida desde ${fromAccount.name}`,
        },
      });

      return {
        message: 'Transferencia realizada correctamente',
        fromAccount: updatedFrom,
        toAccount: updatedTo,
      };
    });
  }

  async getSummary(id: number) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        currency: true,
        movements: true,
      },
    });

    if (!account) {
      throw new NotFoundException(`No existe la cuenta con id ${id}`);
    }

    const totalEntries = account.movements
      .filter((movement) => movement.type === 'ENTRY')
      .reduce((sum, movement) => sum + movement.amount, 0);

    const totalExits = account.movements
      .filter((movement) => movement.type === 'EXIT')
      .reduce((sum, movement) => sum + movement.amount, 0);

    const totalMovementsCOP = account.movements.reduce((sum, movement) => {
      return sum + movement.valueCOP;
    }, 0);

    return {
      account: {
        id: account.id,
        name: account.name,
        country: account.country,
        type: account.type,
        platform: account.platform,
        identifier: account.identifier,
        status: account.status,
        isActive: account.isActive,
        currency: account.currency.code,
        currentBalance: account.balance,
        valueCOP: this.round2(
          account.balance * account.currency.defaultOperationalPercent,
        ),
      },
      movements: {
        totalEntries: this.round2(totalEntries),
        totalExits: this.round2(totalExits),
        movementsCount: account.movements.length,
        totalMovementsCOP: this.round2(totalMovementsCOP),
      },
    };
  }
  async getMovements(id: number) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        currency: true,
        movements: {
          include: {
            operation: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException(`No existe la cuenta con id ${id}`);
    }

    return {
      account: {
        id: account.id,
        name: account.name,
        country: account.country,
        type: account.type,
        platform: account.platform,
        identifier: account.identifier,
        status: account.status,
        isActive: account.isActive,
        currency: account.currency.code,
        currentBalance: account.balance,
      },
      movements: account.movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amount: movement.amount,
        valueCOP: movement.valueCOP,
        description: movement.description,
        createdAt: movement.createdAt,
        operation: movement.operation
          ? {
              id: movement.operation.id,
              code: movement.operation.code,
            }
          : null,
      })),
      totals: {
        totalEntries: this.round2(
          account.movements
            .filter((movement) => movement.type === 'ENTRY')
            .reduce((sum, movement) => sum + movement.amount, 0),
        ),
        totalExits: this.round2(
          account.movements
            .filter((movement) => movement.type === 'EXIT')
            .reduce((sum, movement) => sum + movement.amount, 0),
        ),
        movementsCount: account.movements.length,
      },
    };
  }
  async recalculateBalance(accountId: number) {
    const movements = await this.prisma.accountMovement.findMany({
      where: { accountId },
    });

    let totalEntries = 0;
    let totalExits = 0;

    if (movements.length === 0) {
      return {
        accountId,
        totalEntries: 0,
        totalExits: 0,
        newBalance: 0,
        message: 'La cuenta no tiene movimientos',
      };
    }

    for (const mov of movements) {
      if (mov.type === 'ENTRY') {
        totalEntries += mov.amount;
      } else if (mov.type === 'EXIT') {
        totalExits += mov.amount;
      }
    }

    const newBalance = totalEntries - totalExits;

    await this.prisma.account.update({
      where: { id: accountId },
      data: { balance: newBalance },
    });

    return {
      accountId,
      totalEntries,
      totalExits,
      newBalance,
    };
  }
  async getLedger(accountId: number) {
    const movements = await this.prisma.accountMovement.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
    });

    let runningBalance = 0;

    const ledger = movements.map((mov) => {
      if (mov.type === 'ENTRY') {
        runningBalance += mov.amount;
      } else if (mov.type === 'EXIT') {
        runningBalance -= mov.amount;
      }

      return {
        date: mov.createdAt,
        type: mov.type,
        amount: mov.amount,
        balanceAfter: this.round2(runningBalance),
        description: mov.description,
        operationId: mov.operationId, // 🔥 clave
      };
    });

    return {
      accountId,
      ledger,
    };
  }
}
