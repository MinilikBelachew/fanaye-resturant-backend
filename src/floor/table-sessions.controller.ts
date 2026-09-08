import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FloorService } from './floor.service';
import { StartTableSessionDto } from './dto/start-table-session.dto';
import { CloseTableSessionDto } from './dto/close-table-session.dto';
import { TableSessionResponseDto } from './dto/table-session-response.dto';

@ApiTags('Table sessions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'table-sessions',
  version: '1',
})
export class TableSessionsController {
  constructor(private readonly floorService: FloorService) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: TableSessionResponseDto })
  @HttpCode(HttpStatus.OK)
  start(
    @Request() request,
    @Body() dto: StartTableSessionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TableSessionResponseDto> {
    return this.floorService.startSession(
      String(request.user.id),
      dto,
      idempotencyKey,
    );
  }

  @Get(':id')
  @ApiOkResponse({ type: TableSessionResponseDto })
  get(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TableSessionResponseDto> {
    return this.floorService.getSession(String(request.user.id), id);
  }

  @Post(':id/close')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: TableSessionResponseDto })
  @HttpCode(HttpStatus.OK)
  close(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseTableSessionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TableSessionResponseDto> {
    return this.floorService.closeSession(
      String(request.user.id),
      id,
      dto,
      idempotencyKey,
    );
  }
}
