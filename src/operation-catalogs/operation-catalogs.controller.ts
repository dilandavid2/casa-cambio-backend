import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('operation-catalogs')
export class OperationCatalogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('types')
  findTypes() {
    return this.prisma.operationType.findMany({ orderBy: { id: 'asc' } });
  }

  @Get('statuses')
  findStatuses() {
    return this.prisma.operationStatus.findMany({ orderBy: { id: 'asc' } });
  }
}
