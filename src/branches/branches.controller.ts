import {
  Body,
  Controller,
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
import { BranchesService } from './branches.service';
import {
  CreateBranchDto,
  SwitchBranchDto,
  ToggleRushModeDto,
  UpdateBranchDto,
  UpdateBranchSettingsDto,
} from './dto/branch.dto';
import {
  BranchListResponseDto,
  BranchResponseDto,
} from './dto/branch-response.dto';
import { AuthContextDto } from '../identity/dto/auth-context.dto';

@ApiTags('Branches')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'branches',
  version: '1',
})
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @ApiOkResponse({ type: BranchListResponseDto })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'activeOnly', required: false })
  list(
    @Request() request,
    @Query('tenantId') tenantId?: string,
    @Query('activeOnly') activeOnly?: string,
  ): Promise<BranchListResponseDto> {
    return this.branchesService.listBranches(
      String(request.user.id),
      tenantId,
      activeOnly !== 'false',
    );
  }

  @Post()
  @ApiOkResponse({ type: BranchResponseDto })
  create(
    @Request() request,
    @Body() dto: CreateBranchDto,
  ): Promise<BranchResponseDto> {
    return this.branchesService.createBranch(String(request.user.id), dto);
  }

  @Patch(':branchId')
  @ApiOkResponse({ type: BranchResponseDto })
  update(
    @Request() request,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateBranchDto,
  ): Promise<BranchResponseDto> {
    return this.branchesService.updateBranch(
      String(request.user.id),
      branchId,
      dto,
    );
  }

  @Get(':branchId/settings')
  getSettings(
    @Request() request,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.branchesService.getBranchSettings(
      String(request.user.id),
      branchId,
    );
  }

  @Patch(':branchId/settings')
  updateSettings(
    @Request() request,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateBranchSettingsDto,
  ) {
    return this.branchesService.updateBranchSettings(
      String(request.user.id),
      branchId,
      dto,
    );
  }

  @Post(':branchId/rush-mode')
  toggleRushMode(
    @Request() request,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: ToggleRushModeDto,
  ) {
    return this.branchesService.toggleRushMode(
      String(request.user.id),
      branchId,
      dto.enabled,
    );
  }

  @Post('switch')
  @ApiOkResponse({ type: AuthContextDto })
  switch(
    @Request() request,
    @Body() dto: SwitchBranchDto,
  ): Promise<AuthContextDto> {
    return this.branchesService.switchBranch(
      String(request.user.id),
      dto.branchId,
    );
  }
}
