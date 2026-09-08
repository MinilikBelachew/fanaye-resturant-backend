import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { MenuService } from './menu.service';
import {
  CreateMenuItemDto,
  CreateModifierGroupDto,
  UpdateMenuItemDto,
} from './dto/menu-item.dto';
import {
  AdminMenuItemListResponseDto,
  AdminMenuItemResponseDto,
  AdminMenuMetaResponseDto,
  AdminModifierGroupListResponseDto,
  AdminModifierGroupResponseDto,
} from './dto/menu-item-response.dto';

@ApiTags('Menu admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'admin',
  version: '1',
})
export class MenuAdminController {
  constructor(private readonly menu: MenuService) {}

  @Get('menu-meta')
  @ApiOkResponse({ type: AdminMenuMetaResponseDto })
  meta(@Request() request): Promise<AdminMenuMetaResponseDto> {
    return this.menu.meta(String(request.user.id));
  }

  @Get('modifier-groups')
  @ApiOkResponse({ type: AdminModifierGroupListResponseDto })
  listModifierGroups(
    @Request() request,
  ): Promise<AdminModifierGroupListResponseDto> {
    return this.menu.listModifierGroups(String(request.user.id));
  }

  @Post('modifier-groups')
  @ApiOkResponse({ type: AdminModifierGroupResponseDto })
  @HttpCode(HttpStatus.OK)
  createModifierGroup(
    @Request() request,
    @Body() dto: CreateModifierGroupDto,
  ): Promise<AdminModifierGroupResponseDto> {
    return this.menu.createModifierGroup(String(request.user.id), dto);
  }

  @Get('menu-items')
  @ApiOkResponse({ type: AdminMenuItemListResponseDto })
  list(@Request() request): Promise<AdminMenuItemListResponseDto> {
    return this.menu.list(String(request.user.id));
  }

  @Get('menu-items/:id')
  @ApiOkResponse({ type: AdminMenuItemResponseDto })
  getOne(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminMenuItemResponseDto> {
    return this.menu.getOne(String(request.user.id), id);
  }

  @Post('menu-items')
  @ApiOkResponse({ type: AdminMenuItemResponseDto })
  @HttpCode(HttpStatus.OK)
  create(
    @Request() request,
    @Body() dto: CreateMenuItemDto,
  ): Promise<AdminMenuItemResponseDto> {
    return this.menu.create(String(request.user.id), dto);
  }

  @Patch('menu-items/:id')
  @ApiOkResponse({ type: AdminMenuItemResponseDto })
  update(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemDto,
  ): Promise<AdminMenuItemResponseDto> {
    return this.menu.update(String(request.user.id), id, dto);
  }

  @Post('menu-items/:id/sold-out')
  @ApiOkResponse({ type: AdminMenuItemResponseDto })
  @HttpCode(HttpStatus.OK)
  soldOut(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminMenuItemResponseDto> {
    return this.menu.markSoldOut(String(request.user.id), id, true);
  }

  @Delete('menu-items/:id/sold-out')
  @ApiOkResponse({ type: AdminMenuItemResponseDto })
  clearSoldOut(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminMenuItemResponseDto> {
    return this.menu.markSoldOut(String(request.user.id), id, false);
  }
}
