import { Body, Controller, Get, Post } from '@nestjs/common';
import { AccountMovementsService } from './account-movements.service';
import { CreateAccountMovementDto } from './dto/create-account-movement.dto';
import { TransferAccountMovementDto } from './dto/transfer-account-movement.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { User } from '@prisma/client';

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
  transfer(
    @Body() dto: TransferAccountMovementDto,
    @CurrentUser() user: User,
  ) {
    return this.accountMovementsService.transfer({
      ...dto,
      createdById: user.id,
    });
  }

  @Get()
  findAll() {
    return this.accountMovementsService.findAll();
  }
}
