import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  PublicSiteSingleResponseDto,
  SiteSingleResponseDto,
  UpdateSiteDto,
} from './dto/site.dto';
import { SiteService } from './site.service';

@ApiTags('Site')
@Controller({
  path: 'site',
  version: '1',
})
export class SiteController {
  constructor(private readonly siteService: SiteService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOkResponse({ type: SiteSingleResponseDto })
  getMine(@Request() request): Promise<SiteSingleResponseDto> {
    return this.siteService.getMine(String(request.user.id));
  }

  @Put()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOkResponse({ type: SiteSingleResponseDto })
  updateMine(
    @Request() request,
    @Body() dto: UpdateSiteDto,
  ): Promise<SiteSingleResponseDto> {
    return this.siteService.updateMine(String(request.user.id), dto);
  }

  @Post('publish')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOkResponse({ type: SiteSingleResponseDto })
  publish(@Request() request): Promise<SiteSingleResponseDto> {
    return this.siteService.publishMine(String(request.user.id));
  }

  @Post('unpublish')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOkResponse({ type: SiteSingleResponseDto })
  unpublish(@Request() request): Promise<SiteSingleResponseDto> {
    return this.siteService.unpublishMine(String(request.user.id));
  }

  @Get('public/:slug')
  @ApiOkResponse({ type: PublicSiteSingleResponseDto })
  getPublic(@Param('slug') slug: string): Promise<PublicSiteSingleResponseDto> {
    return this.siteService.getPublicBySlug(slug);
  }
}
