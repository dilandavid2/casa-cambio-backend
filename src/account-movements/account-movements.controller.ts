import { Body, Controller, Get, Post } from '@nestjs/common';
import { AccountMovementsService } from './account-movements.service';
import { CreateAccountMovementDto } from './dto/create-account-movement.dto';
import { TransferAccountMovementDto } from './dto/transfer-account-movement.dto';

@Controller('account-movements')
export class AccountMovementsController {
  constructor(
    private readonly accountMovementsService: AccountMovementsService,
  ) {}

  @Post()
  create(@Body() dto: CreateAccountMovementDto) {
    return this.accountMovementsService.create(dto);
  }

  @Post('transfer')
  transfer(@Body() dto: TransferAccountMovementDto) {
    return this.accountMovementsService.transfer(dto);
  }

  @Get()
  findAll() {
    return this.accountMovementsService.findAll();
  }
}
