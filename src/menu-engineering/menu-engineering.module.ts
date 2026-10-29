import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { MenuEngineeringController } from './menu-engineering.controller';
import { MenuEngineeringService } from './menu-engineering.service';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [MenuEngineeringController],
  providers: [MenuEngineeringService],
  exports: [MenuEngineeringService],
})
export class MenuEngineeringModule {}
