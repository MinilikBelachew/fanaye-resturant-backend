import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { OwnerFinanceController } from './owner-finance.controller';

@Module({
  imports: [PrismaModule, IdentityModule, CaslModule],
  controllers: [FinanceController, OwnerFinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
