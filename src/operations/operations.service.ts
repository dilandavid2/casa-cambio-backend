import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ClientType, OperationPaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOperationDto } from './dto/create-operation.dto';
import { UpdateOperationDto } from './dto/update-operation.dto';
import { CompleteOperationDto } from './dto/complete-operation.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AddOperationPaymentDto } from './dto/add-operation-payment.dto';

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private round2(value: number) {
    return Number(value.toFixed(2));
  }

  async estimate(data: {
    sourceCurrencyId: number;
    targetCurrencyId: number;
    amountSource: number;
    manualRateToCOP?: number;
  }) {
    const sourceCurrency = await this.prisma.currency.findUnique({
      where: { id: data.sourceCurrencyId },
    });

    if (!sourceCurrency) {
      throw new NotFoundException(
        `No se encontró la moneda origen con id ${data.sourceCurrencyId}`,
      );
    }

    const targetCurrency = await this.prisma.currency.findUnique({
      where: { id: data.targetCurrencyId },
    });

    if (!targetCurrency) {
      throw new NotFoundException(
        `No se encontró la moneda destino con id ${data.targetCurrencyId}`,
      );
    }

    let marketRate: number;

    if (sourceCurrency.code === 'VES') {
      if (!data.manualRateToCOP) {
        throw new BadRequestException(
          'Para operaciones en VES debes ingresar una tasa manual',
        );
      }

      marketRate = data.manualRateToCOP;
    } else {
      const latestMarketRate = await this.prisma.marketRate.findFirst({
        where: {
          currencyId: data.sourceCurrencyId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!latestMarketRate) {
        throw new NotFoundException(
          `No existe una tasa de mercado registrada para la moneda origen con id ${data.sourceCurrencyId}`,
        );
      }

      marketRate = latestMarketRate.rateToCOP;
    }
    const operationalPercent = sourceCurrency.defaultOperationalPercent || 0;

    const effectiveRate = this.round2(
      marketRate * (1 - operationalPercent / 100),
    );

    const valueCOP = this.round2(data.amountSource * effectiveRate);

    let amountTargetEstimated = valueCOP;

    if (data.targetCurrencyId !== data.sourceCurrencyId) {
      if (targetCurrency.code !== 'COP') {
        const latestTargetRate = await this.prisma.marketRate.findFirst({
          where: {
            currencyId: data.targetCurrencyId,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        if (!latestTargetRate) {
          throw new NotFoundException(
            `No existe una tasa de mercado registrada para la moneda destino con id ${data.targetCurrencyId}`,
          );
        }

        amountTargetEstimated = this.round2(
          valueCOP / latestTargetRate.rateToCOP,
        );
      }
    }

    return {
      amountSource: data.amountSource,
      sourceCurrency: sourceCurrency.code,
      targetCurrency: targetCurrency.code,
      marketRate,
      operationalPercent,
      effectiveRate,
      valueCOP,
      amountTargetEstimated,
    };
  }

  async create(
    createOperationDto: CreateOperationDto,
    authenticatedUserId?: number,
  ) {
    let client: Awaited<ReturnType<typeof this.prisma.client.findFirst>> = null;

    if (createOperationDto.clientName?.trim()) {
      client = await this.prisma.client.findFirst({
        where: {
          name: createOperationDto.clientName.trim(),
        },
      });

      if (!client) {
        client = await this.prisma.client.create({
          data: {
            name: createOperationDto.clientName.trim(),
            type: ClientType.GENERIC,
          },
        });
      }
    } else if (createOperationDto.clientId) {
      client = await this.prisma.client.findUnique({
        where: { id: createOperationDto.clientId },
      });
    } else {
      client = await this.prisma.client.findFirst({
        where: { name: 'Sistema interno', type: 'GENERIC' },
      });
    }

    if (!client) {
      throw new NotFoundException('No se encontró o creó el cliente');
    }

    const operationType = createOperationDto.typeId
      ? await this.prisma.operationType.findUnique({
          where: { id: createOperationDto.typeId },
        })
      : await this.prisma.operationType.findFirst({
          where: { name: 'Cambio de divisas' },
        });

    if (!operationType) {
      throw new NotFoundException(
        'No se encontró el tipo interno "Cambio de divisas"',
      );
    }

    const operationStatus = createOperationDto.statusId
      ? await this.prisma.operationStatus.findUnique({
          where: { id: createOperationDto.statusId },
        })
      : await this.prisma.operationStatus.findFirst({
          where: { name: 'Creada' },
        });

    if (!operationStatus) {
      throw new NotFoundException(
        'No se encontró el estado inicial "Creada"',
      );
    }

    const sourceCurrency = await this.prisma.currency.findUnique({
      where: { id: createOperationDto.sourceCurrencyId },
    });

    if (!sourceCurrency) {
      throw new NotFoundException(
        `No se encontró la moneda origen con id ${createOperationDto.sourceCurrencyId}`,
      );
    }

    if (sourceCurrency.code !== 'COP' && !createOperationDto.manualRateToCOP) {
      throw new BadRequestException(
        `Debes ingresar la tasa manual de ${sourceCurrency.code} a COP`,
      );
    }

    const targetCurrency = await this.prisma.currency.findUnique({
      where: { id: createOperationDto.targetCurrencyId },
    });

    if (!targetCurrency) {
      throw new NotFoundException(
        `No se encontró la moneda destino con id ${createOperationDto.targetCurrencyId}`,
      );
    }

    if (
      targetCurrency.code !== 'COP' &&
      targetCurrency.id !== sourceCurrency.id &&
      !createOperationDto.copToTargetRate &&
      !createOperationDto.amountTargetEstimated &&
      !(createOperationDto.splits?.length)
    ) {
      throw new BadRequestException(
        `Debes ingresar la tasa manual de ${targetCurrency.code} a COP`,
      );
    }

    if (createOperationDto.paymentMode === 'IMMEDIATE') {
      if (!createOperationDto.sourceAccountId) {
        throw new BadRequestException(
          'Debes seleccionar la cuenta donde entra el dinero recibido',
        );
      }
      const sourceAccount = await this.prisma.account.findUnique({
        where: { id: createOperationDto.sourceAccountId },
      });
      if (
        !sourceAccount ||
        !sourceAccount.isActive ||
        sourceAccount.currencyId !== sourceCurrency.id
      ) {
        throw new BadRequestException(
          'La cuenta de entrada no está activa o no coincide con la moneda recibida',
        );
      }

      if (!createOperationDto.splits?.length) {
        if (!createOperationDto.targetAccountId) {
          throw new BadRequestException(
            'Debes seleccionar la cuenta de donde sale el dinero',
          );
        }
        const targetAccount = await this.prisma.account.findUnique({
          where: { id: createOperationDto.targetAccountId },
        });
        if (
          !targetAccount ||
          !targetAccount.isActive ||
          targetAccount.currencyId !== targetCurrency.id
        ) {
          throw new BadRequestException(
            'La cuenta de salida no está activa o no coincide con la moneda entregada',
          );
        }
      }
    }

    const createdById = authenticatedUserId ?? createOperationDto.createdById;
    if (!createdById) {
      throw new NotFoundException('No se encontró el usuario creador');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: createdById },
    });

    if (!user) {
      throw new NotFoundException(
        `No se encontró el usuario con id ${createOperationDto.createdById}`,
      );
    }

    let marketRate: number;

    if (createOperationDto.manualRateToCOP) {
      marketRate = createOperationDto.manualRateToCOP;
    } else {
      const latestMarketRate = await this.prisma.marketRate.findFirst({
        where: {
          currencyId: createOperationDto.sourceCurrencyId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!latestMarketRate) {
        throw new NotFoundException(`No existe tasa para la moneda`);
      }

      marketRate = latestMarketRate.rateToCOP;
    }
    const operationalPercent = sourceCurrency.defaultOperationalPercent || 0;

    const effectiveRate = this.round2(
      marketRate * (1 - operationalPercent / 100),
    );

    const valueCOP = this.round2(
      createOperationDto.amountSource * effectiveRate,
    );

    let amountTargetEstimated = valueCOP;

    if (
      createOperationDto.targetCurrencyId !==
      createOperationDto.sourceCurrencyId
    ) {
      if (targetCurrency.code !== 'COP') {
        const targetRate = createOperationDto.copToTargetRate;
        if (!targetRate || targetRate <= 0) {
          if (!createOperationDto.amountTargetEstimated) {
            throw new BadRequestException(
              `Debes indicar la tasa de ${targetCurrency.code} a COP o el monto que recibirá el cliente`,
            );
          }
        } else {
          amountTargetEstimated = this.round2(valueCOP / targetRate);
        }
      }
    }

    if (createOperationDto.splits && createOperationDto.splits.length > 0) {
      const totalSplitsCOP = createOperationDto.splits.reduce(
        (sum, split) => sum + Number(split.valueCOP ?? 0),
        0,
      );

      const sourceCurrency = await this.prisma.currency.findUnique({
        where: {
          id: createOperationDto.sourceCurrencyId,
        },
      });

      const originRate =
        sourceCurrency?.code === 'COP'
          ? 1
          : Number(createOperationDto.manualRateToCOP || 0);

      const totalOriginCOP =
        Number(createOperationDto.amountSource) * originRate;

      if (Math.abs(totalSplitsCOP - totalOriginCOP) > 1) {
        throw new BadRequestException(
          `La suma de los splits (${totalSplitsCOP}) debe ser igual al monto origen convertido (${totalOriginCOP})`,
        );
      }
    }

    const preparedSplits = await Promise.all(
      (createOperationDto.splits ?? []).map(async (split) => {
        const currency = await this.prisma.currency.findUnique({
          where: {
            id: split.targetCurrencyId,
          },
        });

        if (!currency) {
          throw new NotFoundException(
            `No existe moneda ${split.targetCurrencyId}`,
          );
        }

        let marketRate: number;

        if (split.manualRateToCOP) {
          marketRate = split.manualRateToCOP;
        } else {
          const latestRate = await this.prisma.marketRate.findFirst({
            where: {
              currencyId: split.targetCurrencyId,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

          if (!latestRate) {
            throw new NotFoundException(`No existe tasa para ${currency.code}`);
          }

          marketRate = latestRate.rateToCOP;
        }

        const percent = currency.defaultOperationalPercent || 0;

        const effectiveRate = this.round2(marketRate * (1 - percent / 100));

        const valueCOP =
          split.valueCOP ?? this.round2(split.amount * effectiveRate);

        return {
          targetCurrencyId: split.targetCurrencyId,
          amount: split.amount,
          accountId: split.accountId ?? null,
          valueCOP,
          destination: split.destination ?? null,
          notes: split.notes ?? null,
        };
      }),
    );

    const preparedPayments = (createOperationDto.payments ?? []).map(
      (payment) => {
        const paymentProportion =
          createOperationDto.amountSource > 0
            ? payment.amount / createOperationDto.amountSource
            : 0;

        const paymentValueCOP = this.round2(valueCOP * paymentProportion);

        const commission = this.round2(paymentValueCOP * 0);

        return {
          paymentMethodId: payment.paymentMethodId,
          amount: payment.amount,
          commission,
          netAmount: payment.amount - commission,
          valueCOP: paymentValueCOP,
          notes: payment.notes ?? null,
        };
      },
    );
    const paymentStatus =
      createOperationDto.paymentStatus ??
      (createOperationDto.paymentMode === 'PENDING'
        ? OperationPaymentStatus.PENDING
        : OperationPaymentStatus.PAID);

    const hasSplits = (createOperationDto.splits?.length ?? 0) > 0;

    const amountPaid =
      paymentStatus === OperationPaymentStatus.PAID
        ? hasSplits
          ? createOperationDto.amountSource
          : amountTargetEstimated
        : (createOperationDto.amountPaid ?? 0);

    const pendingAmount =
      paymentStatus === OperationPaymentStatus.PAID
        ? 0
        : this.round2(createOperationDto.amountSource - amountPaid);

    const operationDate = new Date(createOperationDto.operationDate);

    const hoy = new Date();
    const finDeHoy = new Date(hoy);
    finDeHoy.setHours(23, 59, 59, 999);
    const fechaMinima = new Date('2024-01-01');

    if (operationDate < fechaMinima) {
      throw new BadRequestException(
        'La fecha de operación es demasiado antigua',
      );
    }

    if (operationDate > finDeHoy) {
      throw new BadRequestException('La fecha no puede ser futura');
    }

    const finalAmountTargetEstimated = this.round2(
      createOperationDto.amountTargetEstimated ?? amountTargetEstimated,
    );
    const targetRateToCOP =
      targetCurrency.code === 'COP'
        ? 1
        : this.round2(
            createOperationDto.copToTargetRate ??
              valueCOP / finalAmountTargetEstimated,
          );

    const operation = await this.prisma.operation.create({
      data: {
        code: createOperationDto.code,
        clientId: client.id,
        typeId: operationType.id,
        statusId: operationStatus.id,
        sourceCurrencyId: createOperationDto.sourceCurrencyId,
        sourceAccountId: createOperationDto.sourceAccountId ?? null,
        targetCurrencyId: createOperationDto.targetCurrencyId,
        amountSource: createOperationDto.amountSource,
        amountTargetEstimated: finalAmountTargetEstimated,
        marketRate,
        copToTargetRate: targetRateToCOP,
        operationalPercent,
        effectiveRate,
        clientRate: effectiveRate,
        valueCOP,
        paymentStatus,
        amountPaid,
        paymentMode: createOperationDto.paymentMode,
        pendingAmount,
        targetAccountId: createOperationDto.targetAccountId ?? null,
        requiresCashDelivery: createOperationDto.requiresCashDelivery ?? false,
        operationDate: createOperationDto.operationDate
          ? new Date(createOperationDto.operationDate)
          : new Date(),
        createdById,
        splits:
          preparedSplits.length > 0
            ? {
                create: preparedSplits,
              }
            : undefined,
        payments:
          preparedPayments.length > 0
            ? { create: preparedPayments }
            : undefined,
      },
      include: {
        client: true,
        type: true,
        status: true,
        sourceCurrency: true,
        targetCurrency: true,
        splits: {
          include: {
            targetCurrency: true,
            account: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (
      createOperationDto.paymentMode === 'PENDING' &&
      createOperationDto.targetAccountId
    ) {
      const targetAccount = await this.prisma.account.findUnique({
        where: { id: createOperationDto.targetAccountId },
      });

      if (!targetAccount) {
        throw new NotFoundException('Cuenta destino no encontrada');
      }

      const newTargetBalance = this.round2(
        targetAccount.balance - finalAmountTargetEstimated,
      );

      await this.prisma.account.update({
        where: { id: targetAccount.id },
        data: {
          balance: newTargetBalance,
        },
      });

      await this.prisma.accountMovement.create({
        data: {
          accountId: targetAccount.id,
          operationId: operation.id,
          type: 'EXIT',
          amount: finalAmountTargetEstimated,
          valueCOP,
          createdAt: operationDate,
          description: `Salida de dinero destino en operación ${operation.code}`,
        },
      });
    }

    await this.auditLogsService.createLog({
      userId: createOperationDto.createdById,
      action: 'CREATE_OPERATION',
      entityType: 'Operation',
      entityId: operation.id,
      description: `Operación creada. Tipo: ${operation.typeId}, Monto: ${operation.amountSource}`,
    });

    return operation;
  }

  async addPayment(operationId: number, dto: AddOperationPaymentDto) {
    const operation = await this.prisma.operation.findUnique({
      where: { id: operationId },
      include: {
        sourceCurrency: true,
        targetCurrency: true,
        payments: true,
      },
    });

    if (!operation) {
      throw new NotFoundException(`No se encontró la operación ${operationId}`);
    }

    const account = await this.prisma.account.findUnique({
      where: { id: dto.accountId },
      include: {
        currency: true,
      },
    });

    if (!account) {
      throw new NotFoundException(`No se encontró la cuenta ${dto.accountId}`);
    }

    if (account.currencyId !== dto.currencyId) {
      throw new BadRequestException(
        'La cuenta seleccionada no coincide con la moneda del abono',
      );
    }

    const currency = account.currency;

    const rateToCOP =
      currency.code === 'COP'
        ? 1
        : dto.rateToCOP && dto.rateToCOP > 0
          ? dto.rateToCOP
          : null;

    if (!rateToCOP) {
      throw new BadRequestException('Debes ingresar una tasa válida a COP');
    }

    const valueCOP = this.round2(dto.amount * rateToCOP);

    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();

    const today = new Date();

    if (paymentDate > today) {
      throw new BadRequestException('La fecha del abono no puede ser futura');
    }

    if (paymentDate < operation.operationDate) {
      throw new BadRequestException(
        'La fecha del abono no puede ser anterior a la fecha de la operación',
      );
    }

    const lastPayment = await this.prisma.operationPayment.findFirst({
      where: { operationId },
      orderBy: { paymentDate: 'desc' },
    });

    if (lastPayment?.paymentDate && paymentDate < lastPayment.paymentDate) {
      throw new BadRequestException(
        'La fecha del abono no puede ser anterior al último abono registrado',
      );
    }

    const payment = await this.prisma.operationPayment.create({
      data: {
        operationId,
        accountId: account.id,
        currencyId: currency.id,
        amount: dto.amount,
        commission: 0,
        netAmount: dto.amount,
        valueCOP,
        rateToCOP,
        rateSource: dto.rateSource ?? 'MANUAL',
        requiresVerification: dto.requiresVerification ?? false,
        verifiedAt: new Date(),
        paymentDate,
        notes: dto.notes ?? null,
      },
    });

    const newBalance = this.round2(account.balance + dto.amount);

    await this.prisma.account.update({
      where: { id: account.id },
      data: {
        balance: newBalance,
      },
    });

    await this.prisma.accountMovement.create({
      data: {
        accountId: account.id,
        operationId,
        type: 'ENTRY',
        amount: dto.amount,
        valueCOP,
        createdAt: paymentDate,
        description: `Abono registrado en operación ${operation.code}`,
      },
    });

    const payments = await this.prisma.operationPayment.findMany({
      where: { operationId },
    });

    const sourceRateToCOP =
      operation.sourceCurrency.code === 'COP' ? 1 : operation.marketRate;

    const totalPaid = this.round2(
      payments.reduce((sum, item) => {
        if (!item.verifiedAt) return sum;

        if (item.currencyId === operation.sourceCurrencyId) {
          return sum + item.netAmount;
        }

        const itemValueCOP = item.valueCOP ?? 0;
        const equivalentInSource = itemValueCOP / sourceRateToCOP;

        return sum + equivalentInSource;
      }, 0),
    );

    const pendingAmount = this.round2(operation.amountSource - totalPaid);

    const paymentStatus =
      pendingAmount <= 0
        ? OperationPaymentStatus.PAID
        : totalPaid > 0
          ? OperationPaymentStatus.PARTIAL
          : OperationPaymentStatus.PENDING;

    await this.prisma.operation.update({
      where: { id: operationId },
      data: {
        amountPaid: totalPaid,
        pendingAmount: pendingAmount > 0 ? pendingAmount : 0,
        paymentStatus,
      },
    });

    return {
      payment,
      totalPaid,
      pendingAmount: pendingAmount > 0 ? pendingAmount : 0,
      paymentStatus,
    };
  }

  async findAll() {
    return this.prisma.operation.findMany({
      include: {
        client: true,
        type: true,
        status: true,
        sourceCurrency: true,
        targetCurrency: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        splits: true,
      },
      orderBy: [{ operationDate: 'desc' }, { id: 'desc' }],
    });
  }

  async findOne(id: number) {
    const operation = await this.prisma.operation.findUnique({
      where: { id },
      include: {
        client: true,
        type: true,
        status: true,
        payments: {
          include: {
            paymentMethod: true,
            currency: true,
            account: true,
          },
        },
        sourceCurrency: true,
        targetCurrency: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!operation) {
      throw new NotFoundException(`No se encontró la operación con id ${id}`);
    }

    const sourceRateToCOP =
      operation.sourceCurrency.code === 'COP' ? 1 : operation.marketRate;

    const verifiedPaymentsTotal = this.round2(
      operation.payments.reduce((sum, payment) => {
        if (!payment.verifiedAt) return sum;

        if (payment.currencyId === operation.sourceCurrencyId) {
          return sum + payment.netAmount;
        }

        const equivalentInSource = (payment.valueCOP ?? 0) / sourceRateToCOP;

        return sum + equivalentInSource;
      }, 0),
    );

    const isImmediate = operation.paymentMode !== 'PENDING';
    const totalPagado = isImmediate
      ? operation.amountSource
      : verifiedPaymentsTotal;
    const saldoPendiente = isImmediate
      ? 0
      : this.round2(operation.amountSource - totalPagado);

    const paymentStatus = isImmediate
      ? OperationPaymentStatus.PAID
      : saldoPendiente <= 0
        ? OperationPaymentStatus.PAID
        : totalPagado > 0
          ? OperationPaymentStatus.PARTIAL
          : OperationPaymentStatus.PENDING;

    return {
      ...operation,
      totalPagado,
      saldoPendiente,
      paymentStatus,
    };
  }

  async update(id: number, updateOperationDto: UpdateOperationDto) {
    await this.findOne(id);

    return this.prisma.operation.update({
      where: { id },
      data: {
        ...(updateOperationDto.code !== undefined && {
          code: updateOperationDto.code,
        }),
        ...(updateOperationDto.requiresCashDelivery !== undefined && {
          requiresCashDelivery: updateOperationDto.requiresCashDelivery,
        }),
      },
      include: {
        client: true,
        type: true,
        status: true,
        sourceCurrency: true,
        targetCurrency: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async remove(id: number, deleteCode: string, userId: number) {
    if (deleteCode !== 'ELIMINAR123') {
      throw new BadRequestException('Código de eliminación incorrecto');
    }

    const operation = await this.prisma.operation.findUnique({
      where: { id },
    });

    await this.prisma.accountMovement.deleteMany({
      where: { operationId: id },
    });

    await this.prisma.operationPayment.deleteMany({
      where: { operationId: id },
    });

    await this.prisma.operationSplit.deleteMany({
      where: { operationId: id },
    });

    await this.prisma.operationModification.deleteMany({
      where: { newOperationId: id },
    });

    await this.prisma.pendingOperation.deleteMany({
      where: { operationId: id },
    });

    await this.prisma.transferVerification.deleteMany({
      where: { operationId: id },
    });

    await this.auditLogsService.createLog({
      userId,
      action: 'DELETE_OPERATION',
      entityType: 'Operation',
      entityId: id,
      description: `Operación eliminada por código de seguridad`,
    });

    await this.prisma.operation.delete({
      where: { id },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'DELETE_OPERATION',
        entityType: 'Operation',
        entityId: id,
        description: `Se eliminó la operación ${operation?.code}`,
      },
    });

    return { message: 'Operación eliminada correctamente' };
  }
  async complete(id: number, completeOperationDto: CompleteOperationDto) {
    const operation = await this.prisma.operation.findUnique({
      where: { id },
      include: {
        targetCurrency: true,
        status: true,
        client: true,
        type: true,
        sourceCurrency: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!operation) {
      throw new NotFoundException(`No se encontró la operación con id ${id}`);
    }

    const completedStatus = await this.prisma.operationStatus.findFirst({
      where: {
        name: 'Completada',
      },
    });

    if (!completedStatus) {
      throw new NotFoundException('No existe un estado llamado "Completada"');
    }

    if (operation.status?.name === 'Completada' || operation.completedAt) {
      throw new BadRequestException(
        'Esta operación ya fue completada y no puede completarse otra vez',
      );
    }

    if (
      operation.paymentMode === 'PENDING' &&
      operation.paymentStatus !== OperationPaymentStatus.PAID
    ) {
      throw new BadRequestException(
        'La operación todavía tiene saldo pendiente',
      );
    }

    const amountTargetFinal = this.round2(
      completeOperationDto.amountTargetFinal,
    );

    let realProfitCOP: number | null = 0;

    if (operation.targetCurrency.code === 'COP') {
      realProfitCOP = this.round2(operation.valueCOP - amountTargetFinal);
    } else {
      realProfitCOP = null;
    }

    if (completeOperationDto.requiresTransferVerification) {
      const existingVerification =
        await this.prisma.transferVerification.findFirst({
          where: {
            operationId: id,
            status: 'PENDING',
          },
        });

      if (existingVerification) {
        throw new BadRequestException(
          'Esta operación ya tiene una verificación pendiente',
        );
      }

      const verification = await this.prisma.transferVerification.create({
        data: {
          operationId: id,
          status: 'PENDING',
          reason: 'Transferencia bancaria pendiente por verificar',
          notes: 'El operador debe confirmar que el dinero ingresó al banco',
        },
        include: {
          operation: true,
        },
      });

      const verificationStatus = await this.prisma.operationStatus.findFirst({
        where: { name: 'En verificación' },
      });

      if (!verificationStatus) {
        throw new BadRequestException(
          'No existe el estado En verificación en OperationStatus',
        );
      }

      await this.prisma.operation.update({
        where: { id },
        data: {
          statusId: verificationStatus.id,
        },
      });

      return {
        message: 'Operación enviada a verificación bancaria',
        verification,
      };
    }

    if (
      operation.paymentMode !== 'PENDING' &&
      !operation.sourceAccountId
    ) {
      throw new BadRequestException(
        'Debes seleccionar la cuenta donde entra el dinero recibido',
      );
    }

    if (operation.paymentMode !== 'PENDING' && operation.sourceAccountId) {
      const sourceAccount = await this.prisma.account.findUnique({
        where: { id: operation.sourceAccountId },
      });
      if (!sourceAccount || !sourceAccount.isActive) {
        throw new BadRequestException(
          'La cuenta de entrada no está disponible',
        );
      }
      if (sourceAccount.currencyId !== operation.sourceCurrencyId) {
        throw new BadRequestException(
          'La cuenta de entrada no coincide con la moneda recibida',
        );
      }

      await this.prisma.account.update({
        where: { id: sourceAccount.id },
        data: {
          balance: this.round2(sourceAccount.balance + operation.amountSource),
        },
      });
      await this.prisma.accountMovement.create({
        data: {
          accountId: sourceAccount.id,
          operationId: id,
          type: 'ENTRY',
          amount: operation.amountSource,
          valueCOP: operation.valueCOP,
          description: `Entrada de dinero recibido en operación ${operation.code}`,
        },
      });
    }

    const operationSplits = await this.prisma.operationSplit.findMany({
      where: { operationId: id },
      include: {
        targetCurrency: true,
      },
    });

    if (operationSplits.length > 0) {
      for (const split of operationSplits) {
        if (!split.accountId) {
          throw new BadRequestException(
            `El split ${split.id} no tiene cuenta asignada`,
          );
        }

        const splitAccount = await this.prisma.account.findUnique({
          where: { id: split.accountId },
          include: { currency: true },
        });

        if (!splitAccount) {
          throw new NotFoundException(`No existe la cuenta ${split.accountId}`);
        }

        if (!splitAccount.isActive || splitAccount.status !== 'ACTIVE') {
          throw new BadRequestException(
            `La cuenta ${splitAccount.name} está inactiva o reemplazada`,
          );
        }

        if (splitAccount.currencyId !== split.targetCurrencyId) {
          throw new BadRequestException(
            `La cuenta ${splitAccount.name} no coincide con la moneda del split (${split.targetCurrency.code})`,
          );
        }

        if (splitAccount.balance < split.amount) {
          throw new BadRequestException(
            `La cuenta ${splitAccount.name} no tiene saldo suficiente para entregar ${split.amount}`,
          );
        }

        const newSplitBalance = this.round2(
          splitAccount.balance - split.amount,
        );

        await this.prisma.account.update({
          where: { id: splitAccount.id },
          data: {
            balance: newSplitBalance,
          },
        });

        await this.prisma.accountMovement.create({
          data: {
            accountId: splitAccount.id,
            operationId: id,
            type: 'EXIT',
            amount: split.amount,
            valueCOP: split.valueCOP ?? split.amount,
            description: `Salida split ${split.targetCurrency.code} por operación ${operation.code}`,
          },
        });
      }

      const updatedOperation = await this.prisma.operation.update({
        where: { id },
        data: {
          amountTargetFinal,
          realProfitCOP,
          completedAt: new Date(),
          statusId: completedStatus.id,
          ...(operation.paymentMode !== 'PENDING' && {
            paymentStatus: OperationPaymentStatus.PAID,
            amountPaid: operation.amountSource,
            pendingAmount: 0,
          }),
        },
        include: {
          client: true,
          type: true,
          status: true,
          sourceCurrency: true,
          targetCurrency: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      });

      await this.auditLogsService.createLog({
        userId: completeOperationDto.confirmedByUserId!,
        action: 'COMPLETE_SPLIT_OPERATION',
        entityType: 'Operation',
        entityId: updatedOperation.id,
        description: `Operación split completada. Monto final: ${updatedOperation.amountTargetFinal}`,
      });

      return updatedOperation;
    }

    const targetAccountId =
      completeOperationDto.accountId ?? operation.targetAccountId;

    if (targetAccountId) {
      const account = await this.prisma.account.findUnique({
        where: { id: targetAccountId },
      });

      if (!account) {
        throw new NotFoundException(
          `No existe la cuenta con id ${targetAccountId}`,
        );
      }

      if (!account.isActive || account.status !== 'ACTIVE') {
        throw new BadRequestException(
          'No se puede usar una cuenta inactiva o reemplazada para completar operaciones',
        );
      }

      if (account.currencyId !== operation.targetCurrencyId) {
        throw new BadRequestException(
          `La cuenta ${account.name} no coincide con la moneda destino de la operación`,
        );
      }

      if (account.balance < amountTargetFinal) {
        throw new BadRequestException(
          `La cuenta ${account.name} no tiene saldo suficiente para entregar ${amountTargetFinal}`,
        );
      }

      const newExitBalance = this.round2(account.balance - amountTargetFinal);

      await this.prisma.account.update({
        where: { id: account.id },
        data: {
          balance: newExitBalance,
        },
      });

      await this.prisma.accountMovement.create({
        data: {
          accountId: account.id,
          operationId: id,
          type: 'EXIT',
          amount: amountTargetFinal,
          valueCOP:
            operation.targetCurrency.code === 'COP'
              ? amountTargetFinal
              : this.round2(amountTargetFinal * operation.marketRate),
          description: `Salida de dinero en operación ${operation.code}`,
        },
      });
    }

    const updatedOperation = await this.prisma.operation.update({
      where: { id },
      data: {
        amountTargetFinal,
        realProfitCOP,
        completedAt: new Date(),
        statusId: completedStatus.id,
        ...(operation.paymentMode !== 'PENDING' && {
          paymentStatus: OperationPaymentStatus.PAID,
          amountPaid: operation.amountSource,
          pendingAmount: 0,
        }),
      },
      include: {
        client: true,
        type: true,
        status: true,
        sourceCurrency: true,
        targetCurrency: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    await this.auditLogsService.createLog({
      userId: completeOperationDto.confirmedByUserId!,
      action: 'COMPLETE_OPERATION',
      entityType: 'Operation',
      entityId: updatedOperation.id,
      description: `Operación completada. Monto final: ${updatedOperation.amountTargetFinal}`,
    });

    return updatedOperation;
  }

  async completeVerified(
    id: number,
    completeOperationDto: CompleteOperationDto,
  ) {
    const operation = await this.prisma.operation.findUnique({
      where: { id },
      include: {
        status: true,
        targetCurrency: true,
      },
    });

    if (!operation) {
      throw new NotFoundException(`No existe la operación con id ${id}`);
    }

    if (operation.status.name !== 'Verificada') {
      throw new BadRequestException(
        'Solo se pueden completar operaciones previamente verificadas',
      );
    }

    const completedStatus = await this.prisma.operationStatus.findFirst({
      where: { name: 'Completada' },
    });

    if (!completedStatus) {
      throw new BadRequestException(
        'No existe el estado Completada en OperationStatus',
      );
    }

    const account = await this.prisma.account.findUnique({
      where: { id: completeOperationDto.accountId },
    });

    if (!account) {
      throw new NotFoundException(
        `No existe la cuenta con id ${completeOperationDto.accountId}`,
      );
    }

    if (!account.isActive || account.status !== 'ACTIVE') {
      throw new BadRequestException(
        'No se puede usar una cuenta inactiva o reemplazada para completar operaciones',
      );
    }

    const amountTargetFinal = this.round2(
      completeOperationDto.amountTargetFinal,
    );

    if (account.balance < amountTargetFinal) {
      throw new BadRequestException(
        `La cuenta ${account.name} no tiene saldo suficiente`,
      );
    }

    const newBalance = this.round2(account.balance - amountTargetFinal);

    const updatedOperation = await this.prisma.operation.update({
      where: { id },
      data: {
        statusId: completedStatus.id,
        amountTargetFinal,
        completedAt: new Date(),
        verifiedAt: operation.verifiedAt ?? new Date(),
        realProfitCOP: this.round2(
          amountTargetFinal - operation.amountTargetEstimated,
        ),
      },
      include: {
        client: true,
        type: true,
        status: true,
        sourceCurrency: true,
        targetCurrency: true,
        createdBy: true,
      },
    });

    await this.prisma.account.update({
      where: { id: account.id },
      data: {
        balance: newBalance,
      },
    });

    await this.prisma.accountMovement.create({
      data: {
        accountId: account.id,
        operationId: id,
        type: 'EXIT',
        amount: amountTargetFinal,
        valueCOP: amountTargetFinal,
        description: `Salida de dinero por operación verificada ${operation.code}`,
      },
    });

    await this.auditLogsService.createLog({
      userId: completeOperationDto.confirmedByUserId!,
      action: 'COMPLETE_VERIFIED_OPERATION',
      entityType: 'Operation',
      entityId: id,
      description: `Operación verificada completada. Monto final: ${amountTargetFinal}`,
    });

    return updatedOperation;
  }

  async getSummary(id: number) {
    const operation = await this.prisma.operation.findUnique({
      where: { id },
      include: {
        client: true,
        type: true,
        status: true,
        sourceCurrency: true,
        targetCurrency: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        movements: {
          include: {
            account: {
              include: {
                currency: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        splits: {
          include: {
            targetCurrency: true,
            account: true,
          },
        },
        payments: {
          include: {
            paymentMethod: true,
            account: true,
            currency: true,
          },
        },
      },
    });

    if (!operation) {
      throw new NotFoundException(`No se encontró la operación con id ${id}`);
    }

    const totalEntries = this.round2(
      operation.movements
        .filter((movement) => movement.type === 'ENTRY')
        .reduce((sum, movement) => sum + movement.amount, 0),
    );

    const totalExits = this.round2(
      operation.movements
        .filter((movement) => movement.type === 'EXIT')
        .reduce((sum, movement) => sum + movement.amount, 0),
    );

    const estimatedProfit =
      operation.amountTargetEstimated && operation.targetCurrency.code === 'COP'
        ? this.round2(operation.valueCOP - operation.amountTargetEstimated)
        : null;

    const sourceRateToCOP =
      operation.sourceCurrency.code === 'COP' ? 1 : operation.marketRate;

    const verifiedPaymentsTotal = this.round2(
      operation.payments.reduce((sum, payment) => {
        if (!payment.verifiedAt) return sum;

        if (payment.currencyId === operation.sourceCurrencyId) {
          return sum + payment.netAmount;
        }

        const equivalentInSource = (payment.valueCOP ?? 0) / sourceRateToCOP;

        return sum + equivalentInSource;
      }, 0),
    );

    const isImmediate = operation.paymentMode !== 'PENDING';
    const totalPagado = isImmediate
      ? operation.amountSource
      : verifiedPaymentsTotal;
    const saldoPendiente = isImmediate
      ? 0
      : this.round2(operation.amountSource - totalPagado);

    const paymentStatus = isImmediate
      ? OperationPaymentStatus.PAID
      : saldoPendiente <= 0
        ? OperationPaymentStatus.PAID
        : totalPagado > 0
          ? OperationPaymentStatus.PARTIAL
          : OperationPaymentStatus.PENDING;

    return {
      totalPagado,
      saldoPendiente: saldoPendiente > 0 ? saldoPendiente : 0,
      paymentStatus,

      operation: {
        id: operation.id,
        code: operation.code,
        paymentMode: operation.paymentMode ?? 'IMMEDIATE',
        client: operation.client?.name ?? 'Cliente sin registrar',
        type: operation.type.name,
        status: operation.status.name,
        amountSource: operation.amountSource,
        currencySource: operation.sourceCurrency.code,
        currencyTarget: operation.targetCurrency.code,
        marketRate: operation.marketRate,
        operationalPercent: operation.operationalPercent,
        effectiveRate: operation.effectiveRate,
        valueCOP: operation.valueCOP,
        amountTargetEstimated: operation.amountTargetEstimated,
        amountTargetFinal: operation.amountTargetFinal,
        estimatedProfit,
        realProfit: operation.realProfitCOP,
        createdAt: operation.createdAt,
        operationDate: operation.operationDate,
        completedAt: operation.completedAt,
      },
      movements: operation.movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amount: movement.amount,
        valueCOP: movement.valueCOP,
        equivalentInSource:
          movement.valueCOP && sourceRateToCOP > 0
            ? this.round2(movement.valueCOP / sourceRateToCOP)
            : movement.amount,
        description: movement.description,
        createdAt: movement.createdAt,
        currency: movement.account?.currency
          ? {
              id: movement.account.currency.id,
              code: movement.account.currency.code,
              name: movement.account.currency.name,
            }
          : null,
        account: movement.account
          ? {
              id: movement.account.id,
              name: movement.account.name,
              country: movement.account.country,
              platform: movement.account.platform,
              identifier: movement.account.identifier,
              currency: movement.account.currency?.code ?? null,
            }
          : null,
      })),
      splits: operation.splits.map((split) => ({
        id: split.id,
        targetCurrency: split.targetCurrency.code,
        targetCurrencyName: split.targetCurrency.name,
        account: split.account
          ? {
              id: split.account.id,
              name: split.account.name,
              platform: split.account.platform,
            }
          : null,
        amount: split.amount,
        valueCOP: split.valueCOP,
        destination: split.destination,
        notes: split.notes,
      })),
      payments: operation.payments.map((payment) => {
        const equivalentInSource =
          payment.currencyId === operation.sourceCurrencyId
            ? payment.netAmount
            : this.round2((payment.valueCOP ?? 0) / sourceRateToCOP);

        return {
          id: payment.id,
          amount: payment.amount,
          commission: payment.commission,
          netAmount: payment.netAmount,
          valueCOP: payment.valueCOP,
          paymentDate: payment.paymentDate,
          rateToCOP: payment.rateToCOP,
          notes: payment.notes,
          equivalentInSource,

          account: payment.account
            ? {
                id: payment.account.id,
                name: payment.account.name,
              }
            : null,

          currency: payment.currency
            ? {
                id: payment.currency.id,
                code: payment.currency.code,
              }
            : null,

          paymentMethod: payment.paymentMethod
            ? {
                id: payment.paymentMethod.id,
                name: payment.paymentMethod.name,
                type: payment.paymentMethod.type,
                commissionPercent: payment.paymentMethod.commissionPercent,
              }
            : null,
        };
      }),
      totals: {
        totalEntries,
        totalExits,
        movementsCount: operation.movements.length,
      },
    };
  }

  async getGlobalSummary() {
    const operations = await this.prisma.operation.findMany({
      include: {
        status: true,
        sourceCurrency: true,
        targetCurrency: true,
      },
    });

    const totalOperations = operations.length;

    const completedOperations = operations.filter(
      (operation) => operation.status.name === 'Completada',
    ).length;

    const pendingOperations = operations.filter(
      (operation) => operation.status.name !== 'Completada',
    ).length;

    const totalVolumeCOP = this.round2(
      operations.reduce((sum, operation) => {
        return sum + (operation.valueCOP ?? 0);
      }, 0),
    );

    const totalEstimatedProfitCOP = this.round2(
      operations.reduce((sum, operation) => {
        return sum + (operation.estimatedProfitCOP ?? 0);
      }, 0),
    );

    const totalRealProfitCOP = this.round2(
      operations.reduce((sum, operation) => {
        return sum + (operation.realProfitCOP ?? 0);
      }, 0),
    );

    return {
      totalOperations,
      completedOperations,
      pendingOperations,
      totalVolumeCOP,
      totalEstimatedProfitCOP,
      totalRealProfitCOP,
    };
  }

  async getBalanceByCurrencies() {
    const currencies = await this.prisma.currency.findMany({
      include: {
        marketRates: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
        sourceOperations: true,
      },
      orderBy: {
        code: 'asc',
      },
    });

    return currencies.map((currency) => {
      const latestRate = currency.marketRates[0];
      const marketRate = latestRate ? latestRate.rateToCOP : 0;
      const operationalPercent = currency.defaultOperationalPercent || 0;
      const effectiveRate = this.round2(
        marketRate * (1 - operationalPercent / 100),
      );

      const totalAmountSource = this.round2(
        currency.sourceOperations.reduce(
          (sum, operation) => sum + operation.amountSource,
          0,
        ),
      );

      const estimatedValueCOP = this.round2(totalAmountSource * effectiveRate);

      return {
        currencyId: currency.id,
        code: currency.code,
        name: currency.name,
        totalAmountSource,
        marketRate,
        operationalPercent,
        effectiveRate,
        estimatedValueCOP,
      };
    });
  }
}
