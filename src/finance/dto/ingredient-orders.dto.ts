import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IngredientOrderLineDto {
  /** The inventory ledger entry id */
  @ApiProperty() ledgerId: string;
  @ApiProperty() date: string; // YYYY-MM-DD
  @ApiProperty() time: string; // HH:MM
  /** Order item / menu dish */
  @ApiPropertyOptional({ nullable: true }) menuItemId: string | null;
  @ApiProperty() menuItemName: string;
  @ApiProperty() orderedQty: number; // plates ordered
  @ApiProperty() ingredientQtyUsed: number; // stock units consumed
  @ApiProperty() ingredientUnit: string;
  @ApiProperty() costAtTime: string; // ETB
  /** Where the order was placed */
  @ApiPropertyOptional({ nullable: true }) tableId: string | null;
  @ApiPropertyOptional({ nullable: true }) tableDisplayName: string | null;
  /** Who took the order */
  @ApiPropertyOptional({ nullable: true }) waiterName: string | null;
  @ApiPropertyOptional({ nullable: true }) orderId: string | null;
}

export class IngredientOrdersResponseDto {
  @ApiProperty() ingredientId: string;
  @ApiProperty() ingredientName: string;
  @ApiProperty() unit: string;
  @ApiProperty() from: string;
  @ApiProperty() to: string;
  @ApiProperty({ type: [IngredientOrderLineDto] })
  data: IngredientOrderLineDto[];
}

