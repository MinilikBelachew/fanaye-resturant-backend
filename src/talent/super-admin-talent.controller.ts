import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateTalentProfileDto,
  ListTalentProfilesQueryDto,
  ListTalentRequestsQueryDto,
  UpdateTalentProfileDto,
  UpdateTalentRequestStatusDto,
} from './dto/talent.dto';
import { TalentService } from './talent.service';

@ApiTags('Super admin talent')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'super-admin/talent',
  version: '1',
})
export class SuperAdminTalentController {
  constructor(private readonly talentService: TalentService) {}

  private requireUserId(request: { user?: { id?: string } }): string {
    const id = request?.user?.id;
    if (!id) {
      throw new UnauthorizedException();
    }
    return String(id);
  }

  @Get('profiles')
  @ApiOkResponse({ description: 'List all talent profiles for super admin.' })
  listProfiles(
    @Request() request,
    @Query() query: ListTalentProfilesQueryDto,
  ) {
    return this.talentService.listSuperAdminProfiles(
      this.requireUserId(request),
      query,
    );
  }

  @Post('profiles')
  @ApiOkResponse({ description: 'Create a new talent profile.' })
  createProfile(@Request() request, @Body() dto: CreateTalentProfileDto) {
    return this.talentService.createProfile(this.requireUserId(request), dto);
  }

  @Patch('profiles/:id')
  @ApiOkResponse({ description: 'Update a talent profile.' })
  updateProfile(
    @Request() request,
    @Param('id') id: string,
    @Body() dto: UpdateTalentProfileDto,
  ) {
    return this.talentService.updateProfile(
      this.requireUserId(request),
      id,
      dto,
    );
  }

  @Get('requests')
  @ApiOkResponse({ description: 'List all talent hire requests.' })
  listRequests(
    @Request() request,
    @Query() query: ListTalentRequestsQueryDto,
  ) {
    return this.talentService.listSuperAdminRequests(
      this.requireUserId(request),
      query,
    );
  }

  @Get('requests/:id')
  @ApiOkResponse({ description: 'Get single talent hire request.' })
  getRequest(@Request() request, @Param('id') id: string) {
    return this.talentService.getSuperAdminRequest(
      this.requireUserId(request),
      id,
    );
  }

  @Patch('requests/:id')
  @ApiOkResponse({ description: 'Update talent hire request status.' })
  updateRequest(
    @Request() request,
    @Param('id') id: string,
    @Body() dto: UpdateTalentRequestStatusDto,
  ) {
    return this.talentService.updateRequestBySuperAdmin(
      this.requireUserId(request),
      id,
      dto,
    );
  }
}

