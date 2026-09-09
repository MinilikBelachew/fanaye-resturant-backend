import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

export class SuperAdminKpisDto {
  @ApiProperty({ example: 3 })
  liveTenantsCount: number;

  @ApiProperty({ example: 4 })
  provisionedTenantsCount: number;

  @ApiProperty({ example: '+25%' })
  tenantGrowthRate: string;

  @ApiProperty({ example: 'ETB 102.4k' })
  networkGmvTodayFormatted: string;

  @ApiProperty({ example: 102400 })
  networkGmvTodayValue: number;

  @ApiProperty({ example: '+12%' })
  networkGmvTrend: string;

  @ApiProperty({ example: 'vs last week' })
  networkGmvTrendLabel: string;

  @ApiProperty({ example: 7 })
  activeBranchesCount: number;

  @ApiProperty({ example: 4 })
  citiesCount: number;

  @ApiProperty({ example: 'Across 4 cities' })
  branchesLocationSummary: string;

  @ApiProperty({ example: '84.6%' })
  digitalSettlementPercentage: string;

  @ApiProperty({ example: 84.6 })
  digitalSettlementValue: number;

  @ApiProperty({ example: '+14%' })
  digitalSettlementTrend: string;

  @ApiProperty({ example: 'ETB 45.0k' })
  platformMrrFormatted: string;

  @ApiProperty({ example: 45000 })
  platformMrrValue: number;

  @ApiProperty({ example: '99.98%' })
  systemUptimePercentage: string;
}

export class NetworkGmvTrendPointDto {
  @ApiProperty({ example: 'Jan' })
  period: string;

  @ApiProperty({ example: 102.4 })
  networkGmv: number;

  @ApiProperty({ example: 86.6 })
  digitalVolume: number;

  @ApiProperty({ example: 45.0 })
  subscriptionInflow: number;
}

export class PlatformHealthRadarPointDto {
  @ApiProperty({ example: 'System Uptime' })
  dimension: string;

  @ApiProperty({ example: 99.8 })
  score: number;

  @ApiProperty({ example: 100 })
  benchmark: number;
}

export class PlanDistributionItemDto {
  @ApiProperty({ example: 'PRO' })
  planCode: string;

  @ApiProperty({ example: 'Pro Tier' })
  name: string;

  @ApiProperty({ example: 2 })
  tenantCount: number;

  @ApiProperty({ example: 50 })
  percentage: number;

  @ApiProperty({ example: '#e85d04' })
  color: string;
}

export class CityDistributionItemDto {
  @ApiProperty({ example: 'Addis Ababa' })
  city: string;

  @ApiProperty({ example: 4 })
  branchCount: number;

  @ApiProperty({ example: 57 })
  percentage: number;
}

export class TenantFleetItemDto {
  @ApiProperty({ example: 'uuid-tenant' })
  id: string;

  @ApiProperty({ example: 'Bole Habesha Lounge' })
  name: string;

  @ApiProperty({ example: 'bole-habesha' })
  slug: string;

  @ApiProperty({ example: 'Pro' })
  plan: string;

  @ApiProperty({ example: 'Addis Ababa' })
  city: string;

  @ApiProperty({ example: 3 })
  branchCount: number;

  @ApiProperty({ example: 48200 })
  gmvTodayValue: number;

  @ApiProperty({ example: 'ETB 48.2k' })
  gmvTodayFormatted: string;

  @ApiProperty({ example: 8 })
  activeTablesCount: number;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ example: true })
  active: boolean;
}

export class PlatformAuditEventDto {
  @ApiProperty({ example: 'uuid-event' })
  id: string;

  @ApiProperty({ example: 'TENANT_PROVISIONED' })
  action: string;

  @ApiProperty({ example: 'Bole Habesha Lounge' })
  entityName: string;

  @ApiProperty({ example: 'New tenant onboarded on Pro Plan' })
  description: string;

  @ApiProperty({ example: '2026-09-08T14:30:00.000Z' })
  occurredAt: string;

  @ApiProperty({ example: 'info' })
  severity: string;
}

export class SuperAdminDashboardDataDto {
  @ApiProperty({ type: () => SuperAdminKpisDto })
  kpis: SuperAdminKpisDto;

  @ApiProperty({ type: () => [NetworkGmvTrendPointDto] })
  gmvTrend: NetworkGmvTrendPointDto[];

  @ApiProperty({ type: () => [PlatformHealthRadarPointDto] })
  healthRadar: PlatformHealthRadarPointDto[];

  @ApiProperty({ type: () => [PlanDistributionItemDto] })
  planDistribution: PlanDistributionItemDto[];

  @ApiProperty({ type: () => [CityDistributionItemDto] })
  cityDistribution: CityDistributionItemDto[];

  @ApiProperty({ type: () => [TenantFleetItemDto] })
  tenants: TenantFleetItemDto[];

  @ApiProperty({ type: () => [PlatformAuditEventDto] })
  recentAuditEvents: PlatformAuditEventDto[];

  @ApiProperty({ example: '2026-09-08' })
  businessDate: string;
}

export class SuperAdminDashboardResponseDto {
  @ApiProperty({ type: () => SuperAdminDashboardDataDto })
  data: SuperAdminDashboardDataDto;
}

export class TenantBranchSummaryDto {
  @ApiProperty({ example: 'branch-uuid' })
  id: string;

  @ApiProperty({ example: 'Main Dining Room & Bar' })
  name: string;

  @ApiProperty({ example: 'MAIN' })
  displayCode: string;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ example: 'Africa/Addis_Ababa' })
  timezone: string;

  @ApiProperty({ example: 16 })
  tablesCount: number;

  @ApiProperty({ example: 12 })
  staffCount: number;
}

export class TenantDetailDto {
  @ApiProperty({ example: 'uuid-tenant' })
  id: string;

  @ApiProperty({ example: 'Fanaye Restaurant' })
  name: string;

  @ApiPropertyOptional({ example: 'Fanaye Food & Beverage PLC' })
  legalName?: string;

  @ApiProperty({ example: 'fanaye-restaurant' })
  slug: string;

  @ApiProperty({ example: 'Pro' })
  plan: string;

  @ApiProperty({ example: 'Addis Ababa' })
  city: string;

  @ApiProperty({ example: 'Bole' })
  area: string;

  @ApiProperty({ example: 'Bole Road, next to Edna Mall, Addis Ababa' })
  address: string;

  @ApiProperty({ example: '+251 11 667 2100' })
  phone: string;

  @ApiProperty({ example: 'hello@fanaye.et' })
  email: string;

  @ApiProperty({ example: 'Hiwot Bekele' })
  manager: string;

  @ApiProperty({ example: '10:00 – 23:00' })
  hours: string;

  @ApiProperty({ example: 'Casual dining' })
  concept: string;

  @ApiProperty({ example: 1 })
  branches: number;

  @ApiProperty({ example: 16 })
  tableCount: number;

  @ApiProperty({ example: 24 })
  staffCount: number;

  @ApiProperty({ example: 38720 })
  gmvToday: number;

  @ApiProperty({ example: 'ETB 38.7k' })
  gmvTodayFormatted: string;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ example: true })
  active: boolean;

  @ApiProperty({ example: '12 Mar 2026' })
  provisionedAt: string;

  @ApiProperty({ type: () => [TenantBranchSummaryDto] })
  branchesList: TenantBranchSummaryDto[];
}

export class TenantListResponseDto {
  @ApiProperty({ type: () => [TenantDetailDto] })
  data: TenantDetailDto[];
}

export class TenantDetailResponseDto {
  @ApiProperty({ type: () => TenantDetailDto })
  data: TenantDetailDto;
}

export class CreateTenantDto {
  @ApiProperty({ example: 'Abyssinia Grill & Lounge' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name: string;

  @ApiPropertyOptional({ example: 'Abyssinia Hospitality PLC' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  legalName?: string;

  @ApiPropertyOptional({ example: 'Casual Dining' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  concept?: string;

  @ApiPropertyOptional({ example: 'PRO' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  planCode?: string;

  @ApiProperty({ example: 'Addis Ababa' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city: string;

  @ApiProperty({ example: 'Bole' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  area: string;

  @ApiProperty({ example: 'Bole Road, Next to Edna Mall' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  address: string;

  @ApiProperty({ example: '+251 91 123 4567' })
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone: string;

  @ApiProperty({ example: 'hello@abyssinia.et' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Dawit Haile' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  managerName: string;

  @ApiPropertyOptional({ example: '+251 91 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  managerPhone?: string;

  @ApiPropertyOptional({ example: 'manager@abyssinia.et' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  managerEmail?: string;

  @ApiPropertyOptional({ example: 'Password123!' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  managerPassword?: string;

  @ApiProperty({ example: 'Bole Flagship' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  branchName: string;

  @ApiPropertyOptional({ example: 'BOLE-1' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  branchCode?: string;

  @ApiPropertyOptional({ example: '08:00 – 23:00' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  hours?: string;

  @ApiPropertyOptional({ example: 16 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  tableCount?: number;

  @ApiPropertyOptional({
    example: ['KITCHEN', 'BARISTA', 'CAKES', 'SOFT_DRINKS'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  activeStations?: string[];
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Abyssinia Grill & Lounge' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @ApiPropertyOptional({ example: 'Abyssinia Hospitality PLC' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(180)
  legalName?: string;

  @ApiPropertyOptional({ example: 'Casual Dining' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  concept?: string;

  @ApiPropertyOptional({ example: 'PRO' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  planCode?: string;

  @ApiPropertyOptional({ example: 'Addis Ababa' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ example: 'Bole' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  area?: string;

  @ApiPropertyOptional({ example: 'Bole Road, Next to Edna Mall' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: '+251 91 123 4567' })
  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ example: 'hello@abyssinia.et' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: 'Dawit Haile' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  managerName?: string;

  @ApiPropertyOptional({ example: '+251 91 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  managerPhone?: string;

  @ApiPropertyOptional({ example: 'manager@abyssinia.et' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  managerEmail?: string;

  @ApiPropertyOptional({
    example: 'Password123!',
    description: 'Leave empty to keep the current manager password.',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  managerPassword?: string;

  @ApiPropertyOptional({ example: 'Bole Flagship' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  branchName?: string;

  @ApiPropertyOptional({ example: 'BOLE-1' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  branchCode?: string;

  @ApiPropertyOptional({ example: '08:00 – 23:00' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  hours?: string;
}

export class PlatformAuditListResponseDto {
  @ApiProperty({ type: () => [PlatformAuditEventDto] })
  data: PlatformAuditEventDto[];
}

export class LiveOpsBranchDto {
  @ApiProperty()
  branchId: string;

  @ApiProperty()
  branchName: string;

  @ApiProperty()
  branchCode: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  tenantName: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ example: 4 })
  openSessions: number;

  @ApiProperty({ example: 2 })
  openOrders: number;

  @ApiProperty({ example: 1 })
  unpaidBills: number;

  @ApiProperty({ example: 16 })
  tableCount: number;
}

export class LiveOpsSummaryDto {
  @ApiProperty({ example: 12 })
  openSessions: number;

  @ApiProperty({ example: 8 })
  openOrders: number;

  @ApiProperty({ example: 3 })
  unpaidBills: number;

  @ApiProperty({ example: 5 })
  activeBranches: number;

  @ApiProperty({ example: 4 })
  liveTenants: number;
}

export class LiveOpsResponseDto {
  @ApiProperty({ type: () => LiveOpsSummaryDto })
  summary: LiveOpsSummaryDto;

  @ApiProperty({ type: () => [LiveOpsBranchDto] })
  branches: LiveOpsBranchDto[];
}

export class PlatformStaffMemberDto {
  @ApiProperty()
  membershipId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  tenantName: string;

  @ApiProperty({ type: [String], example: ['MANAGER'] })
  roles: string[];

  @ApiProperty({ example: 'ACTIVE' })
  accountStatus: string;

  @ApiProperty({ example: 'ACTIVE' })
  membershipStatus: string;

  @ApiPropertyOptional({ example: '2026-09-09T06:00:00.000Z' })
  lastLoginAt?: string | null;

  @ApiProperty({ example: true })
  hasPassword: boolean;
}

export class PlatformStaffListResponseDto {
  @ApiProperty({ type: () => [PlatformStaffMemberDto] })
  data: PlatformStaffMemberDto[];
}

export class SuspendPlatformStaffDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  suspended: boolean;
}

export class ResetPlatformStaffPasswordDto {
  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}

export class FeatureFlagDto {
  @ApiProperty({ example: 'qr_guest' })
  key: string;

  @ApiProperty({ example: 'Guest QR ordering' })
  name: string;

  @ApiProperty({ example: 'Deferred' })
  scope: string;

  @ApiProperty({ example: false })
  enabled: boolean;
}

export class FeatureFlagsResponseDto {
  @ApiProperty({ type: () => [FeatureFlagDto] })
  data: FeatureFlagDto[];
}

export class UpdateFeatureFlagDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;
}
