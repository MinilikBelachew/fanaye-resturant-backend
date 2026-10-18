import {
  Body,
  Controller,
  Delete,
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
  AcceptTransferDto,
  CreateIngredientDto,
  CreateMainLocationDto,
  CreateProductionBatchDto,
  CreateSupplyRequestDto,
  CreateTransferDto,
  DecideSupplyRequestDto,
  InventoryListQueryDto,
  PostYieldTestDto,
  ReceiveStockDto,
  RejectTransferDto,
  StartCountDto,
  UpdateCountLinesDto,
  UpdateIngredientDto,
  UpdateLocationDto,
  UpdateYieldTestDto,
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

  @Get('network-status')
  getNetworkStatus(@Request() req) {
    return this.inventory.getNetworkStatus(String(req.user.id));
  }

  @Get('locations')
  listLocations(@Request() req) {
    return this.inventory.listLocations(String(req.user.id));
  }

  @Post('locations/main')
  createMainWarehouse(@Request() req, @Body() dto: CreateMainLocationDto) {
    return this.inventory.createMainWarehouse(String(req.user.id), dto);
  }

  @Post('locations/main/disable')
  disableMainWarehouse(@Request() req) {
    return this.inventory.disableMainWarehouse(String(req.user.id));
  }

  @Patch('locations/:id')
  updateLocation(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.inventory.updateLocation(String(req.user.id), id, dto);
  }

  @Get('transfers')
  listTransfers(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.listTransfers(String(req.user.id), query);
  }

  @Post('transfers')
  createAndSendTransfer(@Request() req, @Body() dto: CreateTransferDto) {
    return this.inventory.createAndSendTransfer(String(req.user.id), dto);
  }

  @Post('transfers/:id/accept')
  acceptTransfer(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptTransferDto,
  ) {
    return this.inventory.acceptTransfer(String(req.user.id), id, dto);
  }

  @Post('transfers/:id/reject')
  rejectTransfer(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTransferDto,
  ) {
    return this.inventory.rejectTransfer(String(req.user.id), id, dto ?? {});
  }

  @Get('supply-requests')
  listSupplyRequests(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.listSupplyRequests(String(req.user.id), query);
  }

  @Post('supply-requests')
  createSupplyRequest(@Request() req, @Body() dto: CreateSupplyRequestDto) {
    return this.inventory.createSupplyRequest(String(req.user.id), dto);
  }

  @Post('supply-requests/:id/approve')
  approveSupplyRequest(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideSupplyRequestDto,
  ) {
    return this.inventory.approveSupplyRequest(
      String(req.user.id),
      id,
      dto ?? {},
    );
  }

  @Post('supply-requests/:id/reject')
  rejectSupplyRequest(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideSupplyRequestDto,
  ) {
    return this.inventory.rejectSupplyRequest(
      String(req.user.id),
      id,
      dto ?? {},
    );
  }

  @Get('production-batches')
  listProductionBatches(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.listProductionBatches(String(req.user.id), query);
  }

  @Post('production-batches')
  postProductionBatch(@Request() req, @Body() dto: CreateProductionBatchDto) {
    return this.inventory.postProductionBatch(String(req.user.id), dto);
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

  @Delete('ingredients/:id')
  deleteIngredient(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.deleteIngredient(String(req.user.id), id);
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

  @Get('yield-tests')
  listYieldTests(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.listYieldTests(String(req.user.id), query);
  }

  @Post('yield-tests')
  postYieldTest(@Request() req, @Body() dto: PostYieldTestDto) {
    return this.inventory.postYieldTest(String(req.user.id), dto);
  }

  @Patch('yield-tests/:id')
  updateYieldTest(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateYieldTestDto,
  ) {
    return this.inventory.updateYieldTest(String(req.user.id), id, dto);
  }

  @Delete('yield-tests/:id')
  deleteYieldTest(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.deleteYieldTest(String(req.user.id), id);
  }

  @Get('ledger')
  listLedger(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.listLedger(String(req.user.id), query);
  }

  @Get('movement-series')
  getMovementSeries(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.getMovementSeries(String(req.user.id), query);
  }

  @Get('ledger/:id')
  getLedgerEntry(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.getLedgerEntry(String(req.user.id), id);
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
