import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateTestimonialDto,
  UpdateTestimonialDto,
} from './dto/testimonials.dto';
import { TestimonialsService } from './testimonials.service';

@ApiTags('Public Testimonials')
@Controller({
  path: 'testimonials',
  version: '1',
})
export class TestimonialsPublicController {
  constructor(private readonly testimonialsService: TestimonialsService) {}

  @Get()
  @ApiOkResponse({ description: 'List published landing page testimonials.' })
  listPublished() {
    return this.testimonialsService.listPublished();
  }
}

@ApiTags('Super Admin Testimonials')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'super-admin/testimonials',
  version: '1',
})
export class SuperAdminTestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) {}

  private requireUserId(request: { user?: { id?: string } }): string {
    const id = request?.user?.id;
    if (!id) {
      throw new UnauthorizedException();
    }
    return String(id);
  }

  @Get()
  @ApiOkResponse({ description: 'List all testimonials for super admin.' })
  listAll(@Request() request) {
    return this.testimonialsService.listForSuperAdmin(
      this.requireUserId(request),
    );
  }

  @Post()
  @ApiOkResponse({ description: 'Create a landing page testimonial.' })
  create(@Request() request, @Body() dto: CreateTestimonialDto) {
    return this.testimonialsService.create(this.requireUserId(request), dto);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update a landing page testimonial.' })
  update(
    @Request() request,
    @Param('id') id: string,
    @Body() dto: UpdateTestimonialDto,
  ) {
    return this.testimonialsService.update(
      this.requireUserId(request),
      id,
      dto,
    );
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Delete a landing page testimonial.' })
  remove(@Request() request, @Param('id') id: string) {
    return this.testimonialsService.remove(this.requireUserId(request), id);
  }
}

