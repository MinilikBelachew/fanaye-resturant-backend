import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { StationsService } from './stations.service';
import { ExpectedVersionDto } from './dto/expected-version.dto';
import { ReportCannotPrepareDto } from './dto/report-cannot-prepare.dto';
import { StationQueueItemDto } from './dto/station-queue-response.dto';

@ApiTags('Order items')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'order-items',
  version: '1',
})
export class OrderItemsController {
  constructor(private readonly stationsService: StationsService) {}

  @Get(':id')
  @ApiOkResponse({ type: StationQueueItemDto })
  get(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StationQueueItemDto> {
    return this.stationsService.getItem(String(request.user.id), id);
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StationQueueItemDto })
  acknowledge(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpectedVersionDto,
  ): Promise<StationQueueItemDto> {
    return this.stationsService.acknowledge(String(request.user.id), id, dto);
  }

  @Post(':id/start-preparation')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StationQueueItemDto })
  start(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpectedVersionDto,
  ): Promise<StationQueueItemDto> {
    return this.stationsService.startPreparation(
      String(request.user.id),
      id,
      dto,
    );
  }

  @Post(':id/ready')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StationQueueItemDto })
  ready(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpectedVersionDto,
  ): Promise<StationQueueItemDto> {
    return this.stationsService.markReady(String(request.user.id), id, dto);
  }

  @Post(':id/production-exceptions')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StationQueueItemDto })
  cannotPrepare(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportCannotPrepareDto,
  ): Promise<StationQueueItemDto> {
    return this.stationsService.reportCannotPrepare(
      String(request.user.id),
      id,
      dto,
    );
  }
}
