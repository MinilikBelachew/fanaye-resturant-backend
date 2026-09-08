import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import {
  MenuCategoryDto,
  MenuItemSingleResponseDto,
  MenuListResponseDto,
} from './dto/menu-item-response.dto';

@ApiTags('Catalog')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'menu',
  version: '1',
})
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('items')
  @ApiOkResponse({ type: MenuListResponseDto })
  list(@Request() request): Promise<MenuListResponseDto> {
    return this.catalogService.list(String(request.user.id));
  }

  @Post('items')
  @ApiOkResponse({ type: MenuItemSingleResponseDto })
  create(
    @Request() request,
    @Body() dto: CreateMenuItemDto,
  ): Promise<MenuItemSingleResponseDto> {
    return this.catalogService.create(String(request.user.id), dto);
  }

  @Patch('items/:id')
  @ApiOkResponse({ type: MenuItemSingleResponseDto })
  update(
    @Request() request,
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
  ): Promise<MenuItemSingleResponseDto> {
    return this.catalogService.update(String(request.user.id), id, dto);
  }

  @Patch('items/:id/toggle-86')
  @ApiOkResponse({ type: MenuItemSingleResponseDto })
  toggle86(
    @Request() request,
    @Param('id') id: string,
  ): Promise<MenuItemSingleResponseDto> {
    return this.catalogService.toggle86(String(request.user.id), id);
  }

  @Delete('items/:id')
  @HttpCode(HttpStatus.OK)
  delete(
    @Request() request,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.catalogService.delete(String(request.user.id), id);
  }

  @Post('categories')
  @ApiOkResponse({ type: MenuCategoryDto })
  createCategory(
    @Request() request,
    @Body() dto: CreateCategoryDto,
  ): Promise<MenuCategoryDto> {
    return this.catalogService.createCategory(String(request.user.id), dto);
  }
}
