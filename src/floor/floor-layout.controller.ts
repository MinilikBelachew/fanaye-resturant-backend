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
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FloorLayoutService } from './floor-layout.service';
import {
  CreateDiningTableDto,
  CreateTableLocationDto,
  UpdateDiningTableDto,
  UpdateTableLocationDto,
} from './dto/floor-layout.dto';
import {
  AdminDiningTableResponseDto,
  AdminFloorLayoutResponseDto,
  AdminTableLocationResponseDto,
} from './dto/floor-layout-response.dto';
import {
  TableDetailResponseDto,
  TableVisitHistoryResponseDto,
} from './dto/table-detail.dto';

@ApiTags('Floor layout admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'admin',
  version: '1',
})
export class FloorLayoutController {
  constructor(private readonly layout: FloorLayoutService) {}

  @Get('floor-layout')
  @ApiOkResponse({ type: AdminFloorLayoutResponseDto })
  getLayout(@Request() request): Promise<AdminFloorLayoutResponseDto> {
    return this.layout.layout(String(request.user.id));
  }

  @Post('table-locations')
  @ApiOkResponse({ type: AdminTableLocationResponseDto })
  @HttpCode(HttpStatus.OK)
  createLocation(
    @Request() request,
    @Body() dto: CreateTableLocationDto,
  ): Promise<AdminTableLocationResponseDto> {
    return this.layout.createLocation(String(request.user.id), dto);
  }

  @Patch('table-locations/:id')
  @ApiOkResponse({ type: AdminTableLocationResponseDto })
  updateLocation(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableLocationDto,
  ): Promise<AdminTableLocationResponseDto> {
    return this.layout.updateLocation(String(request.user.id), id, dto);
  }

  @Delete('table-locations/:id')
  @HttpCode(HttpStatus.OK)
  deleteLocation(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.layout.deleteLocation(String(request.user.id), id);
  }

  @Post('dining-tables')
  @ApiOkResponse({ type: AdminDiningTableResponseDto })
  @HttpCode(HttpStatus.OK)
  createTable(
    @Request() request,
    @Body() dto: CreateDiningTableDto,
  ): Promise<AdminDiningTableResponseDto> {
    return this.layout.createTable(String(request.user.id), dto);
  }

  @Get('dining-tables/:id/detail')
  @ApiOkResponse({ type: TableDetailResponseDto })
  tableDetail(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TableDetailResponseDto> {
    return this.layout.getTableDetail(String(request.user.id), id);
  }

  @Get('dining-tables/:id/sessions')
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'fromDate', required: false })
  @ApiQuery({ name: 'toDate', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: TableVisitHistoryResponseDto })
  tableSessions(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('q') q?: string,
    @Query('period') period?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<TableVisitHistoryResponseDto> {
    return this.layout.listTableVisits(String(request.user.id), id, {
      q,
      period,
      fromDate,
      toDate,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch('dining-tables/:id')
  @ApiOkResponse({ type: AdminDiningTableResponseDto })
  updateTable(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDiningTableDto,
  ): Promise<AdminDiningTableResponseDto> {
    return this.layout.updateTable(String(request.user.id), id, dto);
  }

  @Delete('dining-tables/:id')
  @HttpCode(HttpStatus.OK)
  deleteTable(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.layout.deleteTable(String(request.user.id), id);
  }
}
