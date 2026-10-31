import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import {
  CreateFinanceCategoryDto,
  CreateFinanceEntryDto,
  FinanceEntriesQueryDto,
  FinanceInventoryItemsQueryDto,
  FinanceSummaryQueryDto,
  UpdateFinanceCategoryDto,
  UpdateFinanceEntryDto,
  VoidFinanceEntryDto,
} from './dto/finance.dto';

@ApiTags('Finance (Owner)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'owner/finance',
  version: '1',
})
export class OwnerFinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Cost + revenue summary across the tenant, with per-branch rollup',
  })
  getSummary(@Request() req, @Query() query: FinanceSummaryQueryDto) {
    return this.finance.getSummary(String(req.user.id), query);
  }

  @Get('entries')
  @ApiOperation({ summary: 'Every income and expense line across the tenant' })
  listEntries(@Request() req, @Query() query: FinanceEntriesQueryDto) {
    return this.finance.listEntries(String(req.user.id), query);
  }

  @Get('inventory/items')
  @ApiOperation({
    summary: 'Per-ingredient stock movement across the tenant',
  })
  getInventoryItems(
    @Request() req,
    @Query() query: FinanceInventoryItemsQueryDto,
  ) {
    return this.finance.getInventoryItems(String(req.user.id), query);
  }

  @Get('inventory/items/:ingredientId')
  @ApiOperation({ summary: 'How one ingredient was spent, per menu item' })
  getInventoryItemUsage(
    @Request() req,
    @Param('ingredientId', ParseUUIDPipe) ingredientId: string,
    @Query() query: FinanceSummaryQueryDto,
  ) {
    return this.finance.getInventoryItemUsage(
      String(req.user.id),
      ingredientId,
      query,
    );
  }

  @Get('inventory/items/:ingredientId/orders')
  @ApiOperation({ summary: 'Per-order breakdown of ingredient consumption' })
  getInventoryItemOrders(
    @Request() req,
    @Param('ingredientId', ParseUUIDPipe) ingredientId: string,
    @Query() query: FinanceSummaryQueryDto,
  ) {
    return this.finance.getInventoryItemOrders(
      String(req.user.id),
      ingredientId,
      query,
    );
  }

  @Get('categories')
  @ApiOperation({ summary: 'List finance categories' })
  listCategories(@Request() req, @Query('direction') direction?: string) {
    return this.finance.listCategories(String(req.user.id), direction);
  }

  @Post('entries')
  @ApiOperation({ summary: 'Record a custom expense or income line' })
  createEntry(@Request() req, @Body() dto: CreateFinanceEntryDto) {
    return this.finance.createEntry(String(req.user.id), dto);
  }

  @Patch('entries/:id')
  @ApiOperation({ summary: 'Update a manual finance entry' })
  updateEntry(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFinanceEntryDto,
  ) {
    return this.finance.updateEntry(String(req.user.id), id, dto);
  }

  @Post('entries/:id/void')
  @ApiOperation({ summary: 'Void a manual finance entry (never deleted)' })
  voidEntry(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidFinanceEntryDto,
  ) {
    return this.finance.voidEntry(String(req.user.id), id, dto);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a custom finance category' })
  createCategory(@Request() req, @Body() dto: CreateFinanceCategoryDto) {
    return this.finance.createCategory(String(req.user.id), dto);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Rename or archive a finance category' })
  updateCategory(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFinanceCategoryDto,
  ) {
    return this.finance.updateCategory(String(req.user.id), id, dto);
  }
}
