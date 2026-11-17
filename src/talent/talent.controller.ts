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
  CreateTalentContactRequestDto,
  HireTalentToStaffDto,
  ListTalentProfilesQueryDto,
  ListTalentRequestsQueryDto,
  UpdateTalentRequestStatusDto,
} from './dto/talent.dto';
import { TalentService } from './talent.service';

@ApiTags('Talent')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'talent',
  version: '1',
})
export class TalentController {
  constructor(private readonly talentService: TalentService) {}

  private requireUserId(request: { user?: { id?: string } }): string {
    const id = request?.user?.id;
    if (!id) {
      throw new UnauthorizedException();
    }
    return String(id);
  }

  @Get('profiles')
  @ApiOkResponse({ description: 'Browse & filter available talent profiles.' })
  browseProfiles(
    @Request() request,
    @Query() query: ListTalentProfilesQueryDto,
  ) {
    return this.talentService.browseProfiles(
      this.requireUserId(request),
      query,
    );
  }

  @Get('requests')
  @ApiOkResponse({ description: 'List tenant talent contact/hire requests.' })
  listRequests(
    @Request() request,
    @Query() query: ListTalentRequestsQueryDto,
  ) {
    return this.talentService.listTenantRequests(
      this.requireUserId(request),
      query,
    );
  }

  @Post('requests')
  @ApiOkResponse({ description: 'Explicitly log contact / interview request.' })
  logContactRequest(
    @Request() request,
    @Body() dto: CreateTalentContactRequestDto,
  ) {
    return this.talentService.logContactRequest(
      this.requireUserId(request),
      dto,
    );
  }

  @Post('hire')
  @ApiOkResponse({ description: '1-click hire & onboard candidate to staff.' })
  hireAndOnboard(@Request() request, @Body() dto: HireTalentToStaffDto) {
    return this.talentService.hireAndOnboardByTenant(
      this.requireUserId(request),
      dto,
    );
  }

  @Patch('requests/:id')
  @ApiOkResponse({ description: 'Update tenant talent request status.' })
  updateRequest(
    @Request() request,
    @Param('id') id: string,
    @Body() dto: UpdateTalentRequestStatusDto,
  ) {
    return this.talentService.updateTenantRequestStatus(
      this.requireUserId(request),
      id,
      dto,
    );
  }
}

