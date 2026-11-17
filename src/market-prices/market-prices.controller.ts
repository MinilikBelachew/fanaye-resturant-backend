import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  BulkUpdateMarketPricesDto,
  CreateMarketCategoryDto,
  CreateMarketItemDto,
  CreateMarketReporterDto,
  CreateMarketUnitDto,
  CreateMarketplaceDto,
  ListMarketItemsQueryDto,
  UpdateMarketCategoryDto,
  UpdateMarketItemDto,
  UpdateMarketReporterStatusDto,
  UpdateMarketUnitDto,
  UpdateMarketplaceDto,
  UpdatePlatformRolePermissionsDto,
  UpsertMarketPriceDto,
} from './dto/market-prices.dto';
import { MarketPricesService } from './market-prices.service';

@ApiTags('Market Prices')
@Controller({
  path: 'market-prices',
  version: '1',
})
export class MarketPricesController {
  constructor(private readonly service: MarketPricesService) {}

  // ---- Public Landing & Detail Endpoints (No Auth) ----

  @Get('public/metadata')
  listPublicMetadata() {
    return this.service.listMetadata(false);
  }

  @Get('public/items')
  listPublicItems(@Query() query: ListMarketItemsQueryDto) {
    return this.service.listItems(query, false);
  }

  @Get('public/items/:idOrSlug')
  getPublicItemDetail(@Param('idOrSlug') idOrSlug: string) {
    return this.service.getItemDetail(idOrSlug);
  }

  @Get('public/history')
  listPublicPriceHistory(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('itemId') itemId?: string,
    @Query('marketplaceId') marketplaceId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listPriceHistory({
      dateFrom,
      dateTo,
      itemId,
      marketplaceId,
      categoryId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ---- Tenant (Owner & Manager) Endpoints ----

  @Get('tenant/items')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async listTenantItems(
    @Request() req: { user: { id: string } },
    @Query() query: ListMarketItemsQueryDto,
  ) {
    await this.service.assertTenantCanRead(req.user.id);
    return this.service.listItems(query, false);
  }

  @Get('tenant/items/:idOrSlug')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async getTenantItemDetail(
    @Request() req: { user: { id: string } },
    @Param('idOrSlug') idOrSlug: string,
  ) {
    await this.service.assertTenantCanRead(req.user.id);
    return this.service.getItemDetail(idOrSlug);
  }

  // ---- Platform (Super Admin & Market Reporter) Endpoints ----

  @Get('admin/me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  getMyPlatformPermissions(@Request() req: { user: { id: string } }) {
    return this.service.getMyPlatformPermissions(req.user.id);
  }

  @Get('admin/metadata')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async listAdminMetadata(
    @Request() req: { user: { id: string } },
    @Query('includeInactive') includeInactive?: string,
  ) {
    await this.service.getMyPlatformPermissions(req.user.id);
    return this.service.listMetadata(includeInactive === 'true');
  }

  @Get('admin/items')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async listAdminItems(
    @Request() req: { user: { id: string } },
    @Query() query: ListMarketItemsQueryDto,
  ) {
    await this.service.getMyPlatformPermissions(req.user.id);
    return this.service.listItems(query, true);
  }

  @Post('admin/prices')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  upsertPrice(
    @Request() req: { user: { id: string } },
    @Body() dto: UpsertMarketPriceDto,
  ) {
    return this.service.upsertPrice(req.user.id, dto);
  }

  @Post('admin/prices/bulk')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  bulkUpsertPrices(
    @Request() req: { user: { id: string } },
    @Body() dto: BulkUpdateMarketPricesDto,
  ) {
    return this.service.bulkUpsertPrices(req.user.id, dto);
  }

  @Post('admin/items')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  createItem(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateMarketItemDto,
  ) {
    return this.service.createItem(req.user.id, dto);
  }

  @Patch('admin/items/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  updateItem(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateMarketItemDto,
  ) {
    return this.service.updateItem(req.user.id, id, dto);
  }

  @Post('admin/categories')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  createCategory(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateMarketCategoryDto,
  ) {
    return this.service.createCategory(req.user.id, dto);
  }

  @Patch('admin/categories/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  updateCategory(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateMarketCategoryDto,
  ) {
    return this.service.updateCategory(req.user.id, id, dto);
  }

  @Post('admin/units')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  createUnit(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateMarketUnitDto,
  ) {
    return this.service.createUnit(req.user.id, dto);
  }

  @Patch('admin/units/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  updateUnit(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateMarketUnitDto,
  ) {
    return this.service.updateUnit(req.user.id, id, dto);
  }

  @Post('admin/marketplaces')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  createMarketplace(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateMarketplaceDto,
  ) {
    return this.service.createMarketplace(req.user.id, dto);
  }

  @Patch('admin/marketplaces/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  updateMarketplace(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateMarketplaceDto,
  ) {
    return this.service.updateMarketplace(req.user.id, id, dto);
  }

  @Get('admin/reporters')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  listReporters(@Request() req: { user: { id: string } }) {
    return this.service.listReporters(req.user.id);
  }

  @Post('admin/reporters')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  createReporter(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateMarketReporterDto,
  ) {
    return this.service.createReporter(req.user.id, dto);
  }

  @Patch('admin/reporters/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  updateReporterStatus(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateMarketReporterStatusDto,
  ) {
    return this.service.updateReporterStatus(req.user.id, id, dto);
  }

  @Get('admin/platform-roles/:roleCode/permissions')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  getPlatformRolePermissions(
    @Request() req: { user: { id: string } },
    @Param('roleCode') roleCode: string,
  ) {
    return this.service.getPlatformRolePermissions(req.user.id, roleCode);
  }

  @Put('admin/platform-roles/:roleCode/permissions')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  updatePlatformRolePermissions(
    @Request() req: { user: { id: string } },
    @Param('roleCode') roleCode: string,
    @Body() dto: UpdatePlatformRolePermissionsDto,
  ) {
    return this.service.updatePlatformRolePermissions(
      req.user.id,
      roleCode,
      dto,
    );
  }
}

