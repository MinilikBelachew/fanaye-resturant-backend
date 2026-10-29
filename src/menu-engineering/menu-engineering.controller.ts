import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  MenuEngineeringQueryDto,
  MenuEngineeringResponseDto,
  MenuEngineeringTargetsDto,
  UpdateMenuEngineeringTargetsDto,
} from './dto/menu-engineering.dto';
import { MenuEngineeringService } from './menu-engineering.service';

@ApiTags('Menu engineering')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'admin/menu-engineering',
  version: '1',
})
export class MenuEngineeringController {
  constructor(private readonly service: MenuEngineeringService) {}

  @Get()
  @ApiOperation({
    summary:
      'Menu engineering matrix — popularity, plate cost, contribution margin and quadrant classification per menu item.',
  })
  @ApiOkResponse({ description: 'Menu engineering analytics.' })
  getAnalytics(
    @Request() request,
    @Query() query: MenuEngineeringQueryDto,
  ): Promise<MenuEngineeringResponseDto> {
    return this.service.getAnalytics(String(request.user.id), query);
  }

  @Get('targets')
  @ApiOperation({
    summary:
      'Tenant-level menu engineering targets (food cost % target and alert).',
  })
  @ApiOkResponse({ description: 'Current targets.' })
  getTargets(@Request() request): Promise<MenuEngineeringTargetsDto> {
    return this.service.getTargets(String(request.user.id));
  }

  @Patch('targets')
  @ApiOperation({
    summary: 'Update tenant-level menu engineering targets.',
  })
  @ApiOkResponse({ description: 'Updated targets.' })
  updateTargets(
    @Request() request,
    @Body() dto: UpdateMenuEngineeringTargetsDto,
  ): Promise<MenuEngineeringTargetsDto> {
    return this.service.updateTargets(String(request.user.id), dto);
  }
}
