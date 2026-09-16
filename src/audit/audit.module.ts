import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditLogsInterceptor } from './audit-logs.interceptor';
import { AuditLogListener } from './audit-logs.listener';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [AuditController],
  providers: [AuditService, AuditLogsInterceptor, AuditLogListener],
  exports: [AuditService, AuditLogsInterceptor],
})
export class AuditModule {}
