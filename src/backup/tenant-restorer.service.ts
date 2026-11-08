import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as zlib from 'zlib';

@Injectable()
export class TenantRestorerService {
  private readonly logger = new Logger(TenantRestorerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Restore a tenant's database records from a .sql.gz or .sql archive
   */
  async restoreFromArchive(
    archiveBuffer: Buffer,
    expectedTenantId?: string,
  ): Promise<{
    tenantId: string;
    tenantName: string;
    statementsCount: number;
    success: boolean;
  }> {
    if (!archiveBuffer || archiveBuffer.length === 0) {
      throw new BadRequestException('Empty backup archive uploaded.');
    }

    let sqlString = '';
    // Check gzip magic bytes (0x1f 0x8b)
    if (archiveBuffer[0] === 0x1f && archiveBuffer[1] === 0x8b) {
      try {
        sqlString = zlib.gunzipSync(archiveBuffer).toString('utf-8');
      } catch (err: any) {
        throw new BadRequestException(`Failed to decompress backup archive: ${err.message}`);
      }
    } else {
      sqlString = archiveBuffer.toString('utf-8');
    }

    if (!sqlString.includes('RESTORCH AUTOMATED TENANT BACKUP ARCHIVE')) {
      throw new BadRequestException(
        'Invalid backup file. The uploaded file is not a verified Restorch tenant archive.',
      );
    }

    // Extract tenant ID and Name from header comment
    const tenantIdMatch = sqlString.match(/-- Tenant ID: ([a-f0-9-]+)/i);
    const tenantNameMatch = sqlString.match(/-- Tenant Name: (.+)/i);

    const archiveTenantId = tenantIdMatch ? tenantIdMatch[1].trim() : '';
    const archiveTenantName = tenantNameMatch ? tenantNameMatch[1].trim() : 'Restored Tenant';

    if (!archiveTenantId) {
      throw new BadRequestException('Backup archive is missing a valid Tenant ID header.');
    }

    // Safety check: If restoring as a specific tenant, ensure the archive matches
    if (expectedTenantId && expectedTenantId !== archiveTenantId) {
      throw new BadRequestException(
        `Archive belongs to tenant ID ${archiveTenantId}, which does not match your active restaurant ID.`,
      );
    }

    this.logger.log(
      `Restoring tenant "${archiveTenantName}" (${archiveTenantId}) from verified backup archive...`,
    );

    // Split SQL statements safely
    const lines = sqlString.split('\n');
    const statements: string[] = [];
    let currentStmt = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) continue;

      currentStmt += (currentStmt ? ' ' : '') + trimmed;
      if (trimmed.endsWith(';')) {
        statements.push(currentStmt);
        currentStmt = '';
      }
    }

    // Execute in PostgreSQL transaction with statement timeout
    try {
      await this.prisma.$transaction(
        async (tx) => {
          // Disable all foreign key triggers and constraint checks during bulk restore
          await tx.$executeRawUnsafe(`SET session_replication_role = 'replica';`);

          try {
            for (const stmt of statements) {
              await tx.$executeRawUnsafe(stmt);
            }
          } finally {
            // Restore normal trigger and foreign key behavior
            await tx.$executeRawUnsafe(`SET session_replication_role = 'origin';`);
          }
        },
        { timeout: 120000 }, // 120s timeout for large restores
      );

      this.logger.log(
        `Successfully restored tenant "${archiveTenantName}" (${archiveTenantId}) with ${statements.length} SQL statements.`,
      );

      return {
        tenantId: archiveTenantId,
        tenantName: archiveTenantName,
        statementsCount: statements.length,
        success: true,
      };
    } catch (err: any) {
      this.logger.error(`Restoration failed: ${err.message}`, err.stack);
      throw new BadRequestException(`Database restore failed: ${err.message}`);
    }
  }

  /**
   * Preview an archive's metadata and table contents before executing import
   */
  previewArchive(
    archiveBuffer: Buffer,
    expectedTenantId?: string,
  ): {
    valid: boolean;
    tenantId: string;
    tenantName: string;
    exportedAt: string;
    fileSizeKb: number;
    tables: { tableName: string; recordsCount: number }[];
    totalRecords: number;
    totalStatements: number;
    isTenantMatch: boolean;
  } {
    if (!archiveBuffer || archiveBuffer.length === 0) {
      throw new BadRequestException('Empty backup archive uploaded.');
    }

    let sqlString = '';
    // Check gzip magic bytes (0x1f 0x8b)
    if (archiveBuffer[0] === 0x1f && archiveBuffer[1] === 0x8b) {
      try {
        sqlString = zlib.gunzipSync(archiveBuffer).toString('utf-8');
      } catch (err: any) {
        throw new BadRequestException(`Failed to decompress backup archive: ${err.message}`);
      }
    } else {
      sqlString = archiveBuffer.toString('utf-8');
    }

    if (!sqlString.includes('RESTORCH AUTOMATED TENANT BACKUP ARCHIVE')) {
      throw new BadRequestException(
        'Invalid backup file. The uploaded file is not a verified Restorch tenant archive.',
      );
    }

    const tenantIdMatch = sqlString.match(/-- Tenant ID: ([a-f0-9-]+)/i);
    const tenantNameMatch = sqlString.match(/-- Tenant Name: (.+)/i);
    const exportedAtMatch = sqlString.match(/-- Exported At: (.+)/i);

    const archiveTenantId = tenantIdMatch ? tenantIdMatch[1].trim() : '';
    const archiveTenantName = tenantNameMatch ? tenantNameMatch[1].trim() : 'Restored Tenant';
    const exportedAt = exportedAtMatch ? exportedAtMatch[1].trim() : new Date().toISOString();

    const tableMatches = [...sqlString.matchAll(/-- Table: public\."([^"]+)" \((\d+) records\)/g)];
    const tables = tableMatches.map((m) => ({
      tableName: m[1],
      recordsCount: parseInt(m[2], 10),
    }));

    const totalRecords = tables.reduce((acc, t) => acc + t.recordsCount, 0);
    const statementsCount = (sqlString.match(/;\s*$/gm) || []).length;
    const isTenantMatch = expectedTenantId ? expectedTenantId === archiveTenantId : true;

    return {
      valid: true,
      tenantId: archiveTenantId,
      tenantName: archiveTenantName,
      exportedAt,
      fileSizeKb: Math.round(archiveBuffer.length / 1024),
      tables,
      totalRecords,
      totalStatements: statementsCount,
      isTenantMatch,
    };
  }
}

