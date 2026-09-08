import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { MenuAdminController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  imports: [IdentityModule],
  controllers: [MenuAdminController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
