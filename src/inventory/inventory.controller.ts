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
  BranchAnalyticsQueryDto,
  CreateCategoryDto,
  CreateCustomUnitDto,
  CreateDriverDto,
  CreateIngredientDto,
  CreateMainLocationDto,
  CreateMaterialDto,
  CreateProductionBatchDto,
  CreatePushDropDto,
  CreateSupplyRequestDto,
  CreateSupplyRequestV2Dto,
  CreateTransferDto,
  CreateUnitConversionDto,
  CreateVendorDto,
  DecideSupplyRequestDto,
  DispatchTransferDto,
  InventoryListQueryDto,
  MaterialListQueryDto,
  PostYieldTestDto,
  ReceiveStockBatchDto,
  ReceiveStockDto,
  RejectTransferDto,
  StartCountDto,
  UpdateCategoryDto,
  UpdateCountLinesDto,
  UpdateCustomUnitDto,
  UpdateDriverDto,
  UpdateIngredientDto,
  UpdateLocationDto,
  UpdateMaterialDto,
  UpdateUnitConversionDto,
  UpdateVendorDto,
  UpdateYieldTestDto,
  UpsertMaterialBalanceDto,
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

  @Get('analytics/branch')
  getBranchAnalytics(@Request() req, @Query() query: BranchAnalyticsQueryDto) {
    return this.inventory.getBranchAnalytics(String(req.user.id), query);
  }

  @Get('analytics/central')
  getCentralAnalytics(@Request() req, @Query() query: BranchAnalyticsQueryDto) {
    return this.inventory.getCentralAnalytics(String(req.user.id), query);
  }

  @Get('units')
  listUnits(@Request() req) {
    return this.inventory.listUnits(String(req.user.id));
  }

  @Get('units/compatible')
  listCompatibleUnits(@Request() req, @Query('baseUnit') baseUnit: string) {
    return this.inventory.listCompatibleUnits(String(req.user.id), baseUnit);
  }

  @Post('units')
  createCustomUnit(@Request() req, @Body() dto: CreateCustomUnitDto) {
    return this.inventory.createCustomUnit(String(req.user.id), dto);
  }

  @Patch('units/:id')
  updateCustomUnit(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomUnitDto,
  ) {
    return this.inventory.updateCustomUnit(String(req.user.id), id, dto);
  }

  @Delete('units/:id')
  deleteCustomUnit(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.deleteCustomUnit(String(req.user.id), id);
  }

  @Get('unit-conversions')
  listUnitConversions(@Request() req) {
    return this.inventory.listUnitConversions(String(req.user.id));
  }

  @Post('unit-conversions')
  createUnitConversion(@Request() req, @Body() dto: CreateUnitConversionDto) {
    return this.inventory.createUnitConversion(String(req.user.id), dto);
  }

  @Patch('unit-conversions/:id')
  updateUnitConversion(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitConversionDto,
  ) {
    return this.inventory.updateUnitConversion(String(req.user.id), id, dto);
  }

  @Delete('unit-conversions/:id')
  deleteUnitConversion(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.deleteUnitConversion(String(req.user.id), id);
  }

  @Get('categories')
  listCategories(@Request() req) {
    return this.inventory.listCategories(String(req.user.id));
  }

  @Post('categories')
  createCategory(@Request() req, @Body() dto: CreateCategoryDto) {
    return this.inventory.createCategory(String(req.user.id), dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.inventory.updateCategory(String(req.user.id), id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.deleteCategory(String(req.user.id), id);
  }

  // ─── Materials ────────────────────────────────────────────────────────────

  @Get('materials')
  listMaterials(@Request() req, @Query() query: MaterialListQueryDto) {
    return this.inventory.listMaterials(String(req.user.id), query);
  }

  @Post('materials')
  createMaterial(@Request() req, @Body() dto: CreateMaterialDto) {
    return this.inventory.createMaterial(String(req.user.id), dto);
  }

  @Patch('materials/:id')
  updateMaterial(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialDto,
  ) {
    return this.inventory.updateMaterial(String(req.user.id), id, dto);
  }

  @Delete('materials/:id')
  deleteMaterial(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.deleteMaterial(String(req.user.id), id);
  }

  @Post('materials/balances')
  upsertMaterialBalance(@Request() req, @Body() dto: UpsertMaterialBalanceDto) {
    return this.inventory.upsertMaterialBalance(String(req.user.id), dto);
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

  @Post('supply-requests/:id/prepare')
  startPreparingSupplyRequest(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventory.startPreparingSupplyRequest(String(req.user.id), id);
  }

  @Post('supply-requests/:id/dispatch')
  dispatchSupplyRequest(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideSupplyRequestDto,
  ) {
    return this.inventory.dispatchSupplyRequest(
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

  @Post('receive-batch')
  receiveBatch(@Request() req, @Body() dto: ReceiveStockBatchDto) {
    return this.inventory.receiveBatch(String(req.user.id), dto);
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

  // ─── Drivers ──────────────────────────────────────────────────────────────

  @Get('drivers')
  listDrivers(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.listDrivers(String(req.user.id), query);
  }

  @Post('drivers')
  createDriver(@Request() req, @Body() dto: CreateDriverDto) {
    return this.inventory.createDriver(String(req.user.id), dto);
  }

  @Patch('drivers/:id')
  updateDriver(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.inventory.updateDriver(String(req.user.id), id, dto);
  }

  @Delete('drivers/:id')
  deleteDriver(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.deleteDriver(String(req.user.id), id);
  }

  // ─── Vendors (suppliers) ──────────────────────────────────────────────────

  @Get('vendors')
  listVendors(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.listVendors(String(req.user.id), query);
  }

  @Post('vendors')
  createVendor(@Request() req, @Body() dto: CreateVendorDto) {
    return this.inventory.createVendor(String(req.user.id), dto);
  }

  @Patch('vendors/:id')
  updateVendor(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.inventory.updateVendor(String(req.user.id), id, dto);
  }

  @Delete('vendors/:id')
  deleteVendor(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.deleteVendor(String(req.user.id), id);
  }

  // ─── Transfer dispatch (assign driver → IN_TRANSIT) ───────────────────────

  @Post('transfers/:id/dispatch')
  dispatchTransfer(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DispatchTransferDto,
  ) {
    return this.inventory.dispatchTransfer(String(req.user.id), id, dto);
  }

  // ─── Push drops ───────────────────────────────────────────────────────────

  @Get('push-drops')
  listPushDrops(@Request() req, @Query() query: InventoryListQueryDto) {
    return this.inventory.listPushDrops(String(req.user.id), query);
  }

  @Post('push-drops')
  createPushDrop(@Request() req, @Body() dto: CreatePushDropDto) {
    return this.inventory.createPushDrop(String(req.user.id), dto);
  }

  // ─── Supply request v2 (with optional autoApprove) ────────────────────────

  @Post('supply-requests/v2')
  createSupplyRequestV2(@Request() req, @Body() dto: CreateSupplyRequestV2Dto) {
    return this.inventory.createSupplyRequestV2(String(req.user.id), dto);
  }

  // ─── Driver Portal ────────────────────────────────────────────────────────

  @Get('driver/my-transfers')
  getMyDriverTransfers(@Request() req) {
    return this.inventory.getMyDriverTransfers(String(req.user.id));
  }

  @Post('transfers/:id/start-trip')
  startDriverTrip(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.startDriverTrip(String(req.user.id), id);
  }

  @Post('transfers/:id/arrived')
  markDriverArrived(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.markDriverArrived(String(req.user.id), id);
  }
}
