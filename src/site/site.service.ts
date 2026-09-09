import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import {
  PublicSiteResponseDto,
  PublicSiteSingleResponseDto,
  SiteResponseDto,
  SiteSingleResponseDto,
  SiteThemeDto,
  UpdateSiteDto,
} from './dto/site.dto';

const TENANT_PROFILE_KEY = 'TENANT_PROFILE';

const DEFAULT_THEME: SiteThemeDto = {
  primaryColor: '#e85d04',
  accentColor: '#0f172a',
  backgroundColor: '#fffaf5',
  textColor: '#0f172a',
  logoUrl: null,
  fontDisplay: 'Fraunces',
  fontBody: 'DM Sans',
};

type ProfileJson = {
  city?: string;
  area?: string;
  address?: string;
  hours?: string;
  concept?: string;
  contactPhone?: string;
  contactEmail?: string;
};

@Injectable()
export class SiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
  ) {}

  private assertEditorRole(roleCode?: string | null) {
    const allowed = new Set([
      'OWNER_ADMIN',
      'MANAGER',
      'PLATFORM_ADMIN',
      'PLATFORM_SUPER_ADMIN',
      'SUPER_ADMIN',
    ]);
    if (!roleCode || !allowed.has(roleCode)) {
      throw new ForbiddenException('Website editor requires owner or manager.');
    }
  }

  private slugify(input: string): string {
    const base = input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return base || 'restaurant';
  }

  private defaultDraft(tenantName: string) {
    return {
      root: {
        props: {
          title: tenantName,
        },
      },
      content: [
        {
          type: 'Header',
          props: {
            id: 'header',
            showPhone: true,
            linksLabel: 'Menu,About,Contact',
            navAlign: 'split',
            size: 'md',
            sticky: true,
          },
        },
        {
          type: 'Hero',
          props: {
            id: 'hero',
            layout: 'overlay',
            headline: tenantName,
            subheadline:
              'Fresh plates, warm hospitality, and Ethiopian flavor.',
            ctaLabel: 'View menu',
            ctaHref: '#menu',
            secondaryCtaLabel: 'Visit us',
            secondaryCtaHref: '#contact',
            imageUrl: '',
            size: 'md',
            overlay: 'medium',
          },
        },
        {
          type: 'Menu',
          props: {
            id: 'menu',
            title: 'Our menu',
            subtitle: 'Seasonal favorites from the kitchen',
            categoryFilter: 'all',
            layout: 'cards',
            columns: '3',
            showImages: true,
            imageSize: 'md',
            size: 'md',
          },
        },
        {
          type: 'About',
          props: {
            id: 'about',
            layout: 'imageRight',
            title: 'Our story',
            body: `${tenantName} is built for gathering — from quick lunches to long evenings.`,
            imageUrl: '',
            stats: 'Years|12\nDishes|80+\nGuests daily|300',
            size: 'md',
          },
        },
        {
          type: 'Contact',
          props: {
            id: 'contact',
            title: 'Visit us',
            showHours: true,
            showMapLink: true,
            size: 'md',
          },
        },
        {
          type: 'Footer',
          props: {
            id: 'footer',
            layout: 'brandLinks',
            note: `© ${new Date().getFullYear()} ${tenantName}`,
            links: 'Menu|#menu\nAbout|#about\nHours|#hours\nContact|#contact',
            columns: '2',
            showSocial: true,
            instagram: '',
            facebook: '',
            tiktok: '',
            size: 'md',
          },
        },
      ],
      zones: {},
    };
  }

  private asTheme(value: unknown): SiteThemeDto {
    const raw =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    return {
      primaryColor: String(raw.primaryColor || DEFAULT_THEME.primaryColor),
      accentColor: String(raw.accentColor || DEFAULT_THEME.accentColor),
      backgroundColor: String(
        raw.backgroundColor || DEFAULT_THEME.backgroundColor,
      ),
      textColor: String(raw.textColor || DEFAULT_THEME.textColor),
      logoUrl:
        typeof raw.logoUrl === 'string' && raw.logoUrl ? raw.logoUrl : null,
      fontDisplay: String(raw.fontDisplay || DEFAULT_THEME.fontDisplay),
      fontBody: String(raw.fontBody || DEFAULT_THEME.fontBody),
    };
  }

  private asData(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return this.defaultDraft('Restaurant');
  }

  private toResponse(site: {
    id: string;
    tenantId: string;
    slug: string;
    status: string;
    themeJson: unknown;
    draftDataJson: unknown;
    publishedDataJson: unknown;
    publishedAt: Date | null;
    tenant: { displayName: string };
  }): SiteResponseDto {
    return {
      id: site.id,
      tenantId: site.tenantId,
      tenantName: site.tenant.displayName,
      slug: site.slug,
      status: site.status,
      theme: this.asTheme(site.themeJson),
      draftData: this.asData(site.draftDataJson),
      publishedData: site.publishedDataJson
        ? this.asData(site.publishedDataJson)
        : null,
      publishedAt: site.publishedAt?.toISOString() ?? null,
      publicPath: `/r/${site.slug}`,
    };
  }

  private async uniqueSlug(base: string, excludeTenantId?: string) {
    let candidate = this.slugify(base);
    let attempt = 0;
    while (attempt < 20) {
      const existing = await this.prisma.tenantSite.findUnique({
        where: { slug: candidate },
      });
      if (!existing || existing.tenantId === excludeTenantId) {
        return candidate;
      }
      attempt += 1;
      candidate = `${this.slugify(base)}-${attempt + 1}`;
    }
    return `${this.slugify(base)}-${Date.now().toString(36)}`;
  }

  private async ensureSite(tenantId: string) {
    const existing = await this.prisma.tenantSite.findUnique({
      where: { tenantId },
      include: { tenant: true },
    });
    if (existing) return existing;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const slug = await this.uniqueSlug(tenant.displayName);
    return this.prisma.tenantSite.create({
      data: {
        tenantId,
        slug,
        status: 'DRAFT',
        themeJson: DEFAULT_THEME as unknown as Prisma.InputJsonValue,
        draftDataJson: this.defaultDraft(
          tenant.displayName,
        ) as unknown as Prisma.InputJsonValue,
      },
      include: { tenant: true },
    });
  }

  async getMine(userId: string): Promise<SiteSingleResponseDto> {
    const context = await this.identity.getByUserId(userId);
    this.assertEditorRole(context.roleCode);
    if (!context.tenantId) {
      throw new BadRequestException('No tenant workspace selected.');
    }
    const site = await this.ensureSite(context.tenantId);
    return { data: this.toResponse(site) };
  }

  async updateMine(
    userId: string,
    dto: UpdateSiteDto,
  ): Promise<SiteSingleResponseDto> {
    const context = await this.identity.getByUserId(userId);
    this.assertEditorRole(context.roleCode);
    if (!context.tenantId) {
      throw new BadRequestException('No tenant workspace selected.');
    }

    const site = await this.ensureSite(context.tenantId);
    let nextSlug = site.slug;
    if (dto.slug?.trim()) {
      nextSlug = await this.uniqueSlug(dto.slug.trim(), context.tenantId);
    }

    const updated = await this.prisma.tenantSite.update({
      where: { id: site.id },
      data: {
        slug: nextSlug,
        ...(dto.theme
          ? {
              themeJson: {
                ...this.asTheme(site.themeJson),
                ...dto.theme,
              } as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(dto.draftData
          ? {
              draftDataJson: dto.draftData as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
      include: { tenant: true },
    });

    return { data: this.toResponse(updated) };
  }

  async publishMine(userId: string): Promise<SiteSingleResponseDto> {
    const context = await this.identity.getByUserId(userId);
    this.assertEditorRole(context.roleCode);
    if (!context.tenantId) {
      throw new BadRequestException('No tenant workspace selected.');
    }

    const site = await this.ensureSite(context.tenantId);
    const updated = await this.prisma.tenantSite.update({
      where: { id: site.id },
      data: {
        status: 'PUBLISHED',
        publishedDataJson: site.draftDataJson as Prisma.InputJsonValue,
        publishedAt: new Date(),
      },
      include: { tenant: true },
    });

    return { data: this.toResponse(updated) };
  }

  async unpublishMine(userId: string): Promise<SiteSingleResponseDto> {
    const context = await this.identity.getByUserId(userId);
    this.assertEditorRole(context.roleCode);
    if (!context.tenantId) {
      throw new BadRequestException('No tenant workspace selected.');
    }

    const site = await this.ensureSite(context.tenantId);
    const updated = await this.prisma.tenantSite.update({
      where: { id: site.id },
      data: {
        status: 'DRAFT',
      },
      include: { tenant: true },
    });

    return { data: this.toResponse(updated) };
  }

  private async readProfile(tenantId: string): Promise<ProfileJson> {
    const row = await this.prisma.tenantEntitlement.findFirst({
      where: {
        tenantId,
        entitlementKey: TENANT_PROFILE_KEY,
        effectiveTo: null,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!row?.valueJson || typeof row.valueJson !== 'object') return {};
    return row.valueJson as ProfileJson;
  }

  private async publicMenu(tenantId: string) {
    const menu = await this.prisma.menu.findFirst({
      where: { tenantId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!menu) return [];

    const items = await this.prisma.menuItem.findMany({
      where: {
        tenantId,
        menuId: menu.id,
        status: 'ACTIVE',
      },
      include: { category: true, imageFile: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      price: Number(item.currentPrice),
      currencyCode: item.currencyCode || 'ETB',
      imageUrl: item.imageFile?.path || item.imageKey || null,
      categoryId: item.menuCategoryId || item.category?.id || '',
      categoryName: item.category?.name || 'Menu',
      soldOut: item.soldOut,
    }));
  }

  async getPublicBySlug(slug: string): Promise<PublicSiteSingleResponseDto> {
    const site = await this.prisma.tenantSite.findUnique({
      where: { slug: slug.toLowerCase() },
      include: {
        tenant: {
          include: {
            staffMemberships: {
              where: { status: 'ACTIVE' },
              include: { user: true },
              take: 1,
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!site || site.status !== 'PUBLISHED' || !site.publishedDataJson) {
      throw new NotFoundException('Published site not found.');
    }

    const profile = await this.readProfile(site.tenantId);
    const manager = site.tenant.staffMemberships[0]?.user;
    const menuItems = await this.publicMenu(site.tenantId);

    const data: PublicSiteResponseDto = {
      slug: site.slug,
      tenantName: site.tenant.displayName,
      theme: this.asTheme(site.themeJson),
      data: this.asData(site.publishedDataJson),
      phone: profile.contactPhone || manager?.phone || null,
      email: profile.contactEmail || manager?.email || null,
      city: profile.city || null,
      address: profile.address || null,
      hours: profile.hours || null,
      menuItems,
    };

    return { data };
  }
}
