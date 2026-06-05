import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Roles } from '../auth/roles.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('financial')
  @Roles('ADMIN', 'OPERATOR')
  getFinancialDashboard() {
    return this.dashboardService.getFinancialDashboard();
  }

  @Get('daily-report')
  @Roles('ADMIN', 'OPERATOR')
  getDailyReport() {
    return this.dashboardService.getDailyReport();
  }
  @Get('report')
  @Roles('ADMIN', 'OPERATOR')
  getReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.getReport(from, to);
  }
  @Get('balance-by-country')
  getBalanceByCountry() {
    return this.dashboardService.getBalanceByCountry();
  }
  @Get('global-balance')
  getGlobalBalance() {
    return this.dashboardService.getGlobalBalance();
  }
  @Get('top-accounts')
  getTopAccounts() {
    return this.dashboardService.getTopAccounts();
  }
  @Get('profit-summary')
  getProfitSummary() {
    return this.dashboardService.getProfitSummary();
  }
  @Get('financial-alerts')
  getFinancialAlerts() {
    return this.dashboardService.getFinancialAlerts();
  }
  @Get('transfer-alerts')
  getTransferAlerts() {
    return this.dashboardService.getTransferAlerts();
  }
}
