import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmTransferVerificationDto } from './dto/confirm-transfer-verification.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class TransferVerificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findPending() {
    return this.prisma.transferVerification.findMany({
      where: {
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        operation: {
          include: {
            client: true,
            sourceCurrency: true,
            targetCurrency: true,
          },
        },
      },
    });
  }

  async confirm(id: number, dto: ConfirmTransferVerificationDto) {
    const verification = await this.prisma.transferVerification.findUnique({
      where: { id },
      include: {
        operation: true,
      },
    });

    if (!verification) {
      throw new NotFoundException(`No existe la verificación con id ${id}`);
    }

    if (verification.status !== 'PENDING') {
      throw new BadRequestException('Esta verificación ya fue procesada');
    }

    const updated = await this.prisma.transferVerification.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        verifiedAt: new Date(),
        verifiedById: dto.verifiedById,
        notes: dto.notes,
      },
      include: {
        operation: true,
        verifiedBy: true,
      },
    });

    const originalOperation = verification.operation;

    await this.prisma.operationPayment.updateMany({
      where: {
        operationId: originalOperation.id,
        verifiedAt: null,
      },
      data: {
        verifiedAt: new Date(),
      },
    });
    const pagos = await this.prisma.operationPayment.findMany({
      where: { operationId: verification.operationId },
    });

    const totalPaidCOP = pagos.reduce(
      (sum, payment) =>
        sum + (payment.verifiedAt ? (payment.valueCOP ?? 0) : 0),
      0,
    );

    const operation = await this.prisma.operation.findUnique({
      where: { id: verification.operationId },
    });

    if (!operation) {
      throw new NotFoundException('No se encontró la operación');
    }

    const deudaBaseCOP =
      operation.valueCOP ?? operation.amountTargetEstimated ?? 0;

    const pendingAmount = Number((deudaBaseCOP - totalPaidCOP).toFixed(2));

    const paymentStatus =
      pendingAmount <= 0 ? 'PAID' : totalPaidCOP > 0 ? 'PARTIAL' : 'PENDING';

    await this.prisma.operation.update({
      where: { id: verification.operationId },
      data: {
        amountPaid: Number(totalPaidCOP.toFixed(2)),
        pendingAmount: pendingAmount > 0 ? pendingAmount : 0,
        paymentStatus,
      },
    });

    await this.auditLogsService.createLog({
      userId: dto.verifiedById,
      action: 'CONFIRM_TRANSFER_VERIFICATION',
      entityType: 'TransferVerification',
      entityId: id,
      description: `Transferencia verificada para operación ${verification.operation.code}`,
    });

    return {
      message: 'Transferencia verificada correctamente',
      verification: updated,
    };
  }
}
