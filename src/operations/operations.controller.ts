import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { OperationsService } from './operations.service';
import { CreateOperationDto } from './dto/create-operation.dto';
import { UpdateOperationDto } from './dto/update-operation.dto';
import { CompleteOperationDto } from './dto/complete-operation.dto';
import { AddOperationPaymentDto } from './dto/add-operation-payment.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Post('estimate')
  @Roles('ADMIN', 'OPERATOR')
  estimate(
    @Body()
    body: {
      sourceCurrencyId: number;
      targetCurrencyId: number;
      amountSource: number;
    },
  ) {
    return this.operationsService.estimate(body);
  }

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  create(@Body() createOperationDto: CreateOperationDto) {
    return this.operationsService.create(createOperationDto);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR')
  findAll() {
    return this.operationsService.findAll();
  }

  @Get('balance/currencies')
  @Roles('ADMIN', 'OPERATOR')
  getBalanceByCurrencies() {
    return this.operationsService.getBalanceByCurrencies();
  }

  @Get('summary/global')
  @Roles('ADMIN', 'OPERATOR')
  getGlobalSummary() {
    return this.operationsService.getGlobalSummary();
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.operationsService.findOne(id);
  }

  @Patch(':id/complete')
  @Roles('ADMIN', 'OPERATOR')
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() completeOperationDto: CompleteOperationDto,
  ) {
    return this.operationsService.complete(id, completeOperationDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOperationDto: UpdateOperationDto,
  ) {
    return this.operationsService.update(id, updateOperationDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { deleteCode: string },
  ) {
    return this.operationsService.remove(id, body.deleteCode);
  }

  @Get(':id/summary')
  @Roles('ADMIN', 'OPERATOR')
  getSummary(@Param('id') id: string) {
    return this.operationsService.getSummary(+id);
  }

  @Patch(':id/complete-verified')
  @Roles('ADMIN', 'OPERATOR')
  completeVerified(
    @Param('id', ParseIntPipe) id: number,
    @Body() completeOperationDto: CompleteOperationDto,
  ) {
    return this.operationsService.completeVerified(id, completeOperationDto);
  }

  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() dto: AddOperationPaymentDto) {
    return this.operationsService.addPayment(Number(id), dto);
  }
}
