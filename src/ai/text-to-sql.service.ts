import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { SqlValidatorService } from './sql-validator.service';
import { ChatRequestDto, ChatResponseDto } from './dto/chat-request.dto';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

function safeJsonStringify(data: any, space = 2): string {
  return JSON.stringify(
    data,
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    space,
  );
}

@Injectable()
export class TextToSqlService {
  private readonly logger = new Logger(TextToSqlService.name);
  private openai: OpenAI | null = null;
  private readonly modelName: string;
  private readonly ddlSchema: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly sqlValidator: SqlValidatorService,
  ) {
    const apiKey =
      this.configService.get<string>('OPENAI_API_KEY', { infer: true }) ||
      process.env.OPENAI_API_KEY;

    if (apiKey && apiKey.trim() !== '') {
      this.openai = new OpenAI({ apiKey: apiKey.trim() });
    } else {
      this.logger.warn('OPENAI_API_KEY is not configured for TextToSqlService.');
    }

    this.modelName =
      this.configService.get<string>('OPENAI_MODEL', { infer: true }) ||
      process.env.OPENAI_MODEL ||
      'gpt-4o-mini';

    // Load extracted DDL from the database dump
    try {
      const schemaPath = path.join(__dirname, 'extracted_schema.sql');
      if (fs.existsSync(schemaPath)) {
        this.ddlSchema = fs.readFileSync(schemaPath, 'utf8');
      } else {
        // Fallback relative to project root
        const fallbackPath = path.join(
          process.cwd(),
          'src',
          'ai',
          'extracted_schema.sql',
        );
        this.ddlSchema = fs.existsSync(fallbackPath)
          ? fs.readFileSync(fallbackPath, 'utf8')
          : '';
      }
    } catch {
      this.ddlSchema = '';
    }
  }

  async processChat(
    tenantId: string,
    dto: ChatRequestDto,
  ): Promise<ChatResponseDto> {
    if (!this.openai) {
      return {
        reply:
          'OpenAI API Key is not configured on this server. Please add your OPENAI_API_KEY to the backend .env configuration.',
      };
    }

    const branchFilter = dto.branchId ? ` AND branch_id = '${dto.branchId}'` : '';

    const sqlSystemPrompt = `
You are a senior PostgreSQL data analytics engineer writing queries for a multi-tenant restaurant SaaS owner.
Database Engine: PostgreSQL 18.
The user's TENANT_ID is '${tenantId}'.

EXACT LIVE POSTGRESQL SCHEMA (from database dump):
${this.ddlSchema}

CRITICAL RULES:
1. Output ONLY the raw SQL query. Never wrap in markdown fences (\`\`\`) and never add explanations.
2. Strictly generate read-only SELECT or WITH ... SELECT queries. NEVER output INSERT, UPDATE, DELETE, or DROP.
3. EVERY table with a tenant_id column MUST include tenant_id = '${tenantId}'${branchFilter}.
4. Real table columns to remember:
   - For in-store stock: JOIN inventory_stock_balances isb ON isb.ingredient_id = ii.id AND isb.tenant_id = '${tenantId}'. Use isb.on_hand_qty for current stock!
   - For branches: Always start FROM branches br and LEFT JOIN bills or tables so branches with zero sales still show up with ETB 0.00.
   - For revenue: Include both paid revenue (status IN ('PAID', 'CLOSED')) and pending revenue (status IN ('GENERATED', 'PAYMENT_PENDING')).
   - For items: Use bill_lines.item_name_snapshot or order_items.item_name_snapshot.
5. Conversational vs Database Query:
   - ONLY output "CONVERSATIONAL" if the user's message is EXCLUSIVELY a greeting, farewell, or polite remark with NO question about restaurant operations (e.g., strictly "hi", "hello", "good morning", "who are you?", "what can you do?").
   - If the user asks ANY question about business data (such as sales, bottles, drinks, revenue, orders, inventory, dishes, staff, tables, expenses, etc.), EVEN IF the message begins with "hi", "hello", or "good morning", you MUST IGNORE the greeting and GENERATE the SQL query!
6. Common queries & intelligent item matching:
   - When asked about items, beverages, drinks, bottles, or food sold (e.g. "how many bottles sold", "top dishes", "what drinks were sold"):
     NEVER use narrow string filters like LIKE '%bottle%' or LIKE '%drink%'. Menu items in the database are named specifically (e.g. 'coka cola', 'sprite', 'water 0.5L', 'tibs').
     Always group by item_name_snapshot:
     SELECT bl.item_name_snapshot, SUM(bl.quantity) AS total_sold, SUM(bl.line_total) AS total_revenue, b.status
     FROM bill_lines bl JOIN bills b ON b.id = bl.bill_id
     WHERE b.tenant_id = '${tenantId}' AND b.status IN ('PAID', 'CLOSED', 'GENERATED', 'PAYMENT_PENDING')
     GROUP BY bl.item_name_snapshot, b.status
     ORDER BY total_sold DESC
     LIMIT 20;
     (The summary step will automatically identify which items match the user's inquiry, e.g. identifying 'coka cola' as a bottled beverage).
   - Date range: For last N days, check b.created_at >= CURRENT_DATE - INTERVAL '7 days' OR b.business_date >= CURRENT_DATE - INTERVAL '7 days'.
`;

    const chatHistoryMessages: OpenAI.ChatCompletionMessageParam[] = (
      dto.history || []
    ).map((h) => ({
      role: h.role,
      content: h.content,
    }));

    // Step 1: Generate SQL from OpenAI
    let rawSql = '';
    try {
      const sqlCompletion = await this.openai.chat.completions.create({
        model: this.modelName,
        temperature: 0.1,
        messages: [
          { role: 'system', content: sqlSystemPrompt },
          ...chatHistoryMessages,
          { role: 'user', content: dto.message },
        ],
      });

      rawSql = sqlCompletion.choices[0]?.message?.content?.trim() || '';
    } catch (err: any) {
      throw new InternalServerErrorException(
        `OpenAI request failed: ${err.message}`,
      );
    }

    // Handle conversational greetings vs operational data queries
    let cleanRawUpper = rawSql
      .replace(/^```(sql)?/i, '')
      .replace(/```$/, '')
      .trim()
      .toUpperCase();

    // Check if the user's prompt contains analytical/business keywords
    const lowerMsg = (dto.message || '').toLowerCase();
    const hasDataKeywords =
      /(sold|sale|sales|bottle|bottles|revenue|income|profit|loss|margin|drink|drinks|food|dish|dishes|order|orders|bill|bills|stock|inventory|ingredient|waiter|staff|cash|payment|branch|table|customer|feedback|rating|cancel|void|waste|expense|how many|how much|top|peak|average)/i.test(
        lowerMsg,
      );

    if (
      (rawSql.includes('CONVERSATIONAL') ||
        rawSql.includes('UNSUPPORTED_QUESTION') ||
        (!cleanRawUpper.startsWith('SELECT') &&
          !cleanRawUpper.startsWith('WITH'))) &&
      hasDataKeywords
    ) {
      // Force OpenAI to generate SQL instead of falling back to conversational
      try {
        const forcedSqlCompletion = await this.openai.chat.completions.create({
          model: this.modelName,
          temperature: 0.1,
          messages: [
            { role: 'system', content: sqlSystemPrompt },
            ...chatHistoryMessages,
            {
              role: 'user',
              content: `IMPORTANT: This is a direct database query inquiry: "${dto.message}". DO NOT answer with CONVERSATIONAL. Output ONLY the raw PostgreSQL SELECT query.`,
            },
          ],
        });

        const retrySql =
          forcedSqlCompletion.choices[0]?.message?.content?.trim() || '';
        const retryUpper = retrySql
          .replace(/^```(sql)?/i, '')
          .replace(/```$/, '')
          .trim()
          .toUpperCase();

        if (retryUpper.startsWith('SELECT') || retryUpper.startsWith('WITH')) {
          rawSql = retrySql;
          cleanRawUpper = retryUpper;
        }
      } catch {
        // continue
      }
    }

    if (
      rawSql.includes('CONVERSATIONAL') ||
      rawSql.includes('UNSUPPORTED_QUESTION') ||
      (!cleanRawUpper.startsWith('SELECT') && !cleanRawUpper.startsWith('WITH'))
    ) {
      const convCompletion = await this.openai.chat.completions.create({
        model: this.modelName,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'You are a direct and concise AI assistant for restaurant owners. ' +
              'Speak only in English. Keep answers brief (1-2 sentences). ' +
              'Never write formal letters, "Dear Owner", "Best regards", or email sign-offs. ' +
              'Directly answer the greeting and briefly mention what restaurant data you can answer (sales, dishes, stock, revenue, shifts, payments).',
          },
          ...chatHistoryMessages,
          { role: 'user', content: dto.message },
        ],
      });

      return {
        reply:
          convCompletion.choices[0]?.message?.content?.trim() ||
          'Hello! I am your AI Business Advisor. How can I assist you with your restaurant analytics today?',
      };
    }

    // Step 2 & 3: Validate and Execute with Auto-Healing Retry Loop (Up to 2 Retries)
    let safeSql = '';
    let queryResults: any[] = [];
    let attempts = 0;
    const maxAttempts = 2;
    let currentSqlToTry = rawSql;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        // Validate against security rules
        safeSql = this.sqlValidator.validateAndSanitize(currentSqlToTry, tenantId);

        // Execute inside read-only transaction with statement timeout
        queryResults = await this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY;');
            await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '3000ms';");
            return await tx.$queryRawUnsafe(safeSql);
          },
          { timeout: 5000 },
        );

        // If query succeeded, break the retry loop!
        break;
      } catch (err: any) {
        this.logger.warn(
          `SQL attempt #${attempts} failed: ${err.message}. SQL was: ${currentSqlToTry}`,
        );

        if (attempts >= maxAttempts) {
          return {
            reply: `I could not complete this database query: ${err.message}`,
            sqlQuery: safeSql || currentSqlToTry,
          };
        }

        // Auto-Healing: Ask OpenAI to fix the query based on the exact error message
        try {
          const fixCompletion = await this.openai.chat.completions.create({
            model: this.modelName,
            temperature: 0.1,
            messages: [
              { role: 'system', content: sqlSystemPrompt },
              { role: 'user', content: dto.message },
              {
                role: 'assistant',
                content: currentSqlToTry,
              },
              {
                role: 'user',
                content: `PostgreSQL execution returned this error: "${err.message}". Please inspect the exact schema DDL, correct the SQL query to resolve this error, and output ONLY the corrected SQL query.`,
              },
            ],
          });

          currentSqlToTry =
            fixCompletion.choices[0]?.message?.content?.trim() || '';
        } catch {
          break;
        }
      }
    }

    // Step 4: Ask OpenAI to formulate a concise, direct answer
    let contextNote = '';
    if (queryResults.length === 0) {
      try {
        const pendingBills = await this.prisma.bill.findMany({
          where: { tenantId, status: { in: ['GENERATED', 'PAYMENT_PENDING'] } },
          select: { billNumber: true, totalAmount: true, status: true },
          take: 5,
        });

        if (pendingBills.length > 0) {
          contextNote = `\n(Note: There are ${pendingBills.length} pending uncollected bills in the system, e.g. Bill ${pendingBills[0].billNumber} for ETB ${pendingBills[0].totalAmount}).`;
        }
      } catch {
        // ignore
      }
    }

    const summaryPrompt = `
User Question: "${dto.message}"
Retrieved Database Records: ${safeJsonStringify(queryResults, 2)}${contextNote}

STRICT INSTRUCTIONS:
1. Answer ONLY what the user asked directly. Keep the response concise, punchy, and to the point (1 to 3 short sentences or a clean bullet list).
2. NO FORMAL LETTER FORMAT: NEVER say "Dear Restaurant Owner", "Thank you for reaching out", "Best regards", "[Your Name]", or any sign-offs.
3. NO UNSOLICITED ADVICE: Do NOT lecture the user, and do NOT make up speculative theories (like "low foot traffic" or "marketing strategies") unless explicitly requested.
4. Always format money in ETB (e.g. ETB 180.00).
5. If completed sales are 0 but active/pending bills or orders exist with items, state how many were ordered and that they are awaiting cashier collection.
6. If the result is truly 0, say directly: "No records found for [item/query] in the last [timeframe]."
`;

    let finalReply = '';
    try {
      const summaryCompletion = await this.openai.chat.completions.create({
        model: this.modelName,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are a direct, concise data assistant for a restaurant owner. Answer only what is asked without greetings, sign-offs, letters, or unsolicited advice.',
          },
          { role: 'user', content: summaryPrompt },
        ],
      });

      finalReply =
        summaryCompletion.choices[0]?.message?.content?.trim() ||
        'No matching records found.';
    } catch {
      finalReply = `${safeJsonStringify(queryResults, 0)}`;
    }

    return {
      reply: finalReply,
      sqlQuery: safeSql,
      rowCount: queryResults.length,
    };
  }
}

