import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { MenuService } from './menu.service';
import {
  ImportScannedMenuDto,
  ImportScannedMenuResponseDto,
  MenuScanPreviewResponseDto,
  ScannedMenuItemDto,
} from './dto/menu-scan.dto';

type StationRow = { id: string; name: string; code: string | null };

@Injectable()
export class MenuScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly menu: MenuService,
    private readonly config: ConfigService,
  ) {}

  async scanFromImage(
    userId: string,
    file: Express.Multer.File,
  ): Promise<MenuScanPreviewResponseDto> {
    const context = await this.requireAdmin(userId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Menu image is required.');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('File must be an image.');
    }

    const stations = await this.prisma.preparationStation.findMany({
      where: {
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        status: 'ACTIVE',
      },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, code: true },
    });

    const extracted = await this.extractWithOpenAI(file, stations);
    const data = extracted.map((item) => this.normalizeDraft(item, stations));

    return {
      data,
      itemCount: data.length,
      rawText: null,
    };
  }

  async importScanned(
    userId: string,
    dto: ImportScannedMenuDto,
  ): Promise<ImportScannedMenuResponseDto> {
    await this.requireAdmin(userId);
    const createdIds: string[] = [];
    const errors: string[] = [];

    for (const item of dto.items) {
      if (item.selected === false) continue;
      if (!item.preparationStationId) {
        errors.push(`${item.name}: missing station`);
        continue;
      }
      try {
        const created = await this.menu.create(userId, {
          name: item.name,
          description: item.description,
          price: item.price,
          categoryName: item.categoryName,
          preparationStationId: item.preparationStationId,
          expectedPrepMinutes: item.expectedPrepMinutes ?? 10,
          available: true,
        });
        createdIds.push(created.data.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Create failed';
        errors.push(`${item.name}: ${message}`);
      }
    }

    return {
      createdCount: createdIds.length,
      createdIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private async extractWithOpenAI(
    file: Express.Multer.File,
    stations: StationRow[],
  ): Promise<ScannedMenuItemDto[]> {
    const apiKey =
      this.config.get<string>('OPENAI_API_KEY') ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is not configured on the server.',
      );
    }

    const model =
      this.config.get<string>('OPENAI_MENU_MODEL') ??
      process.env.OPENAI_MENU_MODEL ??
      'gpt-4o-mini';

    const stationHint = stations
      .map((s) => `${s.name} (code=${s.code ?? 'n/a'}, id=${s.id})`)
      .join('; ');

    const client = new OpenAI({ apiKey });
    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64}`;

    const completion = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract restaurant menu items from photos. Return strict JSON only.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract every dish/drink from this menu image for an Ethiopian restaurant POS.
Available stations: ${stationHint || 'Kitchen, Barista, Cakes, Soft Drinks'}.

Return JSON:
{
  "items": [
    {
      "name": string,
      "description": string | null,
      "price": string number like "250.00",
      "categoryName": string,
      "suggestedStationName": one of the station names above,
      "expectedPrepMinutes": number
    }
  ]
}

Rules:
- price must be digits with optional decimals, no currency symbol
- if price missing, estimate a reasonable ETB price as a string
- map drinks/coffee to Barista, desserts/cakes to Cakes, soft drinks/juice to Soft Drinks, food to Kitchen
- skip headers, section titles, and phone numbers
- max 60 items`,
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new BadRequestException('OpenAI returned an empty menu scan.');
    }

    let parsed: { items?: unknown };
    try {
      parsed = JSON.parse(content) as { items?: unknown };
    } catch {
      throw new BadRequestException('Could not parse menu scan response.');
    }

    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      throw new BadRequestException('No menu items found in the image.');
    }

    return parsed.items
      .map((raw) => this.coerceRawItem(raw))
      .filter((item): item is ScannedMenuItemDto => Boolean(item));
  }

  private coerceRawItem(raw: unknown): ScannedMenuItemDto | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const name = String(row.name ?? '').trim();
    if (!name) return null;

    const priceRaw = String(row.price ?? '0')
      .replace(/[^\d.]/g, '')
      .trim();
    const priceNum = Number(priceRaw);
    const price = Number.isFinite(priceNum) ? priceNum.toFixed(2) : '0.00';

    const prep = Number(row.expectedPrepMinutes);
    return {
      name: name.slice(0, 180),
      description:
        typeof row.description === 'string'
          ? row.description.trim().slice(0, 2000)
          : undefined,
      price,
      categoryName:
        typeof row.categoryName === 'string'
          ? row.categoryName.trim().slice(0, 120)
          : undefined,
      suggestedStationName:
        typeof row.suggestedStationName === 'string'
          ? row.suggestedStationName.trim()
          : undefined,
      expectedPrepMinutes:
        Number.isFinite(prep) && prep > 0 ? Math.round(prep) : 10,
      selected: true,
    };
  }

  private normalizeDraft(
    item: ScannedMenuItemDto,
    stations: StationRow[],
  ): ScannedMenuItemDto {
    const station = this.matchStation(
      item.suggestedStationName ?? item.categoryName,
      stations,
    );
    return {
      ...item,
      preparationStationId: station?.id,
      suggestedStationName: station?.name ?? item.suggestedStationName,
      categoryName: item.categoryName || station?.name || 'General',
      selected: true,
    };
  }

  private matchStation(
    hint: string | undefined,
    stations: StationRow[],
  ): StationRow | null {
    if (stations.length === 0) return null;
    if (!hint) {
      return (
        stations.find((s) => /kitchen/i.test(s.name) || s.code === 'KITCHEN') ??
        stations[0]
      );
    }
    const h = hint.toLowerCase();
    const byName = stations.find(
      (s) =>
        s.name.toLowerCase() === h ||
        (s.code ?? '').toLowerCase() === h ||
        h.includes(s.name.toLowerCase()) ||
        s.name.toLowerCase().includes(h),
    );
    if (byName) return byName;

    if (/coffee|espresso|macchiato|latte|barista|tea/.test(h)) {
      return (
        stations.find((s) =>
          /barista|coffee/i.test(`${s.name}${s.code ?? ''}`),
        ) ?? stations[0]
      );
    }
    if (/cake|dessert|pastry|sweet/.test(h)) {
      return (
        stations.find((s) =>
          /cake|dessert/i.test(`${s.name}${s.code ?? ''}`),
        ) ?? stations[0]
      );
    }
    if (/juice|soda|soft|drink|water|sprite|cola/.test(h)) {
      return (
        stations.find((s) =>
          /soft|drink|beverage/i.test(`${s.name}${s.code ?? ''}`),
        ) ?? stations[0]
      );
    }
    return (
      stations.find((s) => /kitchen/i.test(`${s.name}${s.code ?? ''}`)) ??
      stations[0]
    );
  }

  private async requireAdmin(userId: string) {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId) {
      throw new BadRequestException('No restaurant branch on this account.');
    }
    if (context.roleCode !== 'MANAGER' && context.roleCode !== 'OWNER_ADMIN') {
      throw new BadRequestException('Only managers can scan menus.');
    }
    return context;
  }
}
