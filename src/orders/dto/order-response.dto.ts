import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class OrderItemModifierDto {
  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  priceDelta: string;
}

export class ConfirmedOrderItemDto {
  @ApiProperty()
  @Expose()
  orderItemId: string;

  @ApiProperty()
  @Expose()
  itemName: string;

  @ApiProperty()
  @Expose()
  quantity: number;

  @ApiProperty()
  @Expose()
  unitPrice: string;

  @ApiProperty()
  @Expose()
  currencyCode: string;

  @ApiProperty()
  @Expose()
  state: string;

  @ApiProperty()
  @Expose()
  version: number;

  @ApiPropertyOptional()
  @Expose()
  servedAt: Date | null;

  @ApiProperty()
  @Expose()
  stationId: string;

  @ApiProperty()
  @Expose()
  stationName: string;

  @ApiPropertyOptional()
  @Expose()
  specialInstruction: string | null;

  @ApiProperty({ type: () => [OrderItemModifierDto] })
  @Expose()
  @Type(() => OrderItemModifierDto)
  modifiers: OrderItemModifierDto[];
}

export class ConfirmOrderResponseDto {
  @ApiProperty()
  @Expose()
  orderId: string;

  @ApiProperty()
  @Expose()
  tableSessionId: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty()
  @Expose()
  confirmedAt: Date;

  @ApiProperty()
  @Expose()
  businessDate: string;

  @ApiProperty()
  @Expose()
  createdByWaiterMembershipId: string;

  @ApiProperty({ type: () => [ConfirmedOrderItemDto] })
  @Expose()
  @Type(() => ConfirmedOrderItemDto)
  items: ConfirmedOrderItemDto[];

  @ApiProperty()
  @Expose()
  tableSession: {
    status: string;
    version: number;
  };
}

export class SessionOrderDto {
  @ApiProperty()
  @Expose()
  orderId: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty()
  @Expose()
  confirmedAt: Date;

  @ApiProperty({ type: () => [ConfirmedOrderItemDto] })
  @Expose()
  @Type(() => ConfirmedOrderItemDto)
  items: ConfirmedOrderItemDto[];
}

export class ServedOrderItemDto {
  @ApiProperty()
  @Expose()
  orderItemId: string;

  @ApiProperty()
  @Expose()
  state: string;

  @ApiProperty()
  @Expose()
  servedAt: Date;

  @ApiProperty()
  @Expose()
  version: number;
}

export class SessionOrdersResponseDto {
  @ApiProperty()
  @Expose()
  tableSessionId: string;

  @ApiProperty()
  @Expose()
  sessionStatus: string;

  @ApiProperty()
  @Expose()
  version: number;

  @ApiProperty({ type: () => [SessionOrderDto] })
  @Expose()
  @Type(() => SessionOrderDto)
  data: SessionOrderDto[];
}
