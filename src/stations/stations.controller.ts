import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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

@ApiTags('Stations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'stations',
  version: '1',
})
export class StationsController {
  constructor(private readonly stationsService: StationsService) {}

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
