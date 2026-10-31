import { ApiProperty } from '@nestjs/swagger';

export class FbReportCategoryRowDto {
  @ApiProperty({ example: 'Main Dishes' })
  categoryName: string;

  @ApiProperty({ example: 45 })
  quantitySold: number;

  @ApiProperty({ example: '12400.00' })
  revenue: string;

  @ApiProperty({ example: '3720.00' })
  cost: string;

  @ApiProperty({ example: '8680.00' })
  grossMargin: string;

  @ApiProperty({ example: 70.0 })
  marginPct: number;

  @ApiProperty({ example: 30.0 })
  costPct: number;
}

export class FbReportStationRowDto {
  @ApiProperty({ example: 'Kitchen' })
  stationName: string;

  @ApiProperty({ example: 'FULL_PREP' })
  workflowMode: string;

  @ApiProperty({ example: 120 })
  itemsPrepared: number;

  @ApiProperty({ example: '24500.00' })
  revenue: string;

  @ApiProperty({ example: '7350.00' })
  cost: string;

  @ApiProperty({ example: 30.0 })
  costPct: number;
}

export class FbReportTopItemDto {
  @ApiProperty({ example: 'Tibs' })
  name: string;

  @ApiProperty({ example: 'Kitchen' })
  station: string;

  @ApiProperty({ example: 38 })
  quantitySold: number;

  @ApiProperty({ example: '9500.00' })
  revenue: string;

  @ApiProperty({ example: '2850.00' })
  cost: string;

  @ApiProperty({ example: '6650.00' })
  profit: string;

  @ApiProperty({ example: 70.0 })
  marginPct: number;
}

export class FbReportIngredientCostDriverDto {
  @ApiProperty({ example: 'Beef' })
  name: string;

  @ApiProperty({ example: 'kg' })
  unit: string;

  @ApiProperty({ example: 14.5 })
  quantityConsumed: number;

  @ApiProperty({ example: '5800.00' })
  totalCost: string;

  @ApiProperty({ example: '400.00' })
  unitCost: string;

  @ApiProperty({ example: 28.5 })
  costSharePct: number;
}

export class FbReportWasteItemDto {
  @ApiProperty({ example: 'Milk' })
  name: string;

  @ApiProperty({ example: 'L' })
  unit: string;

  @ApiProperty({ example: 2.5 })
  quantityWasted: number;

  @ApiProperty({ example: '250.00' })
  wasteCost: string;

  @ApiProperty({ example: 'EXPIRED' })
  reason: string;
}

export class FbReportItemIngredientDto {
  @ApiProperty({ example: 'Beef' })
  name: string;

  @ApiProperty({ example: 'kg' })
  unit: string;

  @ApiProperty({ example: 0.2 })
  quantityPerServing: number;

  @ApiProperty({ example: '350.00' })
  unitCost: string;

  @ApiProperty({ example: '70.00' })
  costPerServing: string;

  @ApiProperty({ example: 4.8 })
  totalQuantityUsed: number;

  @ApiProperty({ example: '1680.00' })
  totalCostUsed: string;
}

export class FbReportSoldItemDto {
  @ApiProperty({ example: 'item-uuid-1' })
  id: string;

  @ApiProperty({ example: 'Cheese Burger' })
  name: string;

  @ApiProperty({ example: 'Burger' })
  categoryName: string;

  @ApiProperty({ example: 'Kitchen' })
  station: string;

  @ApiProperty({ example: 45 })
  quantitySold: number;

  @ApiProperty({ example: '250.00' })
  unitPrice: string;

  @ApiProperty({ example: '11250.00' })
  revenue: string;

  @ApiProperty({ example: '3375.00' })
  cost: string;

  @ApiProperty({ example: '7875.00' })
  profit: string;

  @ApiProperty({ example: 70.0 })
  marginPct: number;

  @ApiProperty({ example: 38 })
  orderCount: number;

  @ApiProperty({ type: [FbReportItemIngredientDto] })
  ingredients: FbReportItemIngredientDto[];
}

export class FbReportDailyVolumeDto {
  @ApiProperty({ example: '2026-10-31' })
  date: string;

  @ApiProperty({ example: 'Sat, Oct 31' })
  displayDate: string;

  @ApiProperty({ example: 85 })
  totalItems: number;

  @ApiProperty({ example: 60 })
  foodCount: number;

  @ApiProperty({ example: 25 })
  beverageCount: number;

  @ApiProperty({ example: '24500.00' })
  totalRevenue: string;
}

export class FbReportItemOrderInstanceDto {
  @ApiProperty({ example: 'order-item-uuid' })
  id: string;

  @ApiProperty({ example: 'order-uuid' })
  orderId: string;

  @ApiProperty({ example: 'menu-item-uuid' })
  menuItemId?: string;

  @ApiProperty({ example: 'Cheese Burger' })
  itemName: string;

  @ApiProperty({ example: 'Burger' })
  categoryName: string;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ example: '250.00' })
  unitPrice: string;

  @ApiProperty({ example: '500.00' })
  totalPrice: string;

  @ApiProperty({ example: 'Table 4' })
  tableLabel: string;

  @ApiProperty({ example: 'Petra Mcdaniel' })
  waiterName: string;

  @ApiProperty({ example: '2026-10-31T14:30:00.000Z' })
  confirmedAt: string;

  @ApiProperty({ example: 'DELIVERED' })
  state: string;

  @ApiProperty({ example: 'No onion' })
  specialInstruction?: string;

  @ApiProperty({ example: ['Extra Cheese'] })
  modifiers: string[];

  // Receipt & Payment Details
  @ApiProperty({ example: 'B-1042', required: false })
  billNumber?: string;

  @ApiProperty({ example: 'PAID' })
  paymentStatus: string;

  @ApiProperty({ example: '500.00', required: false })
  billTotal?: string;

  @ApiProperty({ example: '500.00', required: false })
  amountPaid?: string;

  @ApiProperty({ example: ['CASH'] })
  paymentMethods: string[];
}

export class FbReportDataDto {
  @ApiProperty({ example: 'day' })
  period: string;

  @ApiProperty({ example: '2026-10-30' })
  from: string;

  @ApiProperty({ example: '2026-10-30' })
  to: string;

  @ApiProperty({ example: 'ETB' })
  currencyCode: string;

  @ApiProperty({ example: 'Main Branch' })
  branchName: string;

  // Overview Totals
  @ApiProperty({ example: '35000.00' })
  totalRevenue: string;

  @ApiProperty({ example: '10500.00' })
  totalCost: string;

  @ApiProperty({ example: '24500.00' })
  grossProfit: string;

  @ApiProperty({ example: 30.0 })
  overallCostPct: number;

  @ApiProperty({ example: 70.0 })
  overallMarginPct: number;

  // Food vs. Beverage Split
  @ApiProperty({
    example: {
      revenue: '26000.00',
      cost: '8060.00',
      margin: '17940.00',
      costPct: 31.0,
      marginPct: 69.0,
      sharePct: 74.3,
    },
  })
  food: {
    revenue: string;
    cost: string;
    margin: string;
    costPct: number;
    marginPct: number;
    sharePct: number;
  };

  @ApiProperty({
    example: {
      revenue: '9000.00',
      cost: '1440.00',
      margin: '7560.00',
      costPct: 16.0,
      marginPct: 84.0,
      sharePct: 25.7,
    },
  })
  beverage: {
    revenue: string;
    cost: string;
    margin: string;
    costPct: number;
    marginPct: number;
    sharePct: number;
  };

  // Waste / Spoilage
  @ApiProperty({ example: '420.00' })
  totalWasteCost: string;

  @ApiProperty({ type: [FbReportWasteItemDto] })
  topWasteItems: FbReportWasteItemDto[];

  // Top Cost Drivers
  @ApiProperty({ type: [FbReportIngredientCostDriverDto] })
  topCostDrivers: FbReportIngredientCostDriverDto[];

  // Category & Station breakdowns
  @ApiProperty({ type: [FbReportCategoryRowDto] })
  categories: FbReportCategoryRowDto[];

  @ApiProperty({ type: [FbReportStationRowDto] })
  stations: FbReportStationRowDto[];

  // Top Dishes & Drinks
  @ApiProperty({ type: [FbReportTopItemDto] })
  topSellingItems: FbReportTopItemDto[];

  @ApiProperty({ type: [FbReportTopItemDto] })
  topProfitableItems: FbReportTopItemDto[];

  // Detailed Sold Items & Daily Volumes
  @ApiProperty({ type: [FbReportDailyVolumeDto] })
  dailyVolumes: FbReportDailyVolumeDto[];

  @ApiProperty({ type: [FbReportSoldItemDto] })
  soldItems: FbReportSoldItemDto[];

  @ApiProperty({ type: [FbReportItemOrderInstanceDto] })
  orderInstances: FbReportItemOrderInstanceDto[];
}

export class FbReportResponseDto {
  @ApiProperty({ type: FbReportDataDto })
  data: FbReportDataDto;
}

