import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../config/config.type';
import {
  VerifyEtCompleted,
  VerifyEtEnvelope,
  VerifyEtResultItem,
  VerifyEtSubmitInput,
} from './verify-et.types';

const POLL_DEADLINE_MS = 125_000;
const DEFAULT_POLL_AFTER_MS = 1500;

@Injectable()
export class VerifyEtService {
  private readonly logger = new Logger(VerifyEtService.name);

  constructor(private readonly config: ConfigService<AllConfigType>) {}

  isEnabled(): boolean {
    return Boolean(this.config.get('verifyEt.enabled', { infer: true }));
  }

  async verifyPayment(input: VerifyEtSubmitInput): Promise<VerifyEtCompleted> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException({
        status: 503,
        code: 'VERIFY_ET_DISABLED',
        errors: { verifyEt: 'VERIFY_ET_DISABLED' },
      });
    }

    const reference = input.reference?.trim();
    // Typed reference always wins: verify by number, keep the photo only as local proof.
    if (reference && reference.length >= 4) {
      return this.submit({ ...input, image: undefined }, false);
    }

    if (input.image) {
      return this.submit(input, true);
    }

    throw new UnprocessableEntityException({
      status: 422,
      code: 'REFERENCE_OR_PHOTO_REQUIRED',
      message:
        'Type the Telebirr/CBE transaction number, or enable Image Processing and send a receipt photo.',
      errors: { reference: 'REFERENCE_OR_PHOTO_REQUIRED' },
    });
  }

  private async submit(
    input: VerifyEtSubmitInput,
    useImage: boolean,
  ): Promise<VerifyEtCompleted> {
    const baseUrl = this.config.getOrThrow('verifyEt.baseUrl', { infer: true });
    const apiKey = this.config.getOrThrow('verifyEt.apiKey', { infer: true });
    const waitMs = this.config.get('verifyEt.waitMs', { infer: true }) ?? 8000;
    const submitUrl = `${baseUrl}/api/verify?waitMs=${encodeURIComponent(String(useImage ? Math.max(waitMs, 15000) : waitMs))}`;

    const fields = this.buildFields(input);
    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      'Idempotency-Key': input.idempotencyKey.slice(0, 255),
    };

    let body: BodyInit;
    if (useImage && input.image) {
      const form = new FormData();
      form.append(
        'image',
        new Blob([new Uint8Array(input.image.buffer)], {
          type: input.image.mimeType,
        }),
        input.image.filename,
      );
      for (const [key, value] of Object.entries(fields)) {
        form.append(key, value);
      }
      body = form;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(fields);
    }

    let envelope: VerifyEtEnvelope;
    let httpStatus: number;
    try {
      const response = await fetch(submitUrl, {
        method: 'POST',
        headers,
        body,
      });
      httpStatus = response.status;
      envelope = (await response.json()) as VerifyEtEnvelope;
    } catch (error) {
      this.logger.error(
        `Verify.ET submit failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException({
        status: 503,
        code: 'VERIFY_ET_UNAVAILABLE',
        errors: { verifyEt: 'VERIFY_ET_UNAVAILABLE' },
      });
    }

    this.throwIfFailed(httpStatus, envelope);

    const completed = this.asCompleted(envelope);
    if (completed) return completed;

    const requestId = envelope.requestId ?? envelope.verification?.requestId;
    if (!requestId) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'VERIFY_ET_NO_REQUEST_ID',
        message: envelope.message ?? 'Verify.ET did not return a request id.',
        errors: { verifyEt: 'VERIFY_ET_NO_REQUEST_ID' },
      });
    }

    return this.pollUntilDone(baseUrl, apiKey, requestId, envelope);
  }

  private throwIfFailed(httpStatus: number, envelope: VerifyEtEnvelope) {
    if (httpStatus === 202 || (httpStatus >= 200 && httpStatus < 300)) {
      return;
    }

    const code = envelope.error?.code ?? 'VERIFY_ET_REJECTED';
    const message =
      envelope.message ?? envelope.error?.message ?? 'Verification rejected.';

    if (httpStatus === 402) {
      throw new UnprocessableEntityException({
        status: 422,
        code:
          code === 'INSUFFICIENT_IMAGE_CREDITS'
            ? 'INSUFFICIENT_IMAGE_CREDITS'
            : 'VERIFY_ET_NO_CREDITS',
        message,
        errors: { verifyEt: code },
      });
    }

    if (httpStatus === 403 && code === 'IMAGE_PROCESSING_DISABLED') {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'IMAGE_PROCESSING_DISABLED',
        message:
          'Turn on Image Processing in the Verify.ET dashboard (Image Processing tab), then retry the photo. Or type the transaction number.',
        errors: { verifyEt: 'IMAGE_PROCESSING_DISABLED' },
      });
    }

    if (httpStatus === 403) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'VERIFY_ET_FORBIDDEN',
        message:
          message ||
          'Verify.ET rejected the API key. Ensure verification:write and verification:read are enabled.',
        errors: { verifyEt: 'VERIFY_ET_FORBIDDEN' },
      });
    }

    throw new UnprocessableEntityException({
      status: 422,
      code,
      message,
      errors: { reference: code },
    });
  }

  private buildFields(input: VerifyEtSubmitInput): Record<string, string> {
    const reference = input.reference?.trim();
    const body: Record<string, string> = {
      bank: input.bank,
    };

    if (reference) {
      if (input.bank === 'telebirr' || input.bank === 'mpesa') {
        body.transactionNumber = reference;
        body.reference = reference;
      } else if (input.bank === 'cbebirr') {
        body.receiptNumber = reference;
        body.reference = reference;
      } else {
        body.reference = reference;
        body.referenceNumber = reference;
      }
    }

    if (input.phoneNumber?.trim()) {
      body.phoneNumber = input.phoneNumber.trim();
      body.phone = input.phoneNumber.trim();
    }
    if (input.accountSuffix?.trim()) {
      body.accountSuffix = input.accountSuffix.trim();
      body.suffix = input.accountSuffix.trim();
    }
    if (input.settlementAccount?.trim()) {
      body.settlementAccount = input.settlementAccount.trim();
    }

    return body;
  }

  private async pollUntilDone(
    baseUrl: string,
    apiKey: string,
    requestId: string,
    seed: VerifyEtEnvelope,
  ): Promise<VerifyEtCompleted> {
    const deadline = Date.now() + POLL_DEADLINE_MS;
    let pollAfter = seed.links?.pollAfterMs ?? DEFAULT_POLL_AFTER_MS;
    let last = seed;

    while (Date.now() < deadline) {
      await sleep(pollAfter);
      try {
        const response = await fetch(
          `${baseUrl}/api/verify/${encodeURIComponent(requestId)}`,
          { headers: { 'x-api-key': apiKey } },
        );
        last = (await response.json()) as VerifyEtEnvelope;
      } catch (error) {
        this.logger.warn(
          `Verify.ET poll failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      const completed = this.asCompleted(last, requestId);
      if (completed) return completed;

      pollAfter = last.links?.pollAfterMs ?? DEFAULT_POLL_AFTER_MS;
    }

    throw new UnprocessableEntityException({
      status: 422,
      code: 'VERIFY_ET_TIMEOUT',
      message:
        'Bank verification timed out. Try again with the same reference.',
      errors: { verifyEt: 'VERIFY_ET_TIMEOUT' },
    });
  }

  private asCompleted(
    envelope: VerifyEtEnvelope,
    fallbackRequestId?: string,
  ): VerifyEtCompleted | null {
    const processing =
      envelope.verification?.processingStatus ??
      (Array.isArray(envelope.data)
        ? undefined
        : (envelope.data as VerifyEtResultItem | null | undefined)?.status);

    const item = firstItem(envelope.data);
    const verified =
      envelope.verification?.verified === true ||
      item?.verified === true ||
      item?.status === 'success';

    const terminal =
      processing === 'completed' ||
      processing === 'failed' ||
      envelope.verification?.status === 'success' ||
      envelope.verification?.status === 'not_found' ||
      envelope.verification?.status === 'failed' ||
      item?.verified === true ||
      item?.status === 'success' ||
      item?.status === 'not_found' ||
      item?.status === 'failed';

    if (!terminal) return null;

    const amountRaw = item?.amount;
    const amount =
      typeof amountRaw === 'number'
        ? amountRaw
        : typeof amountRaw === 'string' && amountRaw.trim()
          ? Number(amountRaw)
          : null;

    return {
      requestId:
        envelope.requestId ??
        envelope.verification?.requestId ??
        fallbackRequestId ??
        '',
      verified: Boolean(verified),
      status:
        envelope.verification?.status ??
        item?.status ??
        (verified ? 'success' : 'failed'),
      amount: Number.isFinite(amount as number) ? (amount as number) : null,
      currency: item?.currency ?? null,
      bank: item?.bank ?? envelope.verification?.bank ?? null,
      reference:
        item?.receiptNumber ??
        item?.referenceNumber ??
        item?.transactionNumber ??
        null,
      message: envelope.message ?? (verified ? 'Verified' : 'Not verified'),
      raw: envelope,
    };
  }
}

function firstItem(
  data: VerifyEtEnvelope['data'],
): VerifyEtResultItem | undefined {
  if (!data) return undefined;
  if (Array.isArray(data)) return data[0];
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
