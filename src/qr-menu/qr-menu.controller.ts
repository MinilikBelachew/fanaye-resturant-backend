import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { QrMenuService } from './qr-menu.service';
import {
  QrMenuConfigDto,
  UpdateQrMenuConfigDto,
} from './dto/qr-menu-config.dto';
import { PublicTableMenuResponseDto } from './dto/public-table-menu-response.dto';
import { GuestOrderDto, GuestOrderResponseDto } from './dto/guest-order.dto';
import {
  ServiceRequestDto,
  ServiceRequestResponseDto,
} from './dto/service-request.dto';

@ApiTags('Public Table QR')
@Controller({
  path: 'public/r',
  version: '1',
})
export class PublicQrMenuController {
  constructor(private readonly qrMenuService: QrMenuService) {}

  @Get(':slug/tables/:tableId')
  @ApiOkResponse({ type: PublicTableMenuResponseDto })
  getMenu(
    @Param('slug') slug: string,
    @Param('tableId') tableId: string,
  ): Promise<PublicTableMenuResponseDto> {
    return this.qrMenuService.getPublicTableMenu(slug, tableId);
  }

  @Post(':slug/tables/:tableId/orders')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GuestOrderResponseDto })
  submitOrder(
    @Param('slug') slug: string,
    @Param('tableId') tableId: string,
    @Body() dto: GuestOrderDto,
  ): Promise<GuestOrderResponseDto> {
    return this.qrMenuService.submitGuestOrder(slug, tableId, dto);
  }

  @Post(':slug/tables/:tableId/service-request')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  serviceRequest(
    @Param('slug') slug: string,
    @Param('tableId') tableId: string,
    @Body() dto: ServiceRequestDto,
  ): Promise<ServiceRequestResponseDto> {
    return this.qrMenuService.submitServiceRequest(slug, tableId, dto);
  }
}

@ApiTags('Admin QR Menu Builder')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'admin/qr-menu',
  version: '1',
})
export class AdminQrMenuController {
  constructor(private readonly qrMenuService: QrMenuService) {}

  @Get('config')
  @ApiOkResponse({ type: QrMenuConfigDto })
  getConfig(@Request() request): Promise<QrMenuConfigDto> {
    return this.qrMenuService.getAdminConfig(String(request.user.id));
  }

  @Put('config')
  @ApiOkResponse({ type: QrMenuConfigDto })
  updateConfig(
    @Request() request,
    @Body() dto: UpdateQrMenuConfigDto,
  ): Promise<QrMenuConfigDto> {
    return this.qrMenuService.updateAdminConfig(String(request.user.id), dto);
  }

  @Get('tables')
  getTables(@Request() request) {
    return this.qrMenuService.getTablesQrData(String(request.user.id));
  }
}
