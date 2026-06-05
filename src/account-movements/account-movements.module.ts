import { Module } from '@nestjs/common';
import { AccountMovementsService } from './account-movements.service';
import { AccountMovementsController } from './account-movements.controller';

@Module({
  providers: [AccountMovementsService],
  controllers: [AccountMovementsController],
})
export class AccountMovementsModule {}
