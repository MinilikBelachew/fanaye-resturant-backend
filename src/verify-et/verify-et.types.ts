export type VerifyEtBank =
  | 'cbe'
  | 'boa'
  | 'telebirr'
  | 'mpesa'
  | 'cbebirr'
  | 'dashen'
  | 'awash'
  | 'siinqee'
  | 'kaafiebirr';

export type VerifyEtSubmitInput = {
  bank: VerifyEtBank;
  reference?: string;
  accountSuffix?: string;
  phoneNumber?: string;
  settlementAccount?: string;
  idempotencyKey: string;
  image?: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
  };
};

export type VerifyEtResultItem = {
  bank?: string;
  status?: string;
  verified?: boolean;
  amount?: number | string;
  currency?: string;
  senderName?: string;
  receiverName?: string;
  receiverAccount?: string;
  referenceNumber?: string;
  receiptNumber?: string;
  transactionNumber?: string;
  timestamp?: string;
  confirmationHistory?: {
    isFirstConfirmation?: boolean;
    confirmedBefore?: boolean;
    confirmationCount?: number;
  };
  settlementAccountMatch?: {
    matched?: boolean;
    reason?: string;
  };
};

export type VerifyEtEnvelope = {
  success?: boolean;
  message?: string;
  data?: VerifyEtResultItem[] | VerifyEtResultItem | null;
  requestId?: string;
  statusUrl?: string;
  estimatedWaitMs?: number;
  verification?: {
    requestId?: string;
    bank?: string;
    processingStatus?: string;
    status?: string;
    verified?: boolean;
  };
  links?: {
    statusUrl?: string;
    pollAfterMs?: number;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

export type VerifyEtCompleted = {
  requestId: string;
  verified: boolean;
  status: string;
  amount: number | null;
  currency: string | null;
  bank: string | null;
  reference: string | null;
  message: string;
  raw: VerifyEtEnvelope;
};
