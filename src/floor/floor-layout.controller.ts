import {
  Body,
  Controller,
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

  @Post('dining-tables')
  @ApiOkResponse({ type: AdminDiningTableResponseDto })
  @HttpCode(HttpStatus.OK)
  createTable(
    @Request() request,
    @Body() dto: CreateDiningTableDto,
  ): Promise<AdminDiningTableResponseDto> {
    return this.layout.createTable(String(request.user.id), dto);
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
}
