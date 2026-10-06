import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import {
  ReceiptExtractResponseDto,
  ReceiptExtractService,
} from './receipt-extract.service';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'payments',
  version: '1',
})
export class ReceiptExtractController {
  constructor(private readonly receiptExtract: ReceiptExtractService) {}

  @Post('receipt-extract')
  @ApiConsumes('multipart/form-data')
  @ApiHeader({
    name: 'x-transfer-channel',
    required: false,
    description: 'TELEBIRR or BANK hint',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: ReceiptExtractResponseDto })
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  extract(
    @Request() request,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-transfer-channel') channel?: string,
  ): Promise<ReceiptExtractResponseDto> {
    const hint =
      channel === 'TELEBIRR' || channel === 'BANK' ? channel : undefined;
    return this.receiptExtract.extractFromImage(
      String(request.user.id),
      file,
      hint,
    );
  }
}
