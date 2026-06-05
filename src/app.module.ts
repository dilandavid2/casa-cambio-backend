import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CurrenciesModule } from './currencies/currencies.module';
import { MarketRatesModule } from './market-rates/market-rates.module';
import { OperationsModule } from './operations/operations.module';
import { PrismaModule } from './prisma/prisma.module';
import { AccountsModule } from './accounts/accounts.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './auth/roles.guard';
import { AccountMovementsModule } from './account-movements/account-movements.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TransferVerificationsModule } from './transfer-verifications/transfer-verifications.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';

@Module({
  imports: [
    PrismaModule,
    CurrenciesModule,
    MarketRatesModule,
    OperationsModule,
    AccountsModule,
    AuditLogsModule,
    AccountMovementsModule,
    DashboardModule,
    TransferVerificationsModule,
    PaymentMethodsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
