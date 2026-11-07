import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  Response,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
import { BackupService } from './backup.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { GlobalBackupSettingsDto, TelegramLinkDto } from './dto/backup.dto';

@ApiTags('Backup & Disaster Recovery')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'backup',
  version: '1',
})
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly identityContext: IdentityContextService,
  ) {}

  private async getVerifiedContext(request: any) {
    const userId = request.user?.id ? String(request.user.id) : null;
    if (!userId) {
      throw new ForbiddenException('Invalid session.');
    }
    const context = await this.identityContext.getByUserId(userId);
    if (!context) {
      throw new ForbiddenException('User context not found.');
    }
    return context;
  }

  private async getVerifiedTenantId(request: any): Promise<string> {
    const ctx = await this.getVerifiedContext(request);
    if (!['OWNER_ADMIN', 'PLATFORM_SUPER_ADMIN'].includes(ctx.roleCode)) {
      throw new ForbiddenException('Only restaurant owners can access backup settings.');
    }
    if (!ctx.tenantId) {
      throw new ForbiddenException('User is not associated with an active restaurant tenant.');
    }
    return ctx.tenantId;
  }

  // ===========================================================================
  // OWNER PORTAL ENDPOINTS
  // ===========================================================================

  @Get('my-status')
  @ApiOperation({ summary: 'Get current backup & Telegram status for active restaurant' })
  async getMyStatus(@Request() req) {
    const tenantId = await this.getVerifiedTenantId(req);
    return this.backupService.getTenantBackupStatus(tenantId);
  }

  @Post('my-telegram/link')
  @ApiOperation({ summary: 'Manually link Telegram Chat ID' })
  async linkTelegram(@Request() req, @Body() dto: TelegramLinkDto) {
    const tenantId = await this.getVerifiedTenantId(req);
    return this.backupService.linkTelegram(tenantId, dto.chatId, dto.username);
  }

  @Delete('my-telegram/unlink')
  @ApiOperation({ summary: 'Unlink Telegram automated backups' })
  async unlinkTelegram(@Request() req) {
    const tenantId = await this.getVerifiedTenantId(req);
    return this.backupService.unlinkTelegram(tenantId);
  }

  @Post('my-telegram/send-now')
  @ApiOperation({ summary: 'Export and send backup archive immediately to linked Telegram' })
  @HttpCode(HttpStatus.OK)
  async sendMyBackupToTelegram(@Request() req) {
    const tenantId = await this.getVerifiedTenantId(req);
    return this.backupService.sendBackupToTelegram(tenantId);
  }

  @Get('export-download')
  @ApiOperation({ summary: 'Export and download .sql.gz archive directly in browser' })
  async downloadMyBackup(@Request() req, @Response() res: ExpressResponse) {
    const tenantId = await this.getVerifiedTenantId(req);
    const { filename, sqlGzBuffer } = await this.backupService.exportTenantData(tenantId);

    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': sqlGzBuffer.length,
    });

    res.send(sqlGzBuffer);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Preview database archive contents and metadata before restoring' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async previewBackup(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const tenantId = await this.getVerifiedTenantId(req);
    if (!file || !file.buffer) {
      throw new ForbiddenException('Please upload a valid .sql.gz or .sql file.');
    }

    return this.backupService.previewTenantData(file.buffer, tenantId);
  }

  @Post('restore')
  @ApiOperation({ summary: 'Restore restaurant data from an uploaded .sql.gz or .sql archive' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async restoreBackup(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const tenantId = await this.getVerifiedTenantId(req);
    if (!file || !file.buffer) {
      throw new ForbiddenException('Please upload a valid .sql.gz or .sql file.');
    }

    return this.backupService.restoreTenantData(file.buffer, tenantId);
  }

  // ===========================================================================
  // SUPER ADMIN MANAGEMENT ENDPOINTS
  // ===========================================================================

  @Get('super-admin/overview')
  @ApiOperation({ summary: 'Super Admin: All tenants backup overview and status' })
  async getSuperAdminOverview(@Request() req) {
    const ctx = await this.getVerifiedContext(req);
    if (ctx.roleCode !== 'PLATFORM_SUPER_ADMIN') {
      throw new ForbiddenException('Restricted to Platform Super Admins.');
    }
    return this.backupService.getSuperAdminOverview();
  }

  @Post('super-admin/settings')
  @ApiOperation({ summary: 'Super Admin: Update global backup interval & timing' })
  async updateSuperAdminSettings(@Request() req, @Body() dto: GlobalBackupSettingsDto) {
    const ctx = await this.getVerifiedContext(req);
    if (ctx.roleCode !== 'PLATFORM_SUPER_ADMIN') {
      throw new ForbiddenException('Restricted to Platform Super Admins.');
    }
    return this.backupService.updateGlobalSettings(dto);
  }

  @Post('super-admin/trigger-all')
  @ApiOperation({ summary: 'Super Admin: Trigger automated backups for all tenants now' })
  @HttpCode(HttpStatus.OK)
  async triggerBackupAll(@Request() req) {
    const ctx = await this.getVerifiedContext(req);
    if (ctx.roleCode !== 'PLATFORM_SUPER_ADMIN') {
      throw new ForbiddenException('Restricted to Platform Super Admins.');
    }
    return this.backupService.triggerBackupAllTenants();
  }

  @Get('super-admin/export/:tenantId')
  @ApiOperation({ summary: 'Super Admin: Download any tenant backup directly' })
  async superAdminDownloadTenant(
    @Request() req,
    @Param('tenantId') tenantId: string,
    @Response() res: ExpressResponse,
  ) {
    const ctx = await this.getVerifiedContext(req);
    if (ctx.roleCode !== 'PLATFORM_SUPER_ADMIN') {
      throw new ForbiddenException('Restricted to Platform Super Admins.');
    }

    const { filename, sqlGzBuffer } = await this.backupService.exportTenantData(tenantId);

    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': sqlGzBuffer.length,
    });

    res.send(sqlGzBuffer);
  }

  @Post('super-admin/send/:tenantId')
  @ApiOperation({ summary: 'Super Admin: Send backup to specific tenant Telegram' })
  @HttpCode(HttpStatus.OK)
  async superAdminSendTenant(@Request() req, @Param('tenantId') tenantId: string) {
    const ctx = await this.getVerifiedContext(req);
    if (ctx.roleCode !== 'PLATFORM_SUPER_ADMIN') {
      throw new ForbiddenException('Restricted to Platform Super Admins.');
    }
    return this.backupService.sendBackupToTelegram(tenantId);
  }
}

