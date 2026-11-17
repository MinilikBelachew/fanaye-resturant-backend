import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { PLATFORM_ROLE_CODE } from '../identity/identity.constants';
import { OPS_NOTIFY_EVENT, OpsEventType } from '../realtime/ops-events';
import { OpsGateway } from '../realtime/ops.gateway';
import { PublicFeedGateway } from '../realtime/public-feed.gateway';
import {
  CreateTestimonialDto,
  UpdateTestimonialDto,
} from './dto/testimonials.dto';

const PLATFORM_ROLES = new Set([
  PLATFORM_ROLE_CODE,
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
]);

@Injectable()
export class TestimonialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
    private readonly opsGateway: OpsGateway,
    private readonly publicFeedGateway: PublicFeedGateway,
  ) {}

  private broadcastUpdated(action: 'created' | 'updated' | 'deleted', id: string) {
    const payload = { action, id };
    try {
      this.opsGateway.server?.emit(OPS_NOTIFY_EVENT, {
        type: OpsEventType.TESTIMONIALS_UPDATED,
        severity: 'INFO',
        title: 'Landing testimonials updated',
        payload,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Best-effort ops broadcast
    }
    this.publicFeedGateway.broadcast(OpsEventType.TESTIMONIALS_UPDATED, payload);
  }

  private async assertSuperAdmin(userId: string): Promise<void> {
    const ctx = await this.identityContext.getByUserId(userId);
    if (!PLATFORM_ROLES.has(ctx.roleCode)) {
      throw new ForbiddenException('Super admin access required.');
    }
  }

  async listPublished() {
    const items = await this.prisma.landingTestimonial.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return { items };
  }

  async listForSuperAdmin(userId: string) {
    await this.assertSuperAdmin(userId);
    const items = await this.prisma.landingTestimonial.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return { items };
  }

  async create(userId: string, dto: CreateTestimonialDto) {
    await this.assertSuperAdmin(userId);
    const created = await this.prisma.landingTestimonial.create({
      data: {
        authorName: dto.authorName.trim(),
        authorRole: dto.authorRole.trim(),
        restaurantName: dto.restaurantName.trim(),
        quote: dto.quote.trim(),
        photoUrl: dto.photoUrl?.trim() || null,
        rating: dto.rating ?? 5,
        isPublished: dto.isPublished ?? true,
        sortOrder: dto.sortOrder ?? 0,
        createdById: userId,
      },
    });
    this.broadcastUpdated('created', created.id);
    return created;
  }

  async update(userId: string, id: string, dto: UpdateTestimonialDto) {
    await this.assertSuperAdmin(userId);
    const existing = await this.prisma.landingTestimonial.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Testimonial not found.');
    }

    const updated = await this.prisma.landingTestimonial.update({
      where: { id },
      data: {
        ...(dto.authorName !== undefined
          ? { authorName: dto.authorName.trim() }
          : {}),
        ...(dto.authorRole !== undefined
          ? { authorRole: dto.authorRole.trim() }
          : {}),
        ...(dto.restaurantName !== undefined
          ? { restaurantName: dto.restaurantName.trim() }
          : {}),
        ...(dto.quote !== undefined ? { quote: dto.quote.trim() } : {}),
        ...(dto.photoUrl !== undefined
          ? { photoUrl: dto.photoUrl?.trim() || null }
          : {}),
        ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
        ...(dto.isPublished !== undefined
          ? { isPublished: dto.isPublished }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    this.broadcastUpdated('updated', updated.id);
    return updated;
  }

  async remove(userId: string, id: string) {
    await this.assertSuperAdmin(userId);
    const existing = await this.prisma.landingTestimonial.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Testimonial not found.');
    }
    await this.prisma.landingTestimonial.delete({ where: { id } });
    this.broadcastUpdated('deleted', id);
    return { deleted: true, id };
  }
}
