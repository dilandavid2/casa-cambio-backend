import { Module } from '@nestjs/common';
import { TransferVerificationsService } from './transfer-verifications.service';
import { TransferVerificationsController } from './transfer-verifications.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [TransferVerificationsController],
  providers: [TransferVerificationsService],
})
export class TransferVerificationsModule {}
