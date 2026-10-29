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

  @ApiPropertyOptional({
    description: 'Category id this ingredient belongs to',
  })
  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @ApiPropertyOptional({ description: 'Image URL for this ingredient' })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;
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

  @ApiPropertyOptional({
    description: 'Category id this ingredient belongs to',
  })
  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @ApiPropertyOptional({ description: 'Image URL for this ingredient' })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;
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

  @ApiPropertyOptional({
    description: 'Vendor (supplier) this purchase came from',
  })
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({
    description:
      'Unit of quantity (e.g. g when the ingredient is stocked in kg)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptUrl?: string;
}

export class ReceiveStockBatchItemDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({
    description:
      'Unit of quantity (e.g. g when the ingredient is stocked in kg)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost?: number;
}

export class ReceiveStockBatchDto {
  @ApiPropertyOptional({
    description: 'Vendor (supplier) this purchase came from',
  })
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiPropertyOptional({
    description: 'Target location (defaults to branch store / main warehouse)',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @ApiProperty({ type: [ReceiveStockBatchItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveStockBatchItemDto)
  items: ReceiveStockBatchItemDto[];
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

  @ApiPropertyOptional({
    description: 'Unit of quantity (e.g. g when stocked in kg)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

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

  @ApiPropertyOptional({ description: 'Unit for purchased/usable quantities' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

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

  @ApiPropertyOptional({ description: 'Unit for purchased/usable quantities' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

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

  @ApiPropertyOptional({ description: 'Unit of countedQty' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;
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

  @ApiPropertyOptional({ description: 'Filter by category id' })
  @IsOptional()
  @IsString()
  categoryId?: string;
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

  @ApiPropertyOptional({ description: 'Unit of quantity' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;
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

  @ApiPropertyOptional({ description: 'Unit of quantityReceived' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;
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

  @ApiPropertyOptional({ description: 'Unit of quantity' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;
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

  @ApiPropertyOptional({ description: 'Unit of quantity' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;
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

  @ApiPropertyOptional({ description: 'Auto-approve the request immediately' })
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;

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

  @ApiPropertyOptional({ description: 'Driver assigned for dispatch' })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiPropertyOptional({
    description: 'If true, set transfer to IN_TRANSIT immediately',
  })
  @IsOptional()
  @IsBoolean()
  immediateTransit?: boolean;
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

  @ApiPropertyOptional({ description: 'Unit for the output quantity' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  outputUnit?: string;

  @ApiProperty({ type: [ProductionInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductionInputDto)
  inputs: ProductionInputDto[];
}

// ─────────────────────────────────────────────────────────────
// CATEGORY DTOs
// ─────────────────────────────────────────────────────────────

export class CreateCategoryDto {
  @ApiProperty({ example: 'Meat & Poultry' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'MEAT_POULTRY' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ example: 'ሥጋና ዶሮ' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameAm?: string;

  @ApiPropertyOptional({ description: 'Amharic name' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  amharicName?: string;

  @ApiPropertyOptional({ description: 'Branch id to scope this category' })
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emoji?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameAm?: string;

  @ApiPropertyOptional({ description: 'Amharic name' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  amharicName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @ApiPropertyOptional({ description: 'Branch id to scope this category' })
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emoji?: string;
}

// ─────────────────────────────────────────────────────────────
// CUSTOM UNIT DTOs
// ─────────────────────────────────────────────────────────────

export class CreateCustomUnitDto {
  @ApiProperty({ example: 'quintal' })
  @IsString()
  @MaxLength(40)
  code: string;

  @ApiProperty({ example: 'Quintal' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'WEIGHT' })
  @IsString()
  @MaxLength(40)
  category: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCustomUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}

// ─────────────────────────────────────────────────────────────
// UNIT CONVERSION DTOs
// ─────────────────────────────────────────────────────────────

export class CreateUnitConversionDto {
  @ApiProperty({ example: 'kg' })
  @IsString()
  @MaxLength(20)
  fromUnit: string;

  @ApiProperty({ example: 'g' })
  @IsString()
  @MaxLength(20)
  toUnit: string;

  @ApiProperty({ example: 1000, description: 'How many toUnit per 1 fromUnit' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  factor: number;
}

export class UpdateUnitConversionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fromUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  toUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  factor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}

// ─────────────────────────────────────────────────────────────
// VENDOR DTOs
// ─────────────────────────────────────────────────────────────

export class CreateVendorDto {
  @ApiProperty({ example: 'Wenji Farm' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'FARM', enum: ['FARM', 'NEGADE', 'OTHER'] })
  @IsString()
  @MaxLength(40)
  type: string;

  @ApiPropertyOptional({ example: '+251911234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactPerson?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class UpdateVendorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ['FARM', 'NEGADE', 'OTHER'] })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactPerson?: string;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}

// ─────────────────────────────────────────────────────────────
// DRIVER DTOs
// ─────────────────────────────────────────────────────────────

export class CreateDriverDto {
  @ApiProperty({ example: 'Abebe Kebede' })
  @IsString()
  @MaxLength(120)
  displayName: string;

  @ApiPropertyOptional({ example: '+251911234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: '3-1234' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  licencePlate?: string;

  @ApiPropertyOptional({ example: 'Toyota Hiace' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleDesc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class UpdateDriverDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  licencePlate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleDesc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactPerson?: string;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}

// ─────────────────────────────────────────────────────────────
// DISPATCH TRANSFER DTO
// ─────────────────────────────────────────────────────────────

export class DispatchTransferDto {
  @ApiPropertyOptional({ description: 'Driver assigned to this transfer' })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

// ─────────────────────────────────────────────────────────────
// PUSH-DROP DTO
// ─────────────────────────────────────────────────────────────

export class CreatePushDropDto {
  @ApiPropertyOptional({ description: 'Source location (main warehouse)' })
  @IsOptional()
  @IsUUID()
  fromLocationId?: string;

  @ApiProperty({
    description:
      'One entry per destination branch (toLocationId + lines per branch)',
  })
  @IsArray()
  @ArrayMinSize(1)
  branches: Array<{
    toLocationId: string;
    lines: Array<{ ingredientId: string; quantity: number; unit?: string }>;
  }>;

  @ApiPropertyOptional({ description: 'Driver assigned for delivery' })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiPropertyOptional({
    description: 'Human-readable label for this push drop',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ description: 'ISO date for scheduled dispatch' })
  @IsOptional()
  @IsString()
  scheduledDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

// ─────────────────────────────────────────────────────────────
// SUPPLY REQUEST V2 DTO
// ─────────────────────────────────────────────────────────────

export class CreateSupplyRequestV2Dto {
  @ApiPropertyOptional({
    description: 'Branch store requesting (defaults to current branch store)',
  })
  @IsOptional()
  @IsUUID()
  fromLocationId?: string;

  @ApiPropertyOptional({ description: 'Target (warehouse) location id' })
  @IsOptional()
  @IsUUID()
  toLocationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @ApiPropertyOptional({ description: 'Auto-approve the request immediately' })
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;

  @ApiProperty({ type: [SupplyRequestLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplyRequestLineDto)
  lines: SupplyRequestLineDto[];
}

// ─────────────────────────────────────────────────────────────
// BRANCH ANALYTICS QUERY DTO
// ─────────────────────────────────────────────────────────────

export class BranchAnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'today | week | month',
    example: 'today',
  })
  @IsOptional()
  @IsString()
  range?: string;

  @ApiPropertyOptional({ description: 'ISO date string start of range' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date string end of range' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: 'Location id to scope analytics' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

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
}

// ─────────────────────────────────────────────────────────────
// MATERIAL DTOs (returnable items issued for outside orders)
// ─────────────────────────────────────────────────────────────

export const MATERIAL_CATEGORIES = [
  'CUTLERY',
  'CROCKERY',
  'TRAYS_CARRIERS',
  'PACKAGING',
  'LINEN',
  'CLEANING',
  'EQUIPMENT',
  'OTHER',
] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const MATERIAL_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;

export class CreateMaterialDto {
  @ApiProperty({ example: 'Stainless fork' })
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 'FORK_STAINLESS' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @ApiPropertyOptional({ enum: MATERIAL_CATEGORIES, example: 'CUTLERY' })
  @IsOptional()
  @IsIn(MATERIAL_CATEGORIES as unknown as string[])
  category?: string;

  @ApiPropertyOptional({ example: 'pcs' })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  unit?: string;

  @ApiPropertyOptional({ description: 'Expected back after an outside order' })
  @IsOptional()
  @IsBoolean()
  isReusable?: boolean;

  @ApiPropertyOptional({ example: '/images/materials/fork.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @ApiPropertyOptional({ example: 'ሹካ' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  amharicName?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class UpdateMaterialDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @ApiPropertyOptional({ enum: MATERIAL_CATEGORIES })
  @IsOptional()
  @IsIn(MATERIAL_CATEGORIES as unknown as string[])
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(24)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isReusable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  amharicName?: string;

  @ApiPropertyOptional({ enum: MATERIAL_STATUSES })
  @IsOptional()
  @IsIn(MATERIAL_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class MaterialListQueryDto {
  @ApiPropertyOptional({ description: 'Search by name, code or Amharic name' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: MATERIAL_CATEGORIES })
  @IsOptional()
  @IsIn(MATERIAL_CATEGORIES as unknown as string[])
  category?: string;

  @ApiPropertyOptional({ enum: MATERIAL_STATUSES })
  @IsOptional()
  @IsIn(MATERIAL_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  isReusable?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class UpsertMaterialBalanceDto {
  @ApiProperty({ description: 'Material id' })
  @IsUUID()
  materialId: string;

  @ApiPropertyOptional({ description: 'Ideal on-hand quantity' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  onHandQty?: number;

  @ApiPropertyOptional({ description: 'Location to scope the balance' })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
