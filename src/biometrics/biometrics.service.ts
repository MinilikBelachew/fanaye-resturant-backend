import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { OpsNotifyService } from '../realtime/ops-notify.service';
import {
  CreateCustomerBiometricDto,
  CustomerBiometricQueryDto,
  UpdateCustomerBiometricDto,
} from './dto/biometrics.dto';
import { CustomerVipTier, Prisma } from '@prisma/client';

export interface FaceExtractionResult {
  detected: boolean;
  liveness_passed: boolean;
  liveness_score: number;
  embedding: number[];
  bbox: number[];
  avatar_base64?: string;
  message?: string;
}

export interface MultiAngleExtractionResult {
  all_passed: boolean;
  frontal_embedding: number[];
  left_embedding: number[];
  right_embedding: number[];
  fused_embedding: number[];
  liveness_scores: number[];
  message?: string;
}

@Injectable()
export class BiometricsService {
  private readonly logger = new Logger(BiometricsService.name);
  private readonly faceServiceUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsNotify: OpsNotifyService,
  ) {
    this.faceServiceUrl =
      process.env.FACE_SERVICE_URL || 'http://localhost:8000';
  }

  /**
   * Dot product cosine similarity between two unit-normalized 128-d vectors.
   * Both vectors have L2 norm = 1.0, so dot product is exactly cosine similarity.
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0.0;
    let dot = 0.0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
    }
    return dot;
  }

  /**
   * Call Python Face Intelligence microservice to detect, verify liveness, and extract 128-d embedding.
   */
  async callFaceService(imageBuffer: Buffer): Promise<FaceExtractionResult> {
    try {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' });
      form.append('file', blob, 'face.jpg');

      const response = await fetch(`${this.faceServiceUrl}/extract-features`, {
        method: 'POST',
        body: form,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Face microservice HTTP error: ${response.status} - ${errorText}`);
        throw new BadRequestException(`Face engine error: ${errorText}`);
      }

      const data = (await response.json()) as FaceExtractionResult;
      return data;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Failed connecting to face engine at ${this.faceServiceUrl}: ${err.message}`);
      throw new InternalServerErrorException(
        `Biometrics AI service unavailable at ${this.faceServiceUrl}. Ensure Face-recognition is running.`,
      );
    }
  }

  /**
   * Scan customer face at Entrance, Host Stand, or POS camera:
   * 1. Extracts embedding and verifies human liveness.
   * 2. Compares against branch customer embeddings (cosine similarity >= 0.363).
   * 3. If matched: increments totalVisits (session debounced), logs visit, dispatches WebSocket alert.
   * 4. If new: auto-generates anonymous CUST-XXXX, saves profile, dispatches WebSocket alert.
   */
  async scanCustomer(
    tenantId: string,
    branchId: string,
    imageBuffer: Buffer,
    cameraLocation = 'Entrance Camera',
    tableSessionId?: string,
  ) {
    const probe = await this.callFaceService(imageBuffer);

    if (!probe.detected) {
      return {
        matched: false,
        status: 'NO_FACE_DETECTED',
        message: probe.message || 'No face detected in camera frame.',
      };
    }

    if (!probe.liveness_passed) {
      this.logger.warn(`Liveness failed on customer scan. Score: ${probe.liveness_score}`);
      throw new BadRequestException(
        `Anti-spoofing check failed (Liveness score: ${probe.liveness_score}). Fake photo or screen detected.`,
      );
    }

    // Load active customer embeddings for the restaurant brand (tenant-wide)
    const existingCustomers = await this.prisma.customerBiometricProfile.findMany({
      where: { tenantId },
      select: {
        id: true,
        customerCode: true,
        displayName: true,
        phone: true,
        notes: true,
        vipTier: true,
        totalVisits: true,
        embedding: true,
        lastVisitAt: true,
        avatarUrl: true,
        branchId: true,
      },
    });

    let bestCustomer: (typeof existingCustomers)[0] | null = null;
    let highestScore = -1.0;

    for (const c of existingCustomers) {
      const score = this.cosineSimilarity(probe.embedding, c.embedding);
      if (score > highestScore) {
        highestScore = score;
        bestCustomer = c;
      }
    }

    // In live webcam video across varying lighting/angles, practical match threshold is 0.28
    // (Pairwise analysis shows same person is 0.29-0.55; different people are < 0.18)
    const MATCH_THRESHOLD = 0.28;

    // CASE 1: RETURNING CUSTOMER MATCHED
    if (bestCustomer && highestScore >= MATCH_THRESHOLD) {
      const now = new Date();
      // Debounce window: 4 hours (14,400,000 ms). Multiple scans during same meal don't increment visits.
      const elapsedMs = now.getTime() - new Date(bestCustomer.lastVisitAt).getTime();
      const isNewDiningSession = elapsedMs > 4 * 60 * 60 * 1000;

      const newVisitCount = isNewDiningSession
        ? bestCustomer.totalVisits + 1
        : bestCustomer.totalVisits;

      // Auto-promote VIP tier based on visit frequency
      let updatedVipTier = bestCustomer.vipTier;
      if (newVisitCount >= 5 && bestCustomer.vipTier === CustomerVipTier.REGULAR) {
        updatedVipTier = CustomerVipTier.VIP;
      } else if (newVisitCount >= 15 && bestCustomer.vipTier === CustomerVipTier.VIP) {
        updatedVipTier = CustomerVipTier.VVIP;
      }

      // Smoothly blend the embedding vector (82% existing + 18% new observation) so profile strengthens over time
      let updatedEmbedding = bestCustomer.embedding;
      if (probe.embedding && probe.embedding.length === 128 && bestCustomer.embedding.length === 128) {
        const blended = bestCustomer.embedding.map((val, idx) => val * 0.82 + probe.embedding[idx] * 0.18);
        const norm = Math.sqrt(blended.reduce((acc, v) => acc + v * v, 0));
        if (norm > 0) {
          updatedEmbedding = blended.map((v) => v / norm);
        }
      }

      const updated = await this.prisma.customerBiometricProfile.update({
        where: { id: bestCustomer.id },
        data: {
          totalVisits: newVisitCount,
          lastVisitAt: now,
          vipTier: updatedVipTier,
          embedding: updatedEmbedding,
          ...(probe.avatar_base64 && (!bestCustomer.avatarUrl || bestCustomer.avatarUrl.length < 50)
            ? { avatarUrl: probe.avatar_base64 }
            : {}),
        },
      });

      // Audit log the visit
      await this.prisma.customerVisitLog.create({
        data: {
          tenantId,
          branchId,
          customerId: bestCustomer.id,
          matchScore: Math.round(highestScore * 10000) / 10000,
          cameraLocation,
          tableSessionId: tableSessionId || null,
        },
      });

      // Real-time broadcast to all waiter and host terminals
      const nameOrCode = updated.displayName || updated.customerCode;
      try {
        await this.opsNotify.notify({
          type: 'customer.arrived' as any,
          tenantId,
          branchId,
          severity: updated.totalVisits >= 3 ? 'URGENT' : 'INFO',
          title:
            updated.totalVisits >= 3
              ? `🌟 Frequent Guest Arrived: ${nameOrCode}`
              : `👋 Returning Guest: ${nameOrCode}`,
          body: `${nameOrCode} is on Visit #${updated.totalVisits}! ${updated.notes ? `(Prefers: ${updated.notes})` : ''}`,
          payload: {
            customerId: updated.id,
            customerCode: updated.customerCode,
            displayName: updated.displayName,
            totalVisits: updated.totalVisits,
            vipTier: updated.vipTier,
            notes: updated.notes,
            matchScore: Math.round(highestScore * 100) / 100,
          },
          rooms: ['floor', 'cashier', 'host', 'manager'],
        });
      } catch (err: any) {
        this.logger.warn(`WebSocket notification failed: ${err.message}`);
      }

      return {
        matched: true,
        status: 'RETURNING',
        customer: updated,
        matchScore: Math.round(highestScore * 1000) / 1000,
        isNewDiningSession,
      };
    }

    // CASE 1.5: Camera enrollment debounce
    // If an unknown guest was just registered in the last 20 seconds at this location,
    // prevent continuous duplicate enrollment if they are still standing in front of the lens.
    const recentEnrolled = await this.prisma.customerBiometricProfile.findFirst({
      where: {
        tenantId,
        createdAt: { gte: new Date(Date.now() - 20 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentEnrolled) {
      const recentScore = this.cosineSimilarity(probe.embedding, recentEnrolled.embedding);
      if (recentScore >= 0.20) {
        this.logger.log(`Debounced duplicate enrollment for recent customer ${recentEnrolled.customerCode} (score: ${recentScore.toFixed(3)})`);
        return {
          matched: true,
          status: 'RETURNING',
          customer: recentEnrolled,
          matchScore: Math.round(recentScore * 1000) / 1000,
          isNewDiningSession: false,
        };
      }
    }

    // CASE 2: FIRST-TIME ANONYMOUS GUEST
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const customerCode = `CUST-${randomHex}`;

    const newCustomer = await this.prisma.customerBiometricProfile.create({
      data: {
        tenantId,
        branchId,
        customerCode,
        embedding: probe.embedding,
        avatarUrl: probe.avatar_base64 || null,
        totalVisits: 1,
        vipTier: CustomerVipTier.REGULAR,
      },
    });

    await this.prisma.customerVisitLog.create({
      data: {
        tenantId,
        branchId,
        customerId: newCustomer.id,
        matchScore: 1.0,
        cameraLocation,
        tableSessionId: tableSessionId || null,
      },
    });

    try {
      await this.opsNotify.notify({
        type: 'customer.arrived' as any,
        tenantId,
        branchId,
        severity: 'INFO',
        title: `👤 New Guest Detected (#${customerCode})`,
        body: `First-time visitor detected at ${cameraLocation}. Assign name and phone in Manager or Table view.`,
        payload: {
          customerId: newCustomer.id,
          customerCode: newCustomer.customerCode,
          displayName: null,
          totalVisits: 1,
          vipTier: newCustomer.vipTier,
        },
        rooms: ['floor', 'host', 'manager'],
      });
    } catch (err: any) {
      this.logger.warn(`WebSocket notification failed: ${err.message}`);
    }

    return {
      matched: true,
      status: 'NEW',
      customer: newCustomer,
      matchScore: 1.0,
      isNewDiningSession: true,
    };
  }

  /**
   * List customers with pagination, visit count filtering, and search.
   */
  async listCustomers(
    tenantId: string,
    branchId: string | null | undefined,
    query: CustomerBiometricQueryDto,
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const targetBranch = branchId && branchId !== 'ALL' ? branchId : undefined;
    const branchFilter = targetBranch ? { branchId: targetBranch } : {};

    const where: Prisma.CustomerBiometricProfileWhereInput = {
      tenantId,
      ...branchFilter,
      ...(query.vipTier ? { vipTier: query.vipTier } : {}),
      ...(query.search
        ? {
            OR: [
              { customerCode: { contains: query.search, mode: 'insensitive' } },
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { notes: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.customerBiometricProfile.count({ where }),
      this.prisma.customerBiometricProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastVisitAt: 'desc' }, { totalVisits: 'desc' }],
        include: {
          branch: { select: { id: true, name: true, displayCode: true } },
          _count: { select: { visitLogs: true } },
        },
      }),
    ]);

    // Summary statistics for manager/owner dashboard
    const [totalVisitsSum, vipCount, regularCount] = await Promise.all([
      this.prisma.customerBiometricProfile.aggregate({
        where: { tenantId, ...branchFilter },
        _sum: { totalVisits: true },
      }),
      this.prisma.customerBiometricProfile.count({
        where: {
          tenantId,
          ...branchFilter,
          vipTier: { in: [CustomerVipTier.VIP, CustomerVipTier.VVIP] },
        },
      }),
      this.prisma.customerBiometricProfile.count({
        where: { tenantId, ...branchFilter, vipTier: CustomerVipTier.REGULAR },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalEnrolledCustomers: total,
        totalVisitsAccumulated: totalVisitsSum._sum.totalVisits || 0,
        vipCount,
        regularCount,
      },
    };
  }

  /**
   * Get single customer with visit history.
   */
  async getCustomer(tenantId: string, id: string) {
    const customer = await this.prisma.customerBiometricProfile.findFirst({
      where: { id, tenantId },
      include: {
        visitLogs: {
          orderBy: { detectedAt: 'desc' },
          take: 30,
        },
      },
    });

    if (!customer) throw new NotFoundException('Customer profile not found');
    return customer;
  }

  /**
   * Manager manually creates a customer or enrolls photo.
   */
  async createCustomer(
    tenantId: string,
    branchId: string,
    dto: CreateCustomerBiometricDto,
    imageBuffer?: Buffer,
  ) {
    let embedding: number[] = [];

    if (imageBuffer) {
      const probe = await this.callFaceService(imageBuffer);
      if (!probe.detected) {
        throw new BadRequestException('No face detected in uploaded photo');
      }
      if (!probe.liveness_passed) {
        throw new BadRequestException('Anti-spoofing liveness check failed');
      }
      embedding = probe.embedding;
    } else {
      // Mock placeholder vector if no photo yet (can be scanned at entrance later)
      embedding = new Array(128).fill(0.0);
    }

    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const customerCode = `CUST-${randomHex}`;

    return this.prisma.customerBiometricProfile.create({
      data: {
        tenantId,
        branchId,
        customerCode,
        displayName: dto.displayName?.trim() || null,
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
        vipTier: dto.vipTier || CustomerVipTier.REGULAR,
        embedding,
        totalVisits: 1,
      },
    });
  }

  /**
   * Manager updates an anonymous or existing customer (e.g. assigns real name, phone, notes, VIP status).
   */
  async updateCustomer(
    tenantId: string,
    id: string,
    dto: UpdateCustomerBiometricDto,
  ) {
    const customer = await this.prisma.customerBiometricProfile.findFirst({
      where: { id, tenantId },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.customerBiometricProfile.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName.trim() || null }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.email !== undefined ? { email: dto.email.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
        ...(dto.vipTier ? { vipTier: dto.vipTier } : {}),
      },
    });
  }

  /**
   * Delete customer profile and all their visit logs.
   */
  async deleteCustomer(tenantId: string, id: string) {
    const customer = await this.prisma.customerBiometricProfile.findFirst({
      where: { id, tenantId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    await this.prisma.customerBiometricProfile.delete({ where: { id } });
    return { success: true, message: `Customer ${customer.customerCode} deleted` };
  }
}

