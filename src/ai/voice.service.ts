import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly openai: OpenAI;
  private readonly ttsVoice: string;

  constructor(private readonly config: ConfigService) {
    const apiKey =
      this.config.get<string>('ai.openaiApiKey') ||
      process.env.OPENAI_API_KEY ||
      '';
    this.openai = new OpenAI({ apiKey });
    this.ttsVoice = this.config.get<string>('ai.voiceName') || 'alloy';
  }

  /**
   * Transcribe user audio (Speech-to-Text) using OpenAI Whisper
   */
  async transcribeAudio(
    audioBase64: string,
    mimeType: string = 'audio/webm',
  ): Promise<string> {
    if (!audioBase64 || !audioBase64.trim()) {
      return '';
    }

    try {
      const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
      const audioBuffer = Buffer.from(cleanBase64, 'base64');

      if (audioBuffer.length < 500) {
        this.logger.warn(
          `Audio recording too short (${audioBuffer.length} bytes). Skipping transcription.`,
        );
        return '';
      }

      // Normalize MIME type to standard OpenAI supported format without parameters (e.g. strip ;codecs=opus)
      let cleanMime = 'audio/webm';
      let ext = 'webm';
      const lowerMime = (mimeType || '').toLowerCase();

      if (lowerMime.includes('wav')) {
        cleanMime = 'audio/wav';
        ext = 'wav';
      } else if (lowerMime.includes('mp4') || lowerMime.includes('m4a')) {
        cleanMime = 'audio/mp4';
        ext = 'mp4';
      } else if (lowerMime.includes('ogg') || lowerMime.includes('oga')) {
        cleanMime = 'audio/ogg';
        ext = 'ogg';
      } else if (lowerMime.includes('mpeg') || lowerMime.includes('mp3')) {
        cleanMime = 'audio/mpeg';
        ext = 'mp3';
      }

      const file = await toFile(audioBuffer, `recording.${ext}`, {
        type: cleanMime,
      });

      const transcription = await this.openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'en',
      });

      return (transcription.text || '').trim();
    } catch (err: any) {
      this.logger.error(`Whisper transcription failed: ${err.message}`, err.stack);
      throw new Error(`Voice transcription failed: ${err.message}`);
    }
  }

  /**
   * Convert text response into realistic spoken human audio (Text-to-Speech)
   */
  async synthesizeSpeech(
    text: string,
    voiceOverride?: string,
  ): Promise<string> {
    if (!text || !text.trim()) {
      return '';
    }

    try {
      // Clean text for speech synthesis: remove markdown fences, symbols, urls
      const speechText = this.prepareTextForSpeech(text);

      const mp3Response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: (voiceOverride || this.ttsVoice || 'alloy') as any,
        input: speechText.slice(0, 4000),
        response_format: 'mp3',
      });

      const arrayBuf = await mp3Response.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      return buffer.toString('base64');
    } catch (err: any) {
      this.logger.warn(`OpenAI TTS generation failed: ${err.message}`);
      return '';
    }
  }

  /**
   * Clean markdown formatting, asterisks, bullet points, and code fences so speech sounds natural
   */
  private prepareTextForSpeech(raw: string): string {
    return raw
      .replace(/```[\s\S]*?```/g, '') // remove code blocks
      .replace(/`([^`]+)`/g, '$1') // inline code
      .replace(/[*_~#]/g, '') // bold/italic/headings
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
      .replace(/^[\s]*[-+*]\s+/gm, '') // bullet markers
      .replace(/\s+/g, ' ')
      .trim();
  }
}

