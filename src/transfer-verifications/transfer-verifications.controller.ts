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
  ) {
    return this.transferVerificationsService.confirm(id, dto);
  }
}
