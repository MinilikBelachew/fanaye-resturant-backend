import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  Response,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import {
  SyncService,
  PullCloudDto,
  SyncConfigDto,
  FirstTimeSetupDto,
  SyncPushPayload,
} from './sync.service';

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
  @ApiOperation({
    summary:
      'First-time setup: Authenticate with Cloud, provision restaurant & login',
  })
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Stream complete tenant archive for initial offline provisioning',
  })
  async exportTenant(
    @Param('tenantId') tenantId: string,
    @Request() req: ExpressRequest,
    @Response() res: ExpressResponse,
  ) {
    const { nodeSyncToken, signedLicenseHeader } =
      await this.syncService.authorizeRemoteTenantSync(req, tenantId, true);
    const { filename, sqlGzBuffer } =
      await this.syncService.exportTenantData(tenantId);
    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': sqlGzBuffer.length,
      ...(nodeSyncToken ? { 'x-sync-node-token': nodeSyncToken } : {}),
      ...(signedLicenseHeader
        ? { 'x-desktop-license': signedLicenseHeader }
        : {}),
    });
    res.send(sqlGzBuffer);
  }

  /**
   * LOCAL OFFLINE NODE:
   * 1-Click Pull: Connects to Cloud, fetches all data & caches Cloudinary images locally.
   */
  @Post('pull-all')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '1-Click initial setup: Pull all tenant data & images from Cloud',
  })
  async pullAll(@Request() req: any, @Body() body: PullCloudDto) {
    await this.syncService.requireLocalAdmin(req?.user?.id);
    return this.syncService.pullAllFromCloud(body);
  }

  /**
   * CLOUD SERVER ENDPOINT:
   * Receives push of daily orders and bills from offline nodes.
   */
  @Post('push')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive order and billing sync data from offline restaurant',
  })
  async receivePush(
    @Request() req: ExpressRequest,
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() payload: SyncPushPayload,
  ) {
    const tenantId = payload.tenantId || headerTenantId;
    await this.syncService.authorizeRemoteTenantSync(req, tenantId);
    return this.syncService.handleIncomingPush(tenantId, payload);
  }

  /**
   * LOCAL OFFLINE NODE:
   * Triggers an immediate push/pull sync cycle.
   */
  @Post('trigger-now')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually trigger a sync cycle from the local machine',
  })
  async triggerManualSync(@Request() req: any) {
    await this.syncService.requireLocalAdmin(req?.user?.id);
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
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update cloud sync connection credentials' })
  async configure(@Request() req: any, @Body() body: SyncConfigDto) {
    await this.syncService.requireLocalAdmin(req?.user?.id);
    return this.syncService.updateConfig(body);
  }
}
