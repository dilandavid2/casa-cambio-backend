import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseIntPipe,
} from '@nestjs/common';
import { TransferVerificationsService } from './transfer-verifications.service';
import { ConfirmTransferVerificationDto } from './dto/confirm-transfer-verification.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('transfer-verifications')
export class TransferVerificationsController {
  constructor(
    private readonly transferVerificationsService: TransferVerificationsService,
  ) {}

  @Get('pending')
  @Roles('ADMIN', 'OPERATOR')
  findPending() {
    return this.transferVerificationsService.findPending();
  }

  @Patch(':id/confirm')
  @Roles('ADMIN', 'OPERATOR')
  confirm(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmTransferVerificationDto,
    @CurrentUser() user: User,
  ) {
    return this.transferVerificationsService.confirm(id, dto, user.id);
  }
}
