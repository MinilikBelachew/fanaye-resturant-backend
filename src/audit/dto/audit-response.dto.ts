import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditEventDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  occurredAt: string;

  @ApiProperty()
  timestampLabel: string;

  @ApiProperty()
  actorName: string;

  @ApiProperty()
  actorRole: string;

  @ApiProperty()
  action: string;

  @ApiProperty()
  actionLabel: string;

  @ApiProperty({
    enum: ['orders', 'fulfillment', 'payments', 'system'],
  })
  category: 'orders' | 'fulfillment' | 'payments' | 'system';

  @ApiProperty()
  badgeLabel: string;

  @ApiProperty({
    enum: ['default', 'success', 'warning', 'secondary'],
  })
  badgeVariant: 'default' | 'success' | 'warning' | 'secondary';

  @ApiPropertyOptional()
  details?: string | null;

  @ApiProperty()
  entityType: string;

  @ApiPropertyOptional()
  entityId?: string | null;
}

export class AuditSummaryDto {
  @ApiProperty()
  totalToday: number;

  @ApiProperty()
  fulfillmentToday: number;

  @ApiProperty()
  paymentToday: number;

  @ApiProperty()
  orderToday: number;

  @ApiProperty()
  systemToday: number;
}

export class AuditListResponseDto {
  @ApiProperty({ type: () => [AuditEventDto] })
  data: AuditEventDto[];

  @ApiProperty({ type: () => AuditSummaryDto })
  summary: AuditSummaryDto;
}
