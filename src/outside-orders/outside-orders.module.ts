import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OutsideOrdersController } from './outside-orders.controller';
import { OutsideOrdersService } from './outside-orders.service';

@Module({
  imports: [PrismaModule, IdentityModule, RealtimeModule],
  controllers: [OutsideOrdersController],
  providers: [OutsideOrdersService],
  exports: [OutsideOrdersService],
})
export class OutsideOrdersModule {}
