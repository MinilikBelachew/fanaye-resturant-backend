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
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateIngredientDto,
  InventoryListQueryDto,
  ReceiveStockDto,
  StartCountDto,
  UpdateCountLinesDto,
  UpdateIngredientDto,
  WasteStockDto,
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'inventory',
  version: '1',
})
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('units')
  listUnits() {
    return this.inventory.listUnits();
  }

  @Get('ingredients')
  listIngredients(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.listIngredients(String(req.user.id), query);
  }

  @Post('ingredients')
  createIngredient(@Request() req, @Body() dto: CreateIngredientDto) {
    return this.inventory.createIngredient(String(req.user.id), dto);
  }

  @Patch('ingredients/:id')
  updateIngredient(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.inventory.updateIngredient(String(req.user.id), id, dto);
  }

  @Get('balances')
  listBalances(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.listBalances(String(req.user.id), query);
  }

  @Post('receive')
  receive(@Request() req, @Body() dto: ReceiveStockDto) {
    return this.inventory.receive(String(req.user.id), dto);
  }

  @Post('waste')
  waste(@Request() req, @Body() dto: WasteStockDto) {
    return this.inventory.waste(String(req.user.id), dto);
  }

  @Get('ledger')
  listLedger(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.listLedger(String(req.user.id), query);
  }

  @Get('counts')
  listCounts(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.listCounts(String(req.user.id), query);
  }

  @Post('counts')
  startCount(@Request() req, @Body() dto: StartCountDto) {
    return this.inventory.startCount(String(req.user.id), dto);
  }

  @Get('counts/:id')
  getCount(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.getCount(String(req.user.id), id);
  }

  @Patch('counts/:id/lines')
  updateCountLines(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCountLinesDto,
  ) {
    return this.inventory.updateCountLines(String(req.user.id), id, dto);
  }

  @Post('counts/:id/post')
  @ApiOkResponse()
  postCount(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.postCount(String(req.user.id), id);
  }
}
