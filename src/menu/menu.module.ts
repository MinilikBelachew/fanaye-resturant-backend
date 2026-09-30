import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MenuAdminController } from './menu.controller';
import { MenuScanService } from './menu-scan.service';
import { MenuService } from './menu.service';

@Module({
  imports: [IdentityModule, ConfigModule, InventoryModule],
  controllers: [MenuAdminController],
  providers: [MenuService, MenuScanService],
  exports: [MenuService],
})
export class MenuModule {}
