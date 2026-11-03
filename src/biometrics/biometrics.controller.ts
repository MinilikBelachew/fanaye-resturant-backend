import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { BiometricsService } from './biometrics.service';
import {
  CreateCustomerBiometricDto,
  CustomerBiometricQueryDto,
  UpdateCustomerBiometricDto,
} from './dto/biometrics.dto';
import { IdentityContextService } from '../identity/identity-context.service';

@ApiTags('Biometrics & Customer Intelligence')
@Controller({
  path: 'biometrics',
  version: '1',
})
export class BiometricsController {
  constructor(
    private readonly biometricsService: BiometricsService,
    private readonly identityContextService: IdentityContextService,
  ) {}

  /**
   * Scan Camera Frame (Overhead Camera, Tablet, or POS Webhook).
   * Identifies returning customer or registers anonymous first-timer.
   */
  @Post('scan-customer')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        branchId: { type: 'string' },
        cameraLocation: { type: 'string' },
        tableSessionId: { type: 'string' },
      },
    },
  })
  async scanCustomer(
    @UploadedFile() file: Express.Multer.File,
    @Body('branchId') branchId?: string,
    @Body('tenantId') tenantId?: string,
    @Body('cameraLocation') cameraLocation?: string,
    @Body('tableSessionId') tableSessionId?: string,
    @Request() req?: any,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Image file is required');
    }

    let finalTenantId = tenantId;
    let finalBranchId = branchId;

    // If request has JWT user credentials, auto-resolve tenant and branch
    if (req?.user?.id && (!finalTenantId || !finalBranchId)) {
      const authCtx = await this.identityContextService.getByUserId(String(req.user.id));
      finalTenantId = finalTenantId || authCtx.tenantId || undefined;
      finalBranchId = finalBranchId || authCtx.branchId || undefined;
    }

    if (!finalTenantId || !finalBranchId) {
      // Fallback: pick the first active branch from database if not specified
      const fallbackBranch = await this.biometricsService['prisma'].branch.findFirst({
        where: { status: 'ACTIVE' },
        select: { id: true, tenantId: true },
      });
      if (fallbackBranch) {
        finalTenantId = finalTenantId || fallbackBranch.tenantId;
        finalBranchId = finalBranchId || fallbackBranch.id;
      } else {
        throw new BadRequestException('branchId and tenantId must be provided or configured');
      }
    }

    return this.biometricsService.scanCustomer(
      finalTenantId,
      finalBranchId,
      file.buffer,
      cameraLocation || 'Entrance Camera',
      tableSessionId,
    );
  }

  /**
   * Manager Dashboard: List all customers with visit counts and search.
   */
  @Get('customers')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async listCustomers(
    @Request() req,
    @Query() query: CustomerBiometricQueryDto,
  ) {
    const authCtx = await this.identityContextService.getByUserId(String(req.user.id));
    const tenantId = authCtx.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Active tenant required for customer intelligence');
    }

    // If query specifies a branch or ALL, prioritize it; otherwise use user branch
    const effectiveBranchId = (query.branchId !== undefined ? query.branchId : authCtx.branchId) || undefined;

    return this.biometricsService.listCustomers(tenantId, effectiveBranchId, query);
  }

  /**
   * Manager Dashboard: View detailed customer profile + visit history.
   */
  @Get('customers/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async getCustomer(@Request() req, @Param('id') id: string) {
    const authCtx = await this.identityContextService.getByUserId(String(req.user.id));
    return this.biometricsService.getCustomer(authCtx.tenantId!, id);
  }

  /**
   * Manager Dashboard: Add new customer manually (with optional photo).
   */
  @Post('customers')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('photo'))
  async createCustomer(
    @Request() req,
    @Body() dto: CreateCustomerBiometricDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const authCtx = await this.identityContextService.getByUserId(String(req.user.id));
    return this.biometricsService.createCustomer(
      authCtx.tenantId!,
      authCtx.branchId!,
      dto,
      photo?.buffer,
    );
  }

  /**
   * Manager Dashboard: Update customer details (Assign name, phone, notes, VIP tier).
   */
  @Patch('customers/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async updateCustomer(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerBiometricDto,
  ) {
    const authCtx = await this.identityContextService.getByUserId(String(req.user.id));
    return this.biometricsService.updateCustomer(authCtx.tenantId!, id, dto);
  }

  /**
   * Manager Dashboard: Remove customer record.
   */
  @Delete('customers/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async deleteCustomer(@Request() req, @Param('id') id: string) {
    const authCtx = await this.identityContextService.getByUserId(String(req.user.id));
    return this.biometricsService.deleteCustomer(authCtx.tenantId!, id);
  }
}

