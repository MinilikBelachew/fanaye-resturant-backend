import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Response,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
import { SyncService, PullCloudDto, SyncConfigDto, FirstTimeSetupDto } from './sync.service';

@ApiTags('Sync')
@Controller({
  path: 'sync',
  version: '1',
})
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * SIGN-IN SCREEN:
   * First-Time Setup on this PC: Connects to Cloud with Manager Email & Password,
   * downloads the full restaurant database & images, and logs them in immediately!
   */
  @Post('first-time-setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'First-time setup: Authenticate with Cloud, provision restaurant & login' })
  async firstTimeSetup(
    @Body() body: FirstTimeSetupDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    return this.syncService.firstTimeSetup(body, res);
  }

  /**
   * CLOUD SERVER ENDPOINT:
   * Exports full tenant database archive so a local offline PC can fetch it.
   */
  @Get('export-tenant/:tenantId')
  @ApiOperation({ summary: 'Stream complete tenant archive for initial offline provisioning' })
  async exportTenant(
    @Param('tenantId') tenantId: string,
    @Response() res: ExpressResponse,
  ) {
    const { filename, sqlGzBuffer } = await this.syncService.exportTenantData(tenantId);
    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': sqlGzBuffer.length,
    });
    res.send(sqlGzBuffer);
  }

  /**
   * LOCAL OFFLINE NODE:
   * 1-Click Pull: Connects to Cloud, fetches all data & caches Cloudinary images locally.
   */
  @Post('pull-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '1-Click initial setup: Pull all tenant data & images from Cloud' })
  async pullAll(@Body() body: PullCloudDto) {
    return this.syncService.pullAllFromCloud(body);
  }

  /**
   * CLOUD SERVER ENDPOINT:
   * Receives push of daily orders and bills from offline nodes.
   */
  @Post('push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive order and billing sync data from offline restaurant' })
  async receivePush(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() payload: { tenantId?: string; orders?: any[]; bills?: any[] },
  ) {
    const tenantId = payload.tenantId || headerTenantId;
    return this.syncService.handleIncomingPush(tenantId, payload);
  }

  /**
   * LOCAL OFFLINE NODE:
   * Triggers an immediate push/pull sync cycle.
   */
  @Post('trigger-now')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger a sync cycle from the local machine' })
  async triggerManualSync() {
    return this.syncService.runOfflineSyncCycle();
  }

  /**
   * Status summary for the UI
   */
  @Get('status')
  @ApiOperation({ summary: 'Get current offline sync mode status' })
  async getStatus() {
    return this.syncService.getSyncStatus();
  }

  /**
   * Update sync connection settings
   */
  @Post('configure')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update cloud sync connection credentials' })
  async configure(@Body() body: SyncConfigDto) {
    return this.syncService.updateConfig(body);
  }
}
