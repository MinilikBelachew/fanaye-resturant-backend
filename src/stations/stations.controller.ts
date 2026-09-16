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
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { StationsService } from './stations.service';
import { StationQueueResponseDto } from './dto/station-queue-response.dto';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { StationManagementResponseDto } from './dto/station-response.dto';

@ApiTags('Stations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'stations',
  version: '1',
})
export class StationsController {
  constructor(private readonly stationsService: StationsService) {}

  @Get()
  @ApiOkResponse({ type: [StationManagementResponseDto] })
  listStations(@Request() request): Promise<StationManagementResponseDto[]> {
    return this.stationsService.listStations(String(request.user.id));
  }

  @Post()
  @ApiOkResponse({ type: StationManagementResponseDto })
  createStation(
    @Request() request,
    @Body() dto: CreateStationDto,
  ): Promise<StationManagementResponseDto> {
    return this.stationsService.createStation(String(request.user.id), dto);
  }

  @Patch(':stationId')
  @ApiOkResponse({ type: StationManagementResponseDto })
  updateStation(
    @Request() request,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Body() dto: UpdateStationDto,
  ): Promise<StationManagementResponseDto> {
    return this.stationsService.updateStation(
      String(request.user.id),
      stationId,
      dto,
    );
  }

  @Delete(':stationId')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean' }, message: { type: 'string' } },
    },
  })
  deleteStation(
    @Request() request,
    @Param('stationId', ParseUUIDPipe) stationId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.stationsService.deleteStation(
      String(request.user.id),
      stationId,
    );
  }

  @Get(':stationId/queue')
  @ApiQuery({ name: 'state', required: false })
  @ApiOkResponse({ type: StationQueueResponseDto })
  queue(
    @Request() request,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Query('state') state?: string,
  ): Promise<StationQueueResponseDto> {
    return this.stationsService.listQueue(
      String(request.user.id),
      stationId,
      state,
    );
  }
}
