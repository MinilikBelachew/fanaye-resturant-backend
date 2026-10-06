import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FloorService } from './floor.service';
import { DispatcherBoardResponseDto } from './dto/dispatcher-board.dto';
import { OpenCallPickupDto } from './dto/open-call-pickup.dto';
import { TableSessionResponseDto } from './dto/table-session-response.dto';

@ApiTags('Dispatcher')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'dispatcher',
  version: '1',
})
export class DispatcherController {
  constructor(private readonly floorService: FloorService) {}

  @Get('calls')
  @ApiOkResponse({ type: DispatcherBoardResponseDto })
  listCalls(@Request() request): Promise<DispatcherBoardResponseDto> {
    return this.floorService.listDispatcherBoard(String(request.user.id));
  }

  @Post('calls')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: TableSessionResponseDto })
  @HttpCode(HttpStatus.OK)
  openCall(
    @Request() request,
    @Body() dto: OpenCallPickupDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TableSessionResponseDto> {
    return this.floorService.openCallPickup(
      String(request.user.id),
      dto,
      idempotencyKey,
    );
  }
}
