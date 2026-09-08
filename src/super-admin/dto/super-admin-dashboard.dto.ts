import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  name: string;

  @ApiPropertyOptional({ example: 'Abyssinia Hospitality PLC' })
  legalName?: string;

  @ApiPropertyOptional({ example: 'Casual Dining' })
  concept?: string;

  @ApiPropertyOptional({ example: 'PRO' })
  planCode?: string;

  @ApiProperty({ example: 'Addis Ababa' })
  city: string;

  @ApiProperty({ example: 'Bole' })
  area: string;

  @ApiProperty({ example: 'Bole Road, Next to Edna Mall' })
  address: string;

  @ApiProperty({ example: '+251 91 123 4567' })
  phone: string;

  @ApiProperty({ example: 'hello@abyssinia.et' })
  email: string;

  @ApiProperty({ example: 'Dawit Haile' })
  managerName: string;

  @ApiPropertyOptional({ example: '+251 91 123 4567' })
  managerPhone?: string;

  @ApiPropertyOptional({ example: 'manager@abyssinia.et' })
  managerEmail?: string;

  @ApiPropertyOptional({ example: 'Password123!' })
  managerPassword?: string;

  @ApiProperty({ example: 'Bole Flagship' })
  branchName: string;

  @ApiPropertyOptional({ example: 'BOLE-1' })
  branchCode?: string;

  @ApiPropertyOptional({ example: '08:00 – 23:00' })
  hours?: string;

  @ApiPropertyOptional({ example: 16 })
  tableCount?: number;

  @ApiPropertyOptional({
    example: ['KITCHEN', 'BARISTA', 'CAKES', 'SOFT_DRINKS'],
    type: [String],
  })
  activeStations?: string[];
}


