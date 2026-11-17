import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  ListMarketingCampaignsQueryDto,
  UpdateMarketingCampaignStatusDto,
} from './dto/marketing.dto';
import { MarketingService } from './marketing.service';

@ApiTags('Super admin marketing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'super-admin/marketing',
  version: '1',
})
export class SuperAdminMarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  private requireUserId(request: { user?: { id?: string } }): string {
    const id = request?.user?.id;
    if (!id) {
      throw new UnauthorizedException();
    }
    return String(id);
  }

  @Get('campaigns')
  @ApiOkResponse({ description: 'Paginated marketing campaigns across all tenants.' })
  listCampaigns(
    @Request() request,
    @Query() query: ListMarketingCampaignsQueryDto,
  ) {
    return this.marketingService.listForSuperAdmin(
      this.requireUserId(request),
      query,
    );
  }

  @Get('campaigns/:id')
  @ApiOkResponse({ description: 'Get single marketing campaign for super admin.' })
  getCampaign(@Request() request, @Param('id') id: string) {
    return this.marketingService.getForSuperAdmin(
      this.requireUserId(request),
      id,
    );
  }

  @Patch('campaigns/:id')
  @ApiOkResponse({ description: 'Update campaign status, delivered views, and amount due.' })
  updateCampaign(
    @Request() request,
    @Param('id') id: string,
    @Body() dto: UpdateMarketingCampaignStatusDto,
  ) {
    return this.marketingService.updateBySuperAdmin(
      this.requireUserId(request),
      id,
      dto,
    );
  }
}

