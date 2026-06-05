import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ReplaceAccountDto } from './dto/replace-account.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  create(@Body() createAccountDto: CreateAccountDto) {
    return this.accountsService.create(createAccountDto);
  }

  @Get('active')
  @Roles('ADMIN', 'OPERATOR')
  findActive() {
    return this.accountsService.findActive();
  }

  @Post(':id/initial-balance')
  setInitialBalance(@Param('id') id: string, @Body() body: { amount: number }) {
    return this.accountsService.setInitialBalance(+id, body.amount);
  }

  @Post('transfer')
  @Roles('ADMIN', 'OPERATOR')
  transferBetweenAccounts(
    @Body()
    body: {
      fromAccountId: number;
      toAccountId: number;
      amount: number;
      operationDate?: string;
      description?: string;
    },
  ) {
    return this.accountsService.transferBetweenAccounts(
      Number(body.fromAccountId),
      Number(body.toAccountId),
      Number(body.amount),
      body.description,
      body.operationDate,
    );
  }

  @Get('balance')
  getBalanceByAccounts() {
    return this.accountsService.getBalanceByAccounts();
  }

  @Get('balance/summary')
  @Roles('ADMIN', 'OPERATOR')
  getGroupedBalanceSummary() {
    return this.accountsService.getGroupedBalanceSummary();
  }

  @Get(':id/movements')
  @Roles('ADMIN', 'OPERATOR')
  getMovements(@Param('id', ParseIntPipe) id: number) {
    return this.accountsService.getMovements(id);
  }
  @Patch(':id/recalculate')
  recalculate(@Param('id') id: string) {
    return this.accountsService.recalculateBalance(Number(id));
  }
  @Get(':id/summary')
  @Roles('ADMIN', 'OPERATOR')
  getSummary(@Param('id', ParseIntPipe) id: number) {
    return this.accountsService.getSummary(id);
  }

  @Get(':id/ledger')
  @Roles('ADMIN', 'OPERATOR')
  getLedger(@Param('id', ParseIntPipe) id: number) {
    return this.accountsService.getLedger(id);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR')
  findAll(@Query('currencyId') currencyId?: string) {
    return this.accountsService.findAll(
      currencyId ? Number(currencyId) : undefined,
    );
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.accountsService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAccountDto: UpdateAccountDto,
  ) {
    return this.accountsService.update(id, updateAccountDto);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.accountsService.deactivate(id);
  }

  @Patch(':id/replace')
  @Roles('ADMIN')
  replace(
    @Param('id', ParseIntPipe) id: number,
    @Body() replaceAccountDto: ReplaceAccountDto,
  ) {
    return this.accountsService.replace(id, replaceAccountDto);
  }
}
