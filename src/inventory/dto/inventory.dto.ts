import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const INVENTORY_ITEM_KINDS = ['RAW', 'PRODUCED', 'FINISHED'] as const;
export type InventoryItemKind = (typeof INVENTORY_ITEM_KINDS)[number];

export class CreateIngredientDto {
  @ApiProperty({ example: 'Chicken breast' })
  @IsString()
  @MaxLength(180)
  name: string;

  @ApiProperty({ example: 'kg' })
  @IsString()
  @MaxLength(20)
  unit: string;

  @ApiPropertyOptional({
    enum: INVENTORY_ITEM_KINDS,
    example: 'RAW',
    description:
      'RAW = purchase raw; PRODUCED = made in-house; FINISHED = ready item (e.g. beer by pcs)',
  })
  @IsOptional()
  @IsIn([...INVENTORY_ITEM_KINDS])
  itemKind?: InventoryItemKind;

  @ApiPropertyOptional({ example: 450 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  parLevel?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Opening on-hand quantity',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialQty?: number;

  @ApiPropertyOptional({
    description: 'Stock location for opening qty (defaults to branch store)',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class UpdateIngredientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({ enum: INVENTORY_ITEM_KINDS })
  @IsOptional()
  @IsIn([...INVENTORY_ITEM_KINDS])
  itemKind?: InventoryItemKind;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({
    example: 80,
    description: 'Standard AP→EP yield % (e.g. 80 for onion)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100)
  standardYieldPercent?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  parLevel?: number;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}

export class CreateMainLocationDto {
  @ApiPropertyOptional({ example: 'Main warehouse' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'MAIN' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;
}

export class UpdateLocationDto {
  @ApiPropertyOptional({ example: 'Main warehouse' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'MAIN' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;
}

export class ReceiveStockDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({
    description: 'Target location (defaults to branch store)',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  supplierNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class WasteStockDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty({ example: 1.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({ example: 'Spoilage' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

/**
 * Single-item yield test (e.g. onion): purchased AP vs usable EP.
 * Yield% = usable / purchased × 100.
 * EP unit cost = AP unit cost ÷ (yield/100)  →  40 ETB/kg ÷ 0.8 = 50 ETB/usable kg.
 * Trim (purchased − usable) can be written off as YIELD_TRIM.
 */
export class PostYieldTestDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty({
    example: 1,
    description: 'Purchased / as-purchased weight (AP)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  purchasedQuantity: number;

  @ApiProperty({
    example: 0.8,
    description: 'Usable / edible weight after trim (EP)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  usableQuantity: number;

  @ApiPropertyOptional({
    description: 'Store where the test applies (defaults to branch store)',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({
    description:
      'Write off trim (purchased − usable) from stock. Default true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  writeOffTrim?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class UpdateYieldTestDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  purchasedQuantity?: number;

  @ApiPropertyOptional({ example: 0.8 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  usableQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string | null;
}

export class CountLineInputDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty({ example: 95 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedQty: number;
}

export class UpdateCountLinesDto {
  @ApiProperty({ type: [CountLineInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CountLineInputDto)
  lines: CountLineInputDto[];
}

export class StartCountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class InventoryListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'true = onHand <= par' })
  @IsOptional()
  @IsString()
  lowStock?: string;

  @ApiPropertyOptional({
    description:
      'Ledger entry type, or group: PRODUCTION / INTERNAL_PRODUCE, TRANSFERS, PURCHASES',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filter balances / scope by location' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({
    description: 'outgoing | incoming | all',
    example: 'incoming',
  })
  @IsOptional()
  @IsString()
  direction?: string;
}

export class TransferLineInputDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;
}

export class CreateTransferDto {
  @ApiProperty({
    description: 'Destination branch store location id',
  })
  @IsUUID()
  toLocationId: string;

  @ApiPropertyOptional({
    description: 'Source location (defaults to main warehouse)',
  })
  @IsOptional()
  @IsUUID()
  fromLocationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @ApiProperty({ type: [TransferLineInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferLineInputDto)
  lines: TransferLineInputDto[];
}

export class AcceptTransferLineDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantityReceived: number;
}

export class AcceptTransferDto {
  @ApiPropertyOptional({
    type: [AcceptTransferLineDto],
    description: 'Omit to accept full quantitySent on every line',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptTransferLineDto)
  lines?: AcceptTransferLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class RejectTransferDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class ProductionInputDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;
}

export class SupplyRequestLineDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;
}

export class CreateSupplyRequestDto {
  @ApiPropertyOptional({
    description: 'Branch store requesting (defaults to current branch store)',
  })
  @IsOptional()
  @IsUUID()
  fromLocationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @ApiProperty({ type: [SupplyRequestLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplyRequestLineDto)
  lines: SupplyRequestLineDto[];
}

export class DecideSupplyRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  decisionNote?: string;
}

export class CreateProductionBatchDto {
  @ApiProperty({
    description: 'Output ingredient (e.g. peeled onion, noodles)',
  })
  @IsUUID()
  outputIngredientId: string;

  @ApiProperty({
    example: 8,
    description: 'Actual edible / finished quantity produced',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  outputQuantity: number;

  @ApiPropertyOptional({
    example: 10,
    description:
      'Expected output for yield test. If omitted with a single input, yield = output ÷ input.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  expectedOutputQuantity?: number;

  @ApiPropertyOptional({
    enum: ['PRODUCED', 'FINISHED'],
    description: 'Mark output kind after batch (default PRODUCED)',
  })
  @IsOptional()
  @IsIn(['PRODUCED', 'FINISHED'])
  outputItemKind?: 'PRODUCED' | 'FINISHED';

  @ApiPropertyOptional({
    description:
      'Main warehouse or restaurant (branch) store where prep happens',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @ApiProperty({ type: [ProductionInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductionInputDto)
  inputs: ProductionInputDto[];
}
