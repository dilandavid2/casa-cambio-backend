import { Controller, Get } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { Roles } from '../auth/roles.decorator';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles('ADMIN')
  findAll() {
    return this.auditLogsService.findAll();
  }
}
