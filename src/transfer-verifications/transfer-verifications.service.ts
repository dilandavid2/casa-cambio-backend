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
        operation: {
          sourceCurrency: {
            code: 'VES',
          },
        },
      },
      orderBy: { createdAt: 'asc' },
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

  async confirm(
    id: number,
    dto: ConfirmTransferVerificationDto,
    verifiedById: number,
  ) {
    const verification = await this.prisma.transferVerification.findUnique({
      where: { id },
      include: {
        operation: {
          include: { sourceCurrency: true },
        },
      },
    });

    if (!verification) {
      throw new NotFoundException(`No existe la verificación con id ${id}`);
    }

    if (verification.status !== 'PENDING') {
      throw new BadRequestException('Esta verificación ya fue procesada');
    }

    if (verification.operation.sourceCurrency.code !== 'VES') {
      throw new BadRequestException(
        'Este apartado solo confirma transferencias recibidas en VES',
      );
    }

    const verifiedStatus = await this.prisma.operationStatus.findFirst({
      where: { name: 'Verificada' },
    });

    if (!verifiedStatus) {
      throw new BadRequestException(
        'No existe el estado "Verificada" requerido para continuar',
      );
    }

    const verifiedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const confirmed = await tx.transferVerification.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          verifiedAt,
          verifiedById,
          notes: dto.notes,
        },
        include: {
          operation: true,
          verifiedBy: true,
        },
      });

      await tx.operationPayment.updateMany({
        where: {
          operationId: verification.operationId,
          requiresVerification: true,
          verifiedAt: null,
        },
        data: { verifiedAt },
      });

      await tx.operation.update({
        where: { id: verification.operationId },
        data: {
          statusId: verifiedStatus.id,
          verifiedAt,
        },
      });

      return confirmed;
    });

    await this.auditLogsService.createLog({
      userId: verifiedById,
      action: 'CONFIRM_TRANSFER_VERIFICATION',
      entityType: 'TransferVerification',
      entityId: id,
      description: `Transferencia VES verificada para operación ${verification.operation.code}`,
    });

    return {
      message: 'Transferencia verificada correctamente',
      verification: updated,
    };
  }
}
