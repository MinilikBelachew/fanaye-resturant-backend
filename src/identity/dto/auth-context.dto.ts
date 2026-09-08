import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class AuthWorkspaceDto {
  @ApiProperty()
  @Expose()
  workspace: string;

  @ApiProperty()
  @Expose()
  roleCode: string;

  @ApiPropertyOptional()
  @Expose()
  tenantId: string | null;

  @ApiPropertyOptional()
  @Expose()
  branchId: string | null;

  @ApiPropertyOptional()
  @Expose()
  staffMembershipId: string | null;
}

export class AuthContextDto {
  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty()
  @Expose()
  displayName: string;

  @ApiPropertyOptional()
  @Expose()
  email: string | null;

  @ApiPropertyOptional()
  @Expose()
  phone: string | null;

  @ApiPropertyOptional()
  @Expose()
  tenantId: string | null;

  @ApiPropertyOptional()
  @Expose()
  branchId: string | null;

  @ApiPropertyOptional()
  @Expose()
  branchName: string | null;

  @ApiPropertyOptional()
  @Expose()
  staffMembershipId: string | null;

  @ApiProperty()
  @Expose()
  roleCode: string;

  @ApiPropertyOptional()
  @Expose()
  stationId: string | null;

  @ApiPropertyOptional()
  @Expose()
  stationCode: string | null;

  @ApiPropertyOptional()
  @Expose()
  stationName: string | null;

  @ApiPropertyOptional()
  @Expose()
  shiftSessionId: string | null;

  @ApiProperty({ type: [String] })
  @Expose()
  permissions: string[];

  @ApiProperty({ type: () => [AuthWorkspaceDto] })
  @Expose()
  workspaces: AuthWorkspaceDto[];
}
