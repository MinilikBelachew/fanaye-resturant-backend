import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SuperAdminService } from './super-admin.service';
import {
  CreatePlatformStaffDto,
  CreateSubscriptionPlanDto,
  CreateTenantDto,
  DeletePlanResponseDto,
  DeleteTenantResponseDto,
  ListPlatformAuditQueryDto,
  ListPlatformStaffQueryDto,
  LiveOpsResponseDto,
  PermissionListResponseDto,
  PlatformAuditListResponseDto,
  PlatformStaffListResponseDto,
  PlatformStaffMemberDto,
  ResetPlatformStaffPasswordDto,
  ResetPlatformStaffPinDto,
  RestaurantRoleListResponseDto,
  RolePermissionsResponseDto,
  SetRolePermissionsDto,
  SubscriptionPlanDto,
  SubscriptionPlanListResponseDto,
  SuspendPlatformStaffDto,
  SuperAdminDashboardResponseDto,
  TenantDetailResponseDto,
  TenantListResponseDto,
  UpdateSubscriptionPlanDto,
  UpdateTenantDto,
} from './dto/super-admin-dashboard.dto';

@ApiTags('Super admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'super-admin',
  version: '1',
})
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  private requireUserId(request: { user?: { id?: string } }): string {
    const id = request?.user?.id;
    if (!id) {
      throw new UnauthorizedException();
    }
    return String(id);
  }

  @Get('dashboard')
  @ApiQuery({ name: 'businessDate', required: false })
  @ApiOkResponse({ type: SuperAdminDashboardResponseDto })
  getDashboard(
    @Request() request,
    @Query('businessDate') businessDate?: string,
  ): Promise<SuperAdminDashboardResponseDto> {
    return this.superAdminService.getDashboard(
      this.requireUserId(request),
      businessDate,
    );
  }

  @Get('plans')
  @ApiOkResponse({ type: SubscriptionPlanListResponseDto })
  listPlans(@Request() request): Promise<SubscriptionPlanListResponseDto> {
    return this.superAdminService.listPlans(this.requireUserId(request));
  }

  @Post('plans')
  @ApiCreatedResponse({ type: SubscriptionPlanDto })
  createPlan(
    @Request() request,
    @Body() dto: CreateSubscriptionPlanDto,
  ): Promise<SubscriptionPlanDto> {
    return this.superAdminService.createPlan(this.requireUserId(request), dto);
  }

  @Patch('plans/:id')
  @ApiOkResponse({ type: SubscriptionPlanDto })
  updatePlan(
    @Request() request,
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionPlanDto,
  ): Promise<SubscriptionPlanDto> {
    return this.superAdminService.updatePlan(
      this.requireUserId(request),
      id,
      dto,
    );
  }

  @Delete('plans/:id')
  @ApiOkResponse({ type: DeletePlanResponseDto })
  deletePlan(
    @Request() request,
    @Param('id') id: string,
  ): Promise<DeletePlanResponseDto> {
    return this.superAdminService.deletePlan(this.requireUserId(request), id);
  }

  @Get('tenants')
  @ApiOkResponse({ type: TenantListResponseDto })
  getTenants(@Request() request): Promise<TenantListResponseDto> {
    return this.superAdminService.getTenants(this.requireUserId(request));
  }

  @Get('tenants/:id')
  @ApiOkResponse({ type: TenantDetailResponseDto })
  getTenantById(
    @Request() request,
    @Param('id') id: string,
  ): Promise<TenantDetailResponseDto> {
    return this.superAdminService.getTenantById(
      this.requireUserId(request),
      id,
    );
  }

  @Post('tenants')
  @ApiCreatedResponse({ type: TenantDetailResponseDto })
  createTenant(
    @Request() request,
    @Body() dto: CreateTenantDto,
  ): Promise<TenantDetailResponseDto> {
    return this.superAdminService.createTenant(
      this.requireUserId(request),
      dto,
    );
  }

  @Patch('tenants/:id')
  @ApiOkResponse({ type: TenantDetailResponseDto })
  updateTenant(
    @Request() request,
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<TenantDetailResponseDto> {
    return this.superAdminService.updateTenant(
      this.requireUserId(request),
      id,
      dto,
    );
  }

  @Delete('tenants/:id')
  @ApiOkResponse({ type: DeleteTenantResponseDto })
  deleteTenant(
    @Request() request,
    @Param('id') id: string,
  ): Promise<DeleteTenantResponseDto> {
    return this.superAdminService.deleteTenant(this.requireUserId(request), id);
  }

  @Get('audit/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="platform-audit.csv"')
  exportAudit(
    @Request() request,
    @Query() query: ListPlatformAuditQueryDto,
  ): Promise<string> {
    return this.superAdminService.exportAuditCsv(
      this.requireUserId(request),
      query,
    );
  }

  @Get('audit')
  @ApiOkResponse({ type: PlatformAuditListResponseDto })
  listAudit(
    @Request() request,
    @Query() query: ListPlatformAuditQueryDto,
  ): Promise<PlatformAuditListResponseDto> {
    return this.superAdminService.listAuditEvents(
      this.requireUserId(request),
      query,
    );
  }

  @Get('live-ops')
  @ApiOkResponse({ type: LiveOpsResponseDto })
  getLiveOps(@Request() request): Promise<LiveOpsResponseDto> {
    return this.superAdminService.getLiveOps(this.requireUserId(request));
  }

  @Get('staff')
  @ApiOkResponse({ type: PlatformStaffListResponseDto })
  listStaff(
    @Request() request,
    @Query() query: ListPlatformStaffQueryDto,
  ): Promise<PlatformStaffListResponseDto> {
    return this.superAdminService.listPlatformStaff(
      this.requireUserId(request),
      query,
    );
  }

  @Post('staff')
  @ApiCreatedResponse({ type: PlatformStaffMemberDto })
  createStaff(
    @Request() request,
    @Body() dto: CreatePlatformStaffDto,
  ): Promise<PlatformStaffMemberDto> {
    return this.superAdminService.createPlatformStaff(
      this.requireUserId(request),
      dto,
    );
  }

  @Patch('staff/:membershipId/pin')
  @ApiOkResponse({ type: PlatformStaffMemberDto })
  resetStaffPin(
    @Request() request,
    @Param('membershipId') membershipId: string,
    @Body() dto: ResetPlatformStaffPinDto,
  ): Promise<PlatformStaffMemberDto> {
    return this.superAdminService.resetPlatformStaffPin(
      this.requireUserId(request),
      membershipId,
      dto,
    );
  }

  @Patch('staff/:membershipId/suspend')
  @ApiOkResponse({ type: PlatformStaffMemberDto })
  suspendStaff(
    @Request() request,
    @Param('membershipId') membershipId: string,
    @Body() dto: SuspendPlatformStaffDto,
  ): Promise<PlatformStaffMemberDto> {
    return this.superAdminService.suspendPlatformStaff(
      this.requireUserId(request),
      membershipId,
      dto,
    );
  }

  @Patch('staff/:membershipId/password')
  @ApiOkResponse({ type: PlatformStaffMemberDto })
  resetStaffPassword(
    @Request() request,
    @Param('membershipId') membershipId: string,
    @Body() dto: ResetPlatformStaffPasswordDto,
  ): Promise<PlatformStaffMemberDto> {
    return this.superAdminService.resetPlatformStaffPassword(
      this.requireUserId(request),
      membershipId,
      dto,
    );
  }

  @Get('roles')
  @ApiOkResponse({ type: RestaurantRoleListResponseDto })
  listRoles(@Request() request): Promise<RestaurantRoleListResponseDto> {
    return this.superAdminService.listRestaurantRoles(
      this.requireUserId(request),
    );
  }

  @Get('permissions')
  @ApiOkResponse({ type: PermissionListResponseDto })
  listPermissions(@Request() request): Promise<PermissionListResponseDto> {
    return this.superAdminService.listPermissions(this.requireUserId(request));
  }

  @Get('roles/:roleId/permissions')
  @ApiOkResponse({ type: RolePermissionsResponseDto })
  getRolePermissions(
    @Request() request,
    @Param('roleId') roleId: string,
  ): Promise<RolePermissionsResponseDto> {
    return this.superAdminService.getRolePermissions(
      this.requireUserId(request),
      roleId,
    );
  }

  @Put('roles/:roleId/permissions')
  @ApiOkResponse({ type: RolePermissionsResponseDto })
  setRolePermissions(
    @Request() request,
    @Param('roleId') roleId: string,
    @Body() dto: SetRolePermissionsDto,
  ): Promise<RolePermissionsResponseDto> {
    return this.superAdminService.setRolePermissions(
      this.requireUserId(request),
      roleId,
      dto,
    );
  }
}
