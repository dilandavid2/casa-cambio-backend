import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { verify } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

@Injectable()
export class CurrenciesService {
  private round2(value: number) {
    return Number(value.toFixed(2));
  }

  constructor(private readonly prisma: PrismaService) {}

  async create(createCurrencyDto: CreateCurrencyDto) {
    return this.prisma.currency.create({
      data: {
        code: createCurrencyDto.code.toUpperCase(),
        name: createCurrencyDto.name,
        isActive: createCurrencyDto.isActive ?? true,
        allowsOperationalCost: createCurrencyDto.allowsOperationalCost ?? true,
        defaultOperationalPercent:
          createCurrencyDto.defaultOperationalPercent ?? 0,
      },
    });
  }

  async findAll() {
    return this.prisma.currency.findMany({
      orderBy: {
        id: 'asc',
      },
    });
  }

  async findOne(id: number) {
    const currency = await this.prisma.currency.findUnique({
      where: { id },
    });

    if (!currency) {
      throw new NotFoundException(`No se encontró la moneda con id ${id}`);
    }

    return currency;
  }

  async update(id: number, updateCurrencyDto: UpdateCurrencyDto) {
    await this.findOne(id);

    return this.prisma.currency.update({
      where: { id },
      data: {
        ...(updateCurrencyDto.code && {
          code: updateCurrencyDto.code.toUpperCase(),
        }),
        ...(updateCurrencyDto.name !== undefined && {
          name: updateCurrencyDto.name,
        }),
        ...(updateCurrencyDto.isActive !== undefined && {
          isActive: updateCurrencyDto.isActive,
        }),
        ...(updateCurrencyDto.allowsOperationalCost !== undefined && {
          allowsOperationalCost: updateCurrencyDto.allowsOperationalCost,
        }),
        ...(updateCurrencyDto.defaultOperationalPercent !== undefined && {
          defaultOperationalPercent:
            updateCurrencyDto.defaultOperationalPercent,
        }),
      },
    });
  }

  async remove(id: number, userId: number, pin: string) {
    const currency = await this.findOne(id);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    let pinMatches = false;
    try {
      pinMatches = !!user && (await verify(user.pinHash, pin));
    } catch {
      pinMatches = false;
    }
    if (!pinMatches) throw new BadRequestException('PIN incorrecto');

    const related = await this.prisma.currency.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            accounts: true,
            marketRates: true,
            sourceOperations: true,
            targetOperations: true,
            operationSplits: true,
            operationPayments: true,
            paymentMethods: true,
            pendingOperations: true,
          },
        },
        currencyPosition: { select: { id: true } },
      },
    });
    const relationCount = Object.values(related!._count).reduce(
      (total, count) => total + count,
      0,
    );
    if (relationCount > 0 || related?.currencyPosition) {
      throw new BadRequestException(
        `No se puede borrar ${currency.code} porque tiene cuentas, operaciones o registros relacionados`,
      );
    }

    return this.prisma.currency.delete({
      where: { id },
    });
  }

  async getPosition() {
    const currencies = await this.prisma.currency.findMany({
      where: {
        isActive: true,
      },
      include: {
        accounts: {
          where: {
            isActive: true,
            status: 'ACTIVE',
          },
        },
        marketRates: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    return currencies.map((currency) => {
      const totalBalance = currency.accounts.reduce((sum, account) => {
        return sum + account.balance;
      }, 0);

      const latestRate = currency.marketRates[0];
      const marketRate = latestRate ? latestRate.rateToCOP : 0;

      const operationalPercent = currency.defaultOperationalPercent ?? 0;

      const effectiveRate =
        currency.allowsOperationalCost && operationalPercent > 0
          ? marketRate - marketRate * (operationalPercent / 100)
          : marketRate;

      return {
        currencyId: currency.id,
        code: currency.code,
        name: currency.name,
        accountsCount: currency.accounts.length,
        totalBalance: this.round2(totalBalance),
        marketRate: this.round2(marketRate),
        operationalPercent,
        effectiveRate: this.round2(effectiveRate),
        valueCOP: this.round2(totalBalance * effectiveRate),
      };
    });
  }
}
