import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import OpenAI from 'openai';
import { IdentityContextService } from '../identity/identity-context.service';
import { VerifyEtBank } from '../verify-et/verify-et.types';

const COLLECT_ROLES = [
  'WAITER',
  'DISPATCHER',
  'MANAGER',
  'OWNER_ADMIN',
  'CASHIER',
];

export class ReceiptExtractResponseDto {
  @ApiProperty({ example: 'DJ58FLU9JE' })
  @Expose()
  reference: string | null;

  @ApiPropertyOptional({ example: 'telebirr' })
  @Expose()
  bankProvider: VerifyEtBank | null;

  @ApiPropertyOptional({ example: '30.00' })
  @Expose()
  amount: string | null;

  @ApiProperty({ example: 0.86 })
  @Expose()
  confidence: number;

  @ApiProperty({ example: 'openai' })
  @Expose()
  source: 'openai' | 'heuristic';

  @ApiPropertyOptional()
  @Expose()
  rawHint?: string | null;
}

type ExtractedJson = {
  reference?: string | null;
  bankProvider?: string | null;
  amount?: string | number | null;
  confidence?: number | null;
};

@Injectable()
export class ReceiptExtractService {
  private readonly logger = new Logger(ReceiptExtractService.name);

  constructor(
    private readonly identity: IdentityContextService,
    private readonly config: ConfigService,
  ) {}

  async extractFromImage(
    userId: string,
    file: Express.Multer.File,
    hintChannel?: 'TELEBIRR' | 'BANK',
  ): Promise<ReceiptExtractResponseDto> {
    const context = await this.identity.getByUserId(userId);
    if (!COLLECT_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Only collectors can scan receipts.');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('Receipt image is required.');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('File must be an image.');
    }

    try {
      const fromAi = await this.extractWithOpenAI(file, hintChannel);
      if (fromAi.reference) {
        return fromAi;
      }
    } catch (error) {
      this.logger.warn(
        `OpenAI receipt extract failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const fromText = this.extractWithHeuristics(
      extractPrintableChunks(file.buffer),
      hintChannel,
    );
    if (fromText.reference) {
      return fromText;
    }

    return {
      reference: null,
      bankProvider: hintChannel === 'TELEBIRR' ? 'telebirr' : 'cbe',
      amount: null,
      confidence: 0,
      source: 'heuristic',
      rawHint: 'Could not read a transaction number. Type it manually.',
    };
  }

  private async extractWithOpenAI(
    file: Express.Multer.File,
    hintChannel?: 'TELEBIRR' | 'BANK',
  ): Promise<ReceiptExtractResponseDto> {
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

    const client = new OpenAI({ apiKey });
    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const channelHint =
      hintChannel === 'TELEBIRR'
        ? 'Likely Telebirr / wallet transfer.'
        : hintChannel === 'BANK'
          ? 'Likely Ethiopian bank transfer (CBE, Dashen, Awash, BoA, etc.).'
          : 'Could be Telebirr or Ethiopian bank.';

    const completion = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract payment reference numbers from Ethiopian bank and Telebirr receipt photos. Return strict JSON only.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${channelHint}

Extract the fields used to verify the payment with a bank API.

Return JSON:
{
  "reference": string | null,
  "bankProvider": "telebirr" | "cbe" | "boa" | "dashen" | "awash" | "cbebirr" | "mpesa" | "siinqee" | "kaafiebirr" | null,
  "amount": string like "30.00" (transfer amount only, ignore service charge) | null,
  "confidence": number 0 to 1
}

Rules for reference (most important):
- Telebirr: use Transaction No. (e.g. DJ58FLU9JE)
- CBE: prefer Receipt ID from QR/link if visible; else Reference No / FT… (e.g. FT26276WZM38)
- Other banks: the main transaction / reference / receipt number on the slip
- Never return the whole SMS or address block
- amount = transferred amount in ETB, not total debited with fees when both are shown
- If unreadable, return reference null`,
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
      throw new BadRequestException('OpenAI returned an empty receipt scan.');
    }

    let parsed: ExtractedJson;
    try {
      parsed = JSON.parse(content) as ExtractedJson;
    } catch {
      throw new BadRequestException('OpenAI returned invalid JSON.');
    }

    const reference = normalizeReference(parsed.reference);
    const bankProvider = normalizeBank(
      parsed.bankProvider,
      hintChannel,
      reference,
    );
    const amount = normalizeAmount(parsed.amount);
    const confidence =
      typeof parsed.confidence === 'number'
        ? Math.min(1, Math.max(0, parsed.confidence))
        : reference
          ? 0.75
          : 0;

    return {
      reference,
      bankProvider,
      amount,
      confidence,
      source: 'openai',
      rawHint: null,
    };
  }

  private extractWithHeuristics(
    text: string,
    hintChannel?: 'TELEBIRR' | 'BANK',
  ): ReceiptExtractResponseDto {
    const telebirr =
      text.match(/\b([A-Z0-9]{10})\b/) ||
      text.match(/Transaction\s*No\.?\s*[:#]?\s*([A-Z0-9]{8,14})/i);
    const cbeFt = text.match(/\b(FT[A-Z0-9]{8,20})\b/i);
    const cbeReceipt = text.match(/\b([a-zA-Z0-9]{16,28})\b/);

    let reference: string | null = null;
    let bank: VerifyEtBank | null =
      hintChannel === 'TELEBIRR' ? 'telebirr' : null;

    if (hintChannel === 'TELEBIRR' && telebirr?.[1]) {
      reference = telebirr[1].toUpperCase();
      bank = 'telebirr';
    } else if (cbeFt?.[1]) {
      reference = cbeFt[1].toUpperCase();
      bank = 'cbe';
    } else if (telebirr?.[1] && hintChannel !== 'BANK') {
      reference = telebirr[1].toUpperCase();
      bank = 'telebirr';
    } else if (cbeReceipt?.[1] && hintChannel === 'BANK') {
      reference = cbeReceipt[1];
      bank = 'cbe';
    }

    return {
      reference: normalizeReference(reference),
      bankProvider: bank,
      amount: null,
      confidence: reference ? 0.35 : 0,
      source: 'heuristic',
      rawHint: reference
        ? 'Read with local pattern match — confirm before paying.'
        : null,
    };
  }
}

function normalizeReference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/\s+/g, '');
  if (cleaned.length < 4 || cleaned.length > 128) return null;
  return cleaned;
}

function normalizeBank(
  value: unknown,
  hintChannel?: 'TELEBIRR' | 'BANK',
  reference?: string | null,
): VerifyEtBank | null {
  const allowed: VerifyEtBank[] = [
    'cbe',
    'boa',
    'telebirr',
    'mpesa',
    'cbebirr',
    'dashen',
    'awash',
    'siinqee',
    'kaafiebirr',
  ];
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase() as VerifyEtBank;
    if (allowed.includes(key)) return key;
  }
  if (hintChannel === 'TELEBIRR') return 'telebirr';
  if (reference?.toUpperCase().startsWith('FT')) return 'cbe';
  if (hintChannel === 'BANK') return 'cbe';
  return null;
}

function normalizeAmount(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/(\d+(\.\d{1,2})?)/);
  if (!match) return null;
  return Number(match[1]).toFixed(2);
}

function extractPrintableChunks(buffer: Buffer): string {
  const chars: string[] = [];
  for (const byte of buffer) {
    if (
      (byte >= 0x20 && byte <= 0x7e) ||
      byte === 0x0a ||
      byte === 0x0d ||
      byte === 0x09
    ) {
      chars.push(String.fromCharCode(byte));
    } else {
      chars.push(' ');
    }
  }
  return chars.join('').replace(/\s+/g, ' ');
}
