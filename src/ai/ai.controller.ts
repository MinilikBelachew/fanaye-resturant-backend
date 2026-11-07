import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AiService } from './ai.service';
import { TextToSqlService } from './text-to-sql.service';
import { VoiceService } from './voice.service';
import { IdentityContextService } from '../identity/identity-context.service';
import {
  ChatRequestDto,
  ChatResponseDto,
  SpeakRequestDto,
  SpeakResponseDto,
  TranscribeRequestDto,
  TranscribeResponseDto,
} from './dto/chat-request.dto';

@ApiTags('AI Advisor')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'ai',
  version: '1',
})
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly textToSqlService: TextToSqlService,
    private readonly voiceService: VoiceService,
    private readonly identityContext: IdentityContextService,
  ) {}

  @Post('chat')
  @ApiOperation({
    summary: 'Executive Restaurant AI Advisor for Restaurant Owners',
    description:
      'Translates natural English analytics questions into safe read-only SQL queries or tool calls with tenant isolation, and generates spoken audio.',
  })
  @ApiOkResponse({ type: ChatResponseDto })
  @HttpCode(HttpStatus.OK)
  async chat(
    @Request() request,
    @Body() dto: ChatRequestDto,
  ): Promise<ChatResponseDto> {
    const userId = request.user?.id ? String(request.user.id) : null;
    if (!userId) {
      throw new ForbiddenException('Invalid user session.');
    }

    const context = await this.identityContext.getByUserId(userId);

    // Strictly enforce Owner or Platform Super Admin access only
    const allowedRoles = ['OWNER_ADMIN', 'PLATFORM_SUPER_ADMIN'];
    if (!context || !allowedRoles.includes(context.roleCode)) {
      throw new ForbiddenException(
        'The Executive AI Advisor is restricted exclusively to restaurant owners.',
      );
    }

    const tenantId = context.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('User is not associated with an active restaurant tenant.');
    }

    let result: ChatResponseDto;
    // Function calling tools engine is the default; text-to-sql is preserved if explicitly requested
    if (dto.engine === 'sql') {
      result = await this.textToSqlService.processChat(tenantId, dto);
    } else {
      result = await this.aiService.processOwnerChat(tenantId, dto);
    }

    // Automatically synthesize voice audio unless explicitly opted out
    if (dto.voiceResponse !== false && result.reply) {
      try {
        result.audioBase64 = await this.voiceService.synthesizeSpeech(
          result.reply,
          dto.voice,
        );
      } catch {
        // audio synthesis failure does not break text response
      }
    }

    return result;
  }

  @Post('transcribe')
  @ApiOperation({
    summary: 'Speech-to-Text via OpenAI Whisper',
    description: 'Transcribes recorded audio from the browser microphone into text.',
  })
  @ApiOkResponse({ type: TranscribeResponseDto })
  @HttpCode(HttpStatus.OK)
  async transcribe(
    @Request() request,
    @Body() dto: TranscribeRequestDto,
  ): Promise<TranscribeResponseDto> {
    const userId = request.user?.id ? String(request.user.id) : null;
    if (!userId) {
      throw new ForbiddenException('Invalid user session.');
    }

    const text = await this.voiceService.transcribeAudio(
      dto.audioBase64,
      dto.mimeType,
    );
    return { text };
  }

  @Post('speak')
  @ApiOperation({
    summary: 'Text-to-Speech via OpenAI TTS',
    description: 'Synthesizes text into high quality spoken audio (base64 MP3).',
  })
  @ApiOkResponse({ type: SpeakResponseDto })
  @HttpCode(HttpStatus.OK)
  async speak(
    @Request() request,
    @Body() dto: SpeakRequestDto,
  ): Promise<SpeakResponseDto> {
    const userId = request.user?.id ? String(request.user.id) : null;
    if (!userId) {
      throw new ForbiddenException('Invalid user session.');
    }

    const audioBase64 = await this.voiceService.synthesizeSpeech(
      dto.text,
      dto.voice,
    );
    return { audioBase64 };
  }
}

