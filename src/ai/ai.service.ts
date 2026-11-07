import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { ChatRequestDto, ChatResponseDto } from './dto/chat-request.dto';
import OpenAI from 'openai';

function safeJsonStringify(data: any, space = 2): string {
  return JSON.stringify(
    data,
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    space,
  );
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI | null = null;
  private readonly modelName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey =
      this.configService.get<string>('OPENAI_API_KEY', { infer: true }) ||
      process.env.OPENAI_API_KEY;

    if (apiKey && apiKey.trim() !== '') {
      this.openai = new OpenAI({ apiKey: apiKey.trim() });
    } else {
      this.logger.warn(
        'OPENAI_API_KEY is not configured. AI advisor will reply with configuration guidance.',
      );
    }

    this.modelName =
      this.configService.get<string>('OPENAI_MODEL', { infer: true }) ||
      process.env.OPENAI_MODEL ||
      'gpt-4o-mini';
  }

  // Definition of tools available to OpenAI
  private readonly OWNER_TOOLS: OpenAI.ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'get_sales_and_revenue',
        description:
          'Get restaurant sales, completed revenue, pending/active bills awaiting payment, and bill counts broken down by branch.',
        parameters: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: ['today', 'yesterday', 'this_week', 'this_month', 'all_time'],
              description: 'Time period for the sales report. Defaults to all_time if unspecified.',
            },
            branchId: {
              type: 'string',
              description: 'Optional branch ID to filter by a specific branch.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_inventory_stock',
        description:
          'Get in-store inventory stock levels, on-hand quantities, units, and par levels for ingredients.',
        parameters: {
          type: 'object',
          properties: {
            branchId: {
              type: 'string',
              description: 'Optional branch ID filter.',
            },
            lowStockOnly: {
              type: 'boolean',
              description: 'When true, only returns items that are low or below par level.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_top_dishes',
        description:
          'Get top-selling menu items, food and drinks sold, quantities, and revenue.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of top items to return (default 5, max 20).',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_payment_mix',
        description:
          'Get collections breakdown by payment method (Cash vs Digital Transfer) and channels (Telebirr, CBE, etc.).',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_expenses_and_payouts',
        description:
          'Get manual finance entries, petty cash outflows, and operational expenses.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_customer_feedback',
        description:
          'Get recent guest reviews, ratings (1 to 5 stars), and customer comments.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Max feedback entries to return (default 5).',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_dining_tables_status',
        description:
          'Get dining room tables status: count of available, occupied, and total tables per branch.',
        parameters: {
          type: 'object',
          properties: {
            branchId: {
              type: 'string',
              description: 'Optional branch ID filter.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_profitability_and_net_income',
        description:
          'Complex financial analysis: calculates Net Operating Profit, Gross Sales vs Outflow Expenses, cancellations loss, and Net Profit Margin %.',
        parameters: {
          type: 'object',
          properties: {
            branchId: {
              type: 'string',
              description: 'Optional branch ID filter.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_staff_performance_analytics',
        description:
          'Staff performance analysis: orders created, bills generated, sales volume per staff member, and server rankings.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_waste_and_cancellations_audit',
        description:
          'Waste & cancellations loss audit: list of cancelled dishes, reasons for cancellation, and total revenue lost.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Max cancellation records to inspect (default 20).',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_peak_hours_and_order_trends',
        description:
          'Operational traffic analysis: breakdown of order volume by hour of day (0 to 23) and peak rush hours (lunch vs dinner).',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_cash_reconciliation_audit',
        description:
          'Cashier drawer reconciliation audit: expected vs counted cash, variances (shortages or overages), and cashier notes.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
  ];

  // ==========================================
  // TYPE-CHECKED TOOL EXECUTORS (PRISMA)
  // ==========================================

  private async executeSalesTool(tenantId: string, args: any) {
    const branches = await this.prisma.branch.findMany({
      where: {
        tenantId,
        ...(args?.branchId ? { id: args.branchId } : {}),
      },
      include: {
        bills: {
          where: { tenantId },
          select: {
            id: true,
            status: true,
            totalAmount: true,
            billNumber: true,
          },
        },
      },
    });

    return branches.map((br) => {
      let paidRevenue = 0;
      let paidCount = 0;
      let pendingRevenue = 0;
      let pendingCount = 0;
      const activeBillNumbers: string[] = [];

      for (const bill of br.bills) {
        const amt = Number(bill.totalAmount || 0);
        if (bill.status === 'PAID' || bill.status === 'CLOSED') {
          paidRevenue += amt;
          paidCount++;
        } else if (
          bill.status === 'GENERATED' ||
          bill.status === 'PAYMENT_PENDING'
        ) {
          pendingRevenue += amt;
          pendingCount++;
          activeBillNumbers.push(bill.billNumber);
        }
      }

      return {
        branchName: br.name,
        displayCode: br.displayCode || 'MAIN',
        paidRevenue: Number(paidRevenue.toFixed(2)),
        paidBillsCount: paidCount,
        pendingRevenue: Number(pendingRevenue.toFixed(2)),
        pendingBillsCount: pendingCount,
        activeAwaitingBillNumbers: activeBillNumbers,
        currency: 'ETB',
      };
    });
  }

  private async executeInventoryTool(tenantId: string, args: any) {
    const ingredients = await this.prisma.inventoryIngredient.findMany({
      where: {
        tenantId,
        ...(args?.branchId ? { branchId: args.branchId } : {}),
      },
      select: {
        id: true,
        name: true,
        unit: true,
        parLevel: true,
        unitCost: true,
        branch: { select: { name: true } },
        balances: {
          select: { onHandQty: true },
        },
      },
      take: 50,
    });

    const items = ingredients.map((item) => {
      const totalOnHand = item.balances.reduce(
        (sum, b) => sum + Number(b.onHandQty || 0),
        0,
      );
      const par = Number(item.parLevel || 0);
      const isLowStock = par > 0 && totalOnHand <= par;

      return {
        ingredientName: item.name,
        branchName: item.branch?.name || 'Main',
        onHandStock: totalOnHand,
        unit: item.unit,
        unitCostETB: Number(item.unitCost || 0),
        parLevel: par,
        isLowStock,
      };
    });

    if (args?.lowStockOnly) {
      return items.filter((i) => i.isLowStock);
    }

    return items;
  }

  private async executeTopDishesTool(tenantId: string, args: any) {
    const limit = Math.min(Number(args?.limit) || 5, 20);

    const lines = await this.prisma.billLine.groupBy({
      by: ['itemNameSnapshot'],
      where: {
        tenantId,
        chargeStatus: { not: 'VOIDED' },
      },
      _sum: {
        quantity: true,
        lineTotal: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: limit,
    });

    return lines.map((line) => ({
      dishName: line.itemNameSnapshot,
      quantitySold: line._sum.quantity || 0,
      revenueETB: Number(Number(line._sum.lineTotal || 0).toFixed(2)),
    }));
  }

  private async executePaymentMixTool(tenantId: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        status: 'COMPLETED',
      },
      select: {
        method: true,
        transferChannel: true,
        amount: true,
      },
    });

    let totalCollected = 0;
    const mix: Record<string, number> = {};

    for (const p of payments) {
      const amt = Number(p.amount || 0);
      totalCollected += amt;
      const key = p.transferChannel ? `${p.method} (${p.transferChannel})` : p.method;
      mix[key] = (mix[key] || 0) + amt;
    }

    return {
      totalCollectedETB: Number(totalCollected.toFixed(2)),
      breakdown: Object.entries(mix).map(([channel, amount]) => ({
        channel,
        amountETB: Number(amount.toFixed(2)),
        percentage:
          totalCollected > 0
            ? Number(((amount / totalCollected) * 100).toFixed(1))
            : 0,
      })),
    };
  }

  private async executeExpensesTool(tenantId: string) {
    const entries = await this.prisma.manualFinanceEntry.findMany({
      where: {
        tenantId,
        direction: 'OUTFLOW',
        status: { not: 'VOIDED' },
      },
      select: {
        label: true,
        amount: true,
        counterparty: true,
        createdAt: true,
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const totalExpense = entries.reduce((s, e) => s + Number(e.amount || 0), 0);

    return {
      totalOutflowETB: Number(totalExpense.toFixed(2)),
      recentExpenses: entries.map((e) => ({
        label: e.label,
        category: e.category?.name || 'General',
        amountETB: Number(e.amount || 0),
        paidTo: e.counterparty || 'N/A',
        date: e.createdAt.toISOString().slice(0, 10),
      })),
    };
  }

  private async executeFeedbackTool(tenantId: string, args: any) {
    const limit = Math.min(Number(args?.limit) || 5, 20);

    const feedbackList = await this.prisma.customerFeedback.findMany({
      where: { tenantId },
      select: {
        rating: true,
        comment: true,
        customerName: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const avgRating =
      feedbackList.length > 0
        ? Number(
            (
              feedbackList.reduce((acc, f) => acc + (f.rating || 0), 0) /
              feedbackList.length
            ).toFixed(1),
          )
        : null;

    return {
      averageRating: avgRating,
      totalFeedbackCount: feedbackList.length,
      recentReviews: feedbackList.map((f) => ({
        stars: f.rating,
        comment: f.comment || '(No comment)',
        guest: f.customerName || 'Anonymous Guest',
        source: f.source,
      })),
    };
  }

  private async executeDiningTablesTool(tenantId: string, args: any) {
    const tables = await this.prisma.diningTable.findMany({
      where: {
        tenantId,
        ...(args?.branchId ? { branchId: args.branchId } : {}),
      },
      select: {
        displayName: true,
        status: true,
        branch: { select: { name: true } },
      },
    });

    const byBranch: Record<string, { total: number; occupied: number; available: number }> = {};
    for (const t of tables) {
      const bName = t.branch?.name || 'Main Branch';
      if (!byBranch[bName]) {
        byBranch[bName] = { total: 0, occupied: 0, available: 0 };
      }
      byBranch[bName].total++;
      if (t.status === 'OCCUPIED') byBranch[bName].occupied++;
      else byBranch[bName].available++;
    }

    return Object.entries(byBranch).map(([branchName, stats]) => ({
      branchName,
      ...stats,
    }));
  }

  private async executeProfitabilityTool(tenantId: string, args: any) {
    const branchFilter = args?.branchId ? { branchId: args.branchId } : {};

    // 1. Total paid revenue
    const paidBills = await this.prisma.bill.findMany({
      where: {
        tenantId,
        status: { in: ['PAID', 'CLOSED'] },
        ...branchFilter,
      },
      select: { totalAmount: true },
    });
    const grossSales = paidBills.reduce((s, b) => s + Number(b.totalAmount || 0), 0);

    // 2. Total manual expenses
    const expenses = await this.prisma.manualFinanceEntry.findMany({
      where: {
        tenantId,
        direction: 'OUTFLOW',
        status: { not: 'VOIDED' },
        ...branchFilter,
      },
      select: { amount: true, label: true, category: { select: { name: true } } },
    });
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

    // 3. Voided cancellations loss
    const voidedLines = await this.prisma.billLine.findMany({
      where: {
        tenantId,
        chargeStatus: 'VOIDED',
      },
      select: { lineTotal: true },
    });
    const voidedLoss = voidedLines.reduce((s, l) => s + Number(l.lineTotal || 0), 0);

    const netOperatingProfit = grossSales - totalExpenses;
    const profitMarginPercent =
      grossSales > 0 ? Number(((netOperatingProfit / grossSales) * 100).toFixed(1)) : 0;

    return {
      grossSalesETB: Number(grossSales.toFixed(2)),
      totalOperatingExpensesETB: Number(totalExpenses.toFixed(2)),
      voidedLossETB: Number(voidedLoss.toFixed(2)),
      netOperatingProfitETB: Number(netOperatingProfit.toFixed(2)),
      profitMarginPercent: `${profitMarginPercent}%`,
      currency: 'ETB',
    };
  }

  private async executeStaffPerformanceTool(tenantId: string) {
    const staffMembers = await this.prisma.tenantStaffMembership.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: {
        id: true,
        employeeDisplayName: true,
        createdOrders: {
          select: { id: true },
        },
        generatedBills: {
          where: { status: { in: ['PAID', 'CLOSED'] } },
          select: { totalAmount: true },
        },
        roleAssignments: {
          select: { role: { select: { code: true } } },
        },
      },
    });

    return staffMembers.map((sm) => {
      const ordersCount = sm.createdOrders.length;
      const totalGeneratedSales = sm.generatedBills.reduce(
        (sum, b) => sum + Number(b.totalAmount || 0),
        0,
      );
      const roles = sm.roleAssignments.map((r) => r.role.code).join(', ') || 'STAFF';

      return {
        staffName: sm.employeeDisplayName,
        role: roles,
        totalOrdersCreated: ordersCount,
        completedSalesGeneratedETB: Number(totalGeneratedSales.toFixed(2)),
      };
    }).sort((a, b) => b.completedSalesGeneratedETB - a.completedSalesGeneratedETB);
  }

  private async executeWasteCancellationsTool(tenantId: string, args: any) {
    const limit = Math.min(Number(args?.limit) || 20, 50);

    const cancellations = await this.prisma.cancellationRequest.findMany({
      where: { tenantId },
      select: {
        reason: true,
        status: true,
        requestedAt: true,
        decisionReason: true,
        orderItem: {
          select: {
            itemNameSnapshot: true,
            unitPriceSnapshot: true,
            quantity: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
      take: limit,
    });

    let totalEstimatedLoss = 0;
    const reasonsMap: Record<string, number> = {};

    const items = cancellations.map((c) => {
      const item = c.orderItem;
      const itemCost = Number(item?.unitPriceSnapshot || 0) * (item?.quantity || 1);
      if (c.status === 'APPROVED') {
        totalEstimatedLoss += itemCost;
      }
      reasonsMap[c.reason] = (reasonsMap[c.reason] || 0) + 1;

      return {
        dishName: item?.itemNameSnapshot || 'Unknown Item',
        quantity: item?.quantity || 1,
        lossETB: Number(itemCost.toFixed(2)),
        reason: c.reason,
        status: c.status,
        date: c.requestedAt.toISOString().slice(0, 10),
      };
    });

    return {
      totalLostRevenueETB: Number(totalEstimatedLoss.toFixed(2)),
      totalCancellationsCount: cancellations.length,
      topCancellationReasons: Object.entries(reasonsMap)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      recentCancellations: items.slice(0, 10),
    };
  }

  private async executePeakHoursTool(tenantId: string) {
    const orders = await this.prisma.order.findMany({
      where: { tenantId },
      select: { createdAt: true },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    const hourlyCounts: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourlyCounts[h] = 0;

    for (const order of orders) {
      const hour = new Date(order.createdAt).getHours();
      hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
    }

    const peakHours = Object.entries(hourlyCounts)
      .map(([hour, count]) => ({
        timeRange: `${String(hour).padStart(2, '0')}:00 - ${String(hour).padStart(2, '0')}:59`,
        ordersCount: count,
      }))
      .filter((h) => h.ordersCount > 0)
      .sort((a, b) => b.ordersCount - a.ordersCount);

    return {
      totalOrdersAnalyzed: orders.length,
      busiestHours: peakHours.slice(0, 5),
    };
  }

  private async executeCashReconciliationTool(tenantId: string) {
    const reconciliations = await this.prisma.cashierReconciliation.findMany({
      where: { tenantId },
      select: {
        businessDate: true,
        expectedCashAmount: true,
        countedCashAmount: true,
        varianceAmount: true,
        cashierComment: true,
        status: true,
        branch: { select: { name: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 10,
    });

    return reconciliations.map((r) => ({
      branchName: r.branch?.name || 'Main',
      businessDate: r.businessDate.toISOString().slice(0, 10),
      expectedCashETB: Number(r.expectedCashAmount || 0),
      countedCashETB: Number(r.countedCashAmount || 0),
      varianceETB: Number(r.varianceAmount || 0),
      discrepancyType:
        Number(r.varianceAmount || 0) < 0
          ? 'SHORTAGE'
          : Number(r.varianceAmount || 0) > 0
            ? 'OVERAGE'
            : 'BALANCED',
      comment: r.cashierComment || 'None',
      status: r.status,
    }));
  }

  // ==========================================
  // MAIN ORCHESTRATION PIPELINE
  // ==========================================

  async processOwnerChat(
    tenantId: string,
    dto: ChatRequestDto,
  ): Promise<ChatResponseDto> {
    if (!this.openai) {
      return {
        reply:
          'OpenAI API Key is not configured on this server. Please add your OPENAI_API_KEY to the backend .env configuration.',
      };
    }

    const systemPrompt = `
You are the Executive AI Business Advisor for a multi-tenant restaurant SaaS owner.
Communicate exclusively in clear, professional English.

You have access to live database tools to inspect:
- Sales, revenue, paid bills, and pending/active bills per branch (get_sales_and_revenue)
- In-store inventory stock levels, on-hand counts, and low-stock alerts (get_inventory_stock)
- Top-selling food and drink items (get_top_dishes)
- Payment channel mix: Cash vs Telebirr vs CBE (get_payment_mix)
- Manual expenses and petty cash payouts (get_expenses_and_payouts)
- Customer ratings and feedback reviews (get_customer_feedback)
- Dining room table occupancy status (get_dining_tables_status)
- Profitability, gross revenue vs operating expenses, and net profit margin % (get_profitability_and_net_income)
- Staff & server sales rankings and orders created (get_staff_performance_analytics)
- Lost revenue from cancelled orders, reasons for voiding (get_waste_and_cancellations_audit)
- Peak rush hours and hourly order volume traffic (get_peak_hours_and_order_trends)
- Cashier drawer reconciliations, cash shortages or overages (get_cash_reconciliation_audit)

Rules:
1. Call the appropriate tool(s) to fetch real data before answering.
2. Format financial numbers in ETB (e.g. ETB 1,450.00).
3. If completed sales are 0 but pending bills exist, inform the owner about the active/pending bills currently awaiting collection!
4. Use clear bullet points and clean structure.
5. If the user greets you or asks general conversational questions, reply warmly without calling tools.
`;

    const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...(dto.history || []).map((h) => ({
        role: h.role,
        content: h.content,
      })),
      { role: 'user', content: dto.message },
    ];

    try {
      // Step 1: Initial call to OpenAI with tools
      const firstResponse = await this.openai.chat.completions.create({
        model: this.modelName,
        temperature: 0.2,
        messages: chatMessages,
        tools: this.OWNER_TOOLS,
        tool_choice: 'auto',
      });

      const responseMessage = firstResponse.choices[0]?.message;

      // If the model did not request any tools (e.g. greetings or conversational answer)
      if (!responseMessage?.tool_calls || responseMessage.tool_calls.length === 0) {
        return {
          reply:
            responseMessage?.content?.trim() ||
            'Hello! I am your AI Business Advisor. How can I help you analyze your restaurant operations today?',
        };
      }

      // Step 2: Execute each requested tool in parallel via verified Prisma queries
      chatMessages.push(responseMessage);

      const executedToolNames: string[] = [];

      for (const toolCall of responseMessage.tool_calls) {
        // Safe check for function tool call
        if (toolCall.type !== 'function') continue;

        const fnName = toolCall.function.name;
        executedToolNames.push(fnName);

        let fnArgs: any = {};
        try {
          fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          fnArgs = {};
        }

        let toolOutput: any = null;

        switch (fnName) {
          case 'get_sales_and_revenue':
            toolOutput = await this.executeSalesTool(tenantId, fnArgs);
            break;
          case 'get_inventory_stock':
            toolOutput = await this.executeInventoryTool(tenantId, fnArgs);
            break;
          case 'get_top_dishes':
            toolOutput = await this.executeTopDishesTool(tenantId, fnArgs);
            break;
          case 'get_payment_mix':
            toolOutput = await this.executePaymentMixTool(tenantId);
            break;
          case 'get_expenses_and_payouts':
            toolOutput = await this.executeExpensesTool(tenantId);
            break;
          case 'get_customer_feedback':
            toolOutput = await this.executeFeedbackTool(tenantId, fnArgs);
            break;
          case 'get_dining_tables_status':
            toolOutput = await this.executeDiningTablesTool(tenantId, fnArgs);
            break;
          case 'get_profitability_and_net_income':
            toolOutput = await this.executeProfitabilityTool(tenantId, fnArgs);
            break;
          case 'get_staff_performance_analytics':
            toolOutput = await this.executeStaffPerformanceTool(tenantId);
            break;
          case 'get_waste_and_cancellations_audit':
            toolOutput = await this.executeWasteCancellationsTool(tenantId, fnArgs);
            break;
          case 'get_peak_hours_and_order_trends':
            toolOutput = await this.executePeakHoursTool(tenantId);
            break;
          case 'get_cash_reconciliation_audit':
            toolOutput = await this.executeCashReconciliationTool(tenantId);
            break;
          default:
            toolOutput = { error: `Tool ${fnName} is not recognized.` };
        }

        chatMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: safeJsonStringify(toolOutput),
        });
      }

      // Step 3: Second call to OpenAI with tool outputs to compose final English answer
      const secondResponse = await this.openai.chat.completions.create({
        model: this.modelName,
        temperature: 0.3,
        messages: chatMessages,
      });

      const finalReply =
        secondResponse.choices[0]?.message?.content?.trim() ||
        'I have analyzed the data for your restaurant.';

      return {
        reply: finalReply,
        sqlQuery: `Tool Calling: [${executedToolNames.join(', ')}]`,
        rowCount: executedToolNames.length,
      };
    } catch (err: any) {
      this.logger.error('Error during owner AI process', err);
      throw new InternalServerErrorException(
        `Failed to complete AI request: ${err.message}`,
      );
    }
  }
}
