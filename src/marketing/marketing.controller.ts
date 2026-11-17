import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateMarketingCampaignDto,
  ListMarketingCampaignsQueryDto,
  SubmitMarketingPaymentDto,
} from './dto/marketing.dto';
import { MarketingService } from './marketing.service';

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'marketing',
  version: '1',
})
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  private requireUserId(request: { user?: { id?: string } }): string {
    const id = request?.user?.id;
    if (!id) {
      throw new UnauthorizedException();
    }
    return String(id);
  }

  @Get('campaigns')
  @ApiOkResponse({ description: 'Paginated marketing campaigns for tenant.' })
  listCampaigns(
    @Request() request,
    @Query() query: ListMarketingCampaignsQueryDto,
  ) {
    return this.marketingService.listForTenant(
      this.requireUserId(request),
      query,
    );
  }

  @Get('campaigns/:id')
  @ApiOkResponse({ description: 'Get single marketing campaign for tenant.' })
  getCampaign(@Request() request, @Param('id') id: string) {
    return this.marketingService.getForTenant(this.requireUserId(request), id);
  }

  @Post('campaigns')
  @ApiOkResponse({ description: 'Create a food promotion request.' })
  createCampaign(
    @Request() request,
    @Body() dto: CreateMarketingCampaignDto,
  ) {
    return this.marketingService.createRequest(
      this.requireUserId(request),
      dto,
    );
  }

  @Post('campaigns/:id/cancel')
  @ApiOkResponse({ description: 'Cancel a pending or confirmed request.' })
  cancelCampaign(@Request() request, @Param('id') id: string) {
    return this.marketingService.cancelByTenant(
      this.requireUserId(request),
      id,
    );
  }

  @Post('campaigns/:id/submit-payment')
  @ApiOkResponse({ description: 'Submit payment reference after promotion is done.' })
  submitPayment(
    @Request() request,
    @Param('id') id: string,
    @Body() dto: SubmitMarketingPaymentDto,
  ) {
    return this.marketingService.submitPayment(
      this.requireUserId(request),
      id,
      dto,
    );
  }
}

