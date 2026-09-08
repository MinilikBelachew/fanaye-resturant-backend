import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FloorService } from './floor.service';
import { FloorTablesResponseDto } from './dto/floor-tables-response.dto';

@ApiTags('Floor')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'floor',
  version: '1',
})
export class FloorController {
  constructor(private readonly floorService: FloorService) {}

  @Get('tables')
  @ApiOkResponse({ type: FloorTablesResponseDto })
  list(@Request() request): Promise<FloorTablesResponseDto> {
    return this.floorService.listFloor(String(request.user.id));
  }
}
