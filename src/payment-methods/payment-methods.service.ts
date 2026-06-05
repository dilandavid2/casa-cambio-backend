import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.paymentMethod.findMany({
      where: {
        isActive: true,
      },
      include: {
        currency: true,
        account: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  }
}
