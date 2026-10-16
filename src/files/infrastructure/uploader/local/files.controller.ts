import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Response,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { basename } from 'path';
import { Request } from 'express';
import { FilesLocalService } from './files.service';
import { FileResponseDto } from './dto/file-response.dto';
import { PrismaService } from '../../../../database/prisma.service';

@ApiTags('Files')
@Controller({
  path: 'files',
  version: '1',
})
export class FilesLocalController {
  constructor(
    private readonly filesService: FilesLocalService,
    private readonly prisma: PrismaService,
  ) {}

  @ApiCreatedResponse({
    type: FileResponseDto,
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<FileResponseDto> {
    return this.filesService.create(file);
  }

  @Get(':path')
  @ApiExcludeEndpoint()
  async download(
    @Param('path') path: string,
    @Req() request: Request,
    @Response() response,
  ) {
    const safeName = basename(path || '');
    if (!safeName || safeName !== path.replace(/^.*[/\\]/, '')) {
      throw new ForbiddenException('Invalid file path.');
    }
    if (path.includes('..')) {
      throw new ForbiddenException('Invalid file path.');
    }

    const fileRow = await this.prisma.file.findFirst({
      where: {
        OR: [
          { path: { endsWith: `/${safeName}` } },
          { path: { endsWith: `\\${safeName}` } },
          { path: safeName },
        ],
      },
      include: {
        transferReceipts: { take: 1 },
      },
    });

    if (!fileRow) {
      throw new NotFoundException('File not found.');
    }

    // Payment receipts require authentication; menu/site/avatar assets stay public.
    if (fileRow.transferReceipts.length > 0) {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException(
          'Authentication required to download this file.',
        );
      }
    }

    return response.sendFile(safeName, { root: './files' });
  }
}
