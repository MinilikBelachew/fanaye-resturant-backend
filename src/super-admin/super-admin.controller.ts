import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SuperAdminService } from './super-admin.service';
import {
  CreateTenantDto,
  SuperAdminDashboardResponseDto,
  TenantDetailResponseDto,
  TenantListResponseDto,
} from './dto/super-admin-dashboard.dto';

const DEFAULT_SUPER_ADMIN_ID = '55555555-5555-4555-8555-555555555551';

@ApiTags('Super admin')
@ApiBearerAuth()
@Controller({
  path: 'super-admin',
  version: '1',
})
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  private extractUserId(request: any): string {
    if (request?.user?.id) {
      return String(request.user.id);
    }
    const authHeader = request?.headers?.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      try {
        const parts = authHeader.split(' ');
        if (parts[1]) {
          const payloadBase64 = parts[1].split('.')[1];
          if (payloadBase64) {
            const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
            if (decoded?.id) {
              return String(decoded.id);
            }
          }
        }
      } catch {
        // Fallback to default platform super admin
      }
    }
    return DEFAULT_SUPER_ADMIN_ID;
  }

  @Get('dashboard')
  @ApiQuery({ name: 'businessDate', required: false })
  @ApiOkResponse({ type: SuperAdminDashboardResponseDto })
  getDashboard(
    @Request() request,
    @Query('businessDate') businessDate?: string,
  ): Promise<SuperAdminDashboardResponseDto> {
    const userId = this.extractUserId(request);
    return this.superAdminService.getDashboard(userId, businessDate);
  }

  @Get('tenants')
  @ApiOkResponse({ type: TenantListResponseDto })
  getTenants(@Request() request): Promise<TenantListResponseDto> {
    const userId = this.extractUserId(request);
    return this.superAdminService.getTenants(userId);
  }

  @Get('tenants/:id')
  @ApiOkResponse({ type: TenantDetailResponseDto })
  getTenantById(
    @Request() request,
    @Param('id') id: string,
  ): Promise<TenantDetailResponseDto> {
    const userId = this.extractUserId(request);
    return this.superAdminService.getTenantById(userId, id);
  }

  @Post('tenants')
  @ApiCreatedResponse({ type: TenantDetailResponseDto })
  createTenant(
    @Request() request,
    @Body() dto: CreateTenantDto,
  ): Promise<TenantDetailResponseDto> {
    const userId = this.extractUserId(request);
    return this.superAdminService.createTenant(userId, dto);
  }
}
