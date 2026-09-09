import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FloorService } from './floor.service';
import { FloorTablesResponseDto } from './dto/floor-tables-response.dto';

@ApiTags('Waiter')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'waiter/tables',
  version: '1',
})
export class WaiterTablesController {
  constructor(private readonly floorService: FloorService) {}

  @Get()
  @ApiQuery({
    name: 'view',
    required: false,
    enum: ['my', 'available', 'attention', 'all'],
  })
  @ApiOkResponse({ type: FloorTablesResponseDto })
  list(
    @Request() request,
    @Query('view') view?: string,
  ): Promise<FloorTablesResponseDto> {
    return this.floorService.listWaiterTables(
      String(request.user.id),
      view ?? 'all',
    );
  }
}
