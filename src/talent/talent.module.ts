import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SuperAdminTalentController } from './super-admin-talent.controller';
import { TalentController } from './talent.controller';
import { TalentService } from './talent.service';

@Module({
  imports: [PrismaModule, IdentityModule, CaslModule, RealtimeModule],
  controllers: [TalentController, SuperAdminTalentController],
  providers: [TalentService],
  exports: [TalentService],
})
export class TalentModule {}

