import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private round2(value: number) {
    return Number(value.toFixed(2));
  }

  async getFinancialDashboard() {
    const operations = await this.prisma.operation.findMany({
      include: {
        status: true,
        client: true,
      },
    });

    const accounts = await this.prisma.account.findMany({
      where: {
        isActive: true,
        status: 'ACTIVE',
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
    });

    const totalOperations = operations.length;

    const completedOperations = operations.filter(
      (operation) => operation.status.name === 'Completada',
    ).length;

    const pendingOperations = operations.filter(
      (operation) => operation.status.name !== 'Completada',
    ).length;

    const totalValueCOP = operations.reduce((sum, operation) => {
      return sum + (operation.valueCOP ?? 0);
    }, 0);

    const totalRealProfitCOP = operations.reduce((sum, operation) => {
      return sum + (operation.realProfitCOP ?? 0);
    }, 0);

    const totalAccountsCOP = accounts.reduce((sum, account) => {
      const latestRate = account.currency.marketRates[0];
      const marketRate = latestRate ? latestRate.rateToCOP : 0;

      const operationalPercent =
        account.currency.defaultOperationalPercent ?? 0;

      const effectiveRate =
        account.currency.allowsOperationalCost && operationalPercent > 0
          ? marketRate - marketRate * (operationalPercent / 100)
          : marketRate;

      return sum + account.balance * effectiveRate;
    }, 0);

    const groupedCurrencies = accounts.reduce(
      (acc, account) => {
        const currencyCode = account.currency.code;
        const latestRate = account.currency.marketRates[0];
        const marketRate = latestRate ? latestRate.rateToCOP : 0;

        const operationalPercent =
          account.currency.defaultOperationalPercent ?? 0;

        const effectiveRate =
          account.currency.allowsOperationalCost && operationalPercent > 0
            ? marketRate - marketRate * (operationalPercent / 100)
            : marketRate;

        if (!acc[currencyCode]) {
          acc[currencyCode] = {
            currencyId: account.currency.id,
            code: account.currency.code,
            name: account.currency.name,
            accountsCount: 0,
            totalBalance: 0,
            marketRate,
            operationalPercent,
            effectiveRate,
            valueCOP: 0,
          };
        }

        acc[currencyCode].accountsCount += 1;
        acc[currencyCode].totalBalance += account.balance;
        acc[currencyCode].valueCOP += account.balance * effectiveRate;

        return acc;
      },
      {} as Record<
        string,
        {
          currencyId: number;
          code: string;
          name: string;
          accountsCount: number;
          totalBalance: number;
          marketRate: number;
          operationalPercent: number;
          effectiveRate: number;
          valueCOP: number;
        }
      >,
    );

    const topCurrencies = Object.values(groupedCurrencies)
      .map((currency) => ({
        ...currency,
        totalBalance: this.round2(currency.totalBalance),
        marketRate: this.round2(currency.marketRate),
        effectiveRate: this.round2(currency.effectiveRate),
        valueCOP: this.round2(currency.valueCOP),
      }))
      .sort((a, b) => b.valueCOP - a.valueCOP)
      .slice(0, 3);

    const lastOperations = operations
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .map((operation) => ({
        id: operation.id,
        code: operation.code,
        client: operation.client.name,
        status: operation.status.name,
        amountSource: operation.amountSource,
        valueCOP: operation.valueCOP,
        realProfitCOP: operation.realProfitCOP,
        createdAt: operation.createdAt,
        completedAt: operation.completedAt,
      }));

    const profitMargin =
      totalValueCOP > 0
        ? this.round2((totalRealProfitCOP / totalValueCOP) * 100)
        : 0;

    return {
      operations: {
        totalOperations,
        completedOperations,
        pendingOperations,
        totalValueCOP: this.round2(totalValueCOP),
        totalRealProfitCOP: this.round2(totalRealProfitCOP),
      },
      accounts: {
        activeAccounts: accounts.length,
        totalAccountsCOP: this.round2(totalAccountsCOP),
      },
      general: {
        estimatedBusinessValueCOP: this.round2(totalAccountsCOP),
        totalProfitCOP: this.round2(totalRealProfitCOP),
        profitMargin,
      },
      topCurrencies,
      lastOperations,
    };
  }
  async getDailyReport() {
    const today = new Date();

    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const movements = await this.prisma.accountMovement.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        account: {
          include: {
            currency: true,
          },
        },
        operation: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const totalEntries = movements
      .filter((movement) => movement.type === 'ENTRY')
      .reduce((sum, movement) => sum + movement.amount, 0);

    const totalExits = movements
      .filter((movement) => movement.type === 'EXIT')
      .reduce((sum, movement) => sum + movement.amount, 0);

    const totalEntriesCOP = movements
      .filter((movement) => movement.type === 'ENTRY')
      .reduce((sum, movement) => sum + movement.valueCOP, 0);

    const totalExitsCOP = movements
      .filter((movement) => movement.type === 'EXIT')
      .reduce((sum, movement) => sum + movement.valueCOP, 0);

    const operations = await this.prisma.operation.findMany({
      where: {
        completedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    const totalProfitCOP = operations.reduce(
      (sum, op) => sum + (op.realProfitCOP ?? 0),
      0,
    );
    return {
      date: today.toISOString().split('T')[0],
      totals: {
        totalEntries: this.round2(totalEntries),
        totalExits: this.round2(totalExits),
        totalEntriesCOP: this.round2(totalEntriesCOP),
        totalExitsCOP: this.round2(totalExitsCOP),
        netFlowCOP: this.round2(totalEntriesCOP - totalExitsCOP),
        profitCOP: this.round2(totalProfitCOP),
        movementsCount: movements.length,
      },
      movements: movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amount: movement.amount,
        valueCOP: movement.valueCOP,
        description: movement.description,
        createdAt: movement.createdAt,
        account: {
          id: movement.account.id,
          name: movement.account.name,
          currency: movement.account.currency.code,
          country: movement.account.country,
        },
        operation: movement.operation
          ? {
              id: movement.operation.id,
              code: movement.operation.code,
            }
          : null,
      })),
    };
  }
  async getReport(from?: string, to?: string) {
    const startDate = from ? new Date(from) : new Date();
    startDate.setHours(0, 0, 0, 0);

    const endDate = to ? new Date(to) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const movements = await this.prisma.accountMovement.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        account: {
          include: {
            currency: true,
          },
        },
        operation: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const totalEntries = movements
      .filter((movement) => movement.type === 'ENTRY')
      .reduce((sum, movement) => sum + movement.amount, 0);

    const totalExits = movements
      .filter((movement) => movement.type === 'EXIT')
      .reduce((sum, movement) => sum + movement.amount, 0);

    const totalEntriesCOP = movements
      .filter((movement) => movement.type === 'ENTRY')
      .reduce((sum, movement) => sum + movement.valueCOP, 0);

    const totalExitsCOP = movements
      .filter((movement) => movement.type === 'EXIT')
      .reduce((sum, movement) => sum + movement.valueCOP, 0);

    const operations = await this.prisma.operation.findMany({
      where: {
        completedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const totalProfitCOP = operations.reduce(
      (sum, op) => sum + (op.realProfitCOP ?? 0),
      0,
    );

    return {
      from: startDate.toISOString().split('T')[0],
      to: endDate.toISOString().split('T')[0],
      totals: {
        totalEntries: this.round2(totalEntries),
        totalExits: this.round2(totalExits),
        totalEntriesCOP: this.round2(totalEntriesCOP),
        totalExitsCOP: this.round2(totalExitsCOP),
        netFlowCOP: this.round2(totalEntriesCOP - totalExitsCOP),
        profitCOP: this.round2(totalProfitCOP),
        movementsCount: movements.length,
        operationsCount: operations.length,
      },
      movements: movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amount: movement.amount,
        valueCOP: movement.valueCOP,
        description: movement.description,
        createdAt: movement.createdAt,
        account: {
          id: movement.account.id,
          name: movement.account.name,
          currency: movement.account.currency.code,
          country: movement.account.country,
        },
        operation: movement.operation
          ? {
              id: movement.operation.id,
              code: movement.operation.code,
            }
          : null,
      })),
    };
  }
  async getBalanceByCountry() {
    const accounts = await this.prisma.account.findMany({
      include: {
        currency: true,
      },
    });

    const resultMap = {};

    for (const acc of accounts) {
      const key = `${acc.country}-${acc.currency.code}`;

      if (!resultMap[key]) {
        resultMap[key] = {
          country: acc.country,
          currency: acc.currency.code,
          totalBalance: 0,
        };
      }

      resultMap[key].totalBalance += acc.balance;
    }

    return Object.values(resultMap);
  }
  async getGlobalBalance() {
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
    });

    let totalEquivalentCOP = 0;

    const details: {
      accountId: number;
      country: string;
      currency: string;
      balance: number;
      rateToCOP: number;
      equivalentCOP: number;
    }[] = [];

    for (const acc of accounts) {
      const latestRate = acc.currency.marketRates[0];

      const rateUsed =
        acc.currency.code === 'COP' ? 1 : latestRate ? latestRate.rateToCOP : 0;

      const equivalentCOP =
        acc.currency.code === 'COP' ? acc.balance : acc.balance * rateUsed;

      totalEquivalentCOP += equivalentCOP;

      details.push({
        accountId: acc.id,
        country: acc.country,
        currency: acc.currency.code,
        balance: this.round2(acc.balance),
        rateToCOP: this.round2(rateUsed),
        equivalentCOP: this.round2(equivalentCOP),
      });
    }

    return {
      totalEquivalentCOP: this.round2(totalEquivalentCOP),
      details,
    };
  }
  async getTopAccounts() {
    const globalBalance = await this.getGlobalBalance();

    return {
      totalAccounts: globalBalance.details.length,
      topAccounts: globalBalance.details
        .sort((a, b) => b.equivalentCOP - a.equivalentCOP)
        .slice(0, 5),
    };
  }
  async getProfitSummary() {
    const operations = await this.prisma.operation.findMany({
      where: {
        status: {
          name: 'Completada',
        },
      },
      include: {
        sourceCurrency: true,
        targetCurrency: true,
        client: true,
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    const totalProfitCOP = operations.reduce(
      (sum, operation) => sum + (operation.realProfitCOP ?? 0),
      0,
    );

    const profitableOperations = operations.filter(
      (operation) => (operation.realProfitCOP ?? 0) > 0,
    );

    const mostProfitableOperation = [...operations].sort(
      (a, b) => (b.realProfitCOP ?? 0) - (a.realProfitCOP ?? 0),
    )[0];

    const groupedByCurrency = operations.reduce(
      (acc, operation) => {
        const key = `${operation.sourceCurrency.code}-${operation.targetCurrency.code}`;

        if (!acc[key]) {
          acc[key] = {
            pair: key,
            operationsCount: 0,
            totalProfitCOP: 0,
          };
        }

        acc[key].operationsCount += 1;
        acc[key].totalProfitCOP += operation.realProfitCOP ?? 0;

        return acc;
      },
      {} as Record<
        string,
        {
          pair: string;
          operationsCount: number;
          totalProfitCOP: number;
        }
      >,
    );

    return {
      totals: {
        completedOperations: operations.length,
        profitableOperations: profitableOperations.length,
        totalProfitCOP: this.round2(totalProfitCOP),
        averageProfitCOP:
          operations.length > 0
            ? this.round2(totalProfitCOP / operations.length)
            : 0,
      },
      mostProfitableOperation: mostProfitableOperation
        ? {
            id: mostProfitableOperation.id,
            code: mostProfitableOperation.code,
            client: mostProfitableOperation.client.name,
            sourceCurrency: mostProfitableOperation.sourceCurrency.code,
            targetCurrency: mostProfitableOperation.targetCurrency.code,
            amountSource: mostProfitableOperation.amountSource,
            amountTargetFinal: mostProfitableOperation.amountTargetFinal,
            realProfitCOP: mostProfitableOperation.realProfitCOP ?? 0,
            completedAt: mostProfitableOperation.completedAt,
          }
        : null,
      profitByCurrencyPair: Object.values(groupedByCurrency).map((item) => ({
        ...item,
        totalProfitCOP: this.round2(item.totalProfitCOP),
      })),
    };
  }
  async getFinancialAlerts() {
    const accounts = await this.prisma.account.findMany({
      include: {
        currency: true,
      },
    });

    const completedOperations = await this.prisma.operation.findMany({
      where: {
        status: {
          name: 'Completada',
        },
      },
      include: {
        client: true,
        sourceCurrency: true,
        targetCurrency: true,
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    const negativeAccounts = accounts
      .filter((account) => account.balance < 0)
      .map((account) => ({
        accountId: account.id,
        name: account.name,
        country: account.country,
        currency: account.currency.code,
        balance: account.balance,
        alert: 'Cuenta con saldo negativo',
      }));

    const highBalanceAccounts = accounts
      .filter((account) => account.balance > 100000000)
      .map((account) => ({
        accountId: account.id,
        name: account.name,
        country: account.country,
        currency: account.currency.code,
        balance: account.balance,
        alert: 'Cuenta con saldo muy alto',
      }));

    const lossOperations = completedOperations
      .filter((operation) => (operation.realProfitCOP ?? 0) < 0)
      .map((operation) => ({
        operationId: operation.id,
        code: operation.code,
        client: operation.client.name,
        pair: `${operation.sourceCurrency.code}-${operation.targetCurrency.code}`,
        realProfitCOP: operation.realProfitCOP,
        completedAt: operation.completedAt,
        alert: 'Operación con pérdida',
      }));

    return {
      summary: {
        negativeAccounts: negativeAccounts.length,
        highBalanceAccounts: highBalanceAccounts.length,
        lossOperations: lossOperations.length,
        totalAlerts:
          negativeAccounts.length +
          highBalanceAccounts.length +
          lossOperations.length,
      },
      alerts: {
        negativeAccounts,
        highBalanceAccounts,
        lossOperations,
      },
    };
  }
  async getTransferAlerts() {
    const pendientes = await this.prisma.transferVerification.findMany({
      where: {
        status: 'PENDING',
      },
      include: {
        operation: {
          include: {
            client: true,
          },
        },
      },
    });

    const totalPendientes = pendientes.length;

    const clientesMap = new Map<
      string,
      {
        cliente: string;
        cantidad: number;
      }
    >();

    for (const item of pendientes) {
      const nombre = item.operation?.client?.name || 'Cliente desconocido';

      if (!clientesMap.has(nombre)) {
        clientesMap.set(nombre, {
          cliente: nombre,
          cantidad: 0,
        });
      }

      clientesMap.get(nombre)!.cantidad++;
    }

    const clientesCriticos = Array.from(clientesMap.values()).filter(
      (c) => c.cantidad >= 3,
    );

    return {
      alertaGlobal:
        totalPendientes >= 10
          ? `Hay ${totalPendientes} transferencias pendientes`
          : null,

      clientesCriticos,
    };
  }
}
