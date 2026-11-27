import { execFileSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const DESKTOP_DEVICE_LICENSE_KEY = 'DESKTOP_DEVICE_LICENSE';

export const EMBEDDED_DESKTOP_PUBLIC_KEY = [
  '-----BEGIN PUBLIC KEY-----',
  'MCowBQYDK2VwAyEAQtuwgHJFWQ46Up7xiOU7/5qRyG6dzmbr5oYMIv0y+pM=',
  '-----END PUBLIC KEY-----',
].join('\n');

export interface DesktopLicensePayload {
  version: number;
  tenantId: string;
  hardwareHash: string;
  deviceLabel: string;
  issuedAt: string;
}

export interface SignedDesktopLicense extends DesktopLicensePayload {
  signature: string;
}

let cachedFingerprint: { hardwareHash: string; deviceLabel: string } | null =
  null;

function normalizePem(raw?: string | null): string {
  if (!raw) return '';
  return raw.trim().replace(/\\n/g, '\n');
}

function readWindowsMachineGuid(): string {
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync(
      'reg',
      [
        'query',
        'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
        '/v',
        'MachineGuid',
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 3000 },
    );
    const match = out.match(/MachineGuid\s+REG_\w+\s+([^\r\n]+)/i);
    if (match?.[1]) return match[1].trim();
  } catch {
    // fallback below
  }
  return '';
}

export function getLocalHardwareFingerprint(): {
  hardwareHash: string;
  deviceLabel: string;
} {
  const envHash = (process.env.DESKTOP_HARDWARE_HASH || '').trim();
  const deviceLabel = os.hostname() || 'POS-PC';
  if (envHash) {
    return { hardwareHash: envHash, deviceLabel };
  }
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  const machineGuid = readWindowsMachineGuid();
  const cpuModel = os.cpus()?.[0]?.model || '';
  const raw = machineGuid
    ? `win-guid:${machineGuid}:${os.arch()}`
    : `host:${os.hostname()}:${os.platform()}:${os.arch()}:${cpuModel}`;

  const hardwareHash = crypto.createHash('sha256').update(raw).digest('hex');
  cachedFingerprint = { hardwareHash, deviceLabel };
  return cachedFingerprint;
}

function canonicalLicenseMessage(payload: DesktopLicensePayload): Buffer {
  const canonical = JSON.stringify({
    version: payload.version,
    tenantId: payload.tenantId,
    hardwareHash: payload.hardwareHash,
    deviceLabel: payload.deviceLabel,
    issuedAt: payload.issuedAt,
  });
  return Buffer.from(canonical, 'utf8');
}

export function signDesktopLicense(
  payload: DesktopLicensePayload,
  privateKeyRaw?: string,
): SignedDesktopLicense {
  const pem = normalizePem(
    privateKeyRaw ?? process.env.DESKTOP_LICENSE_PRIVATE_KEY,
  );
  if (!pem) {
    throw new Error(
      'DESKTOP_LICENSE_PRIVATE_KEY is not configured on the Cloud server.',
    );
  }
  const keyObj = crypto.createPrivateKey(pem);
  const signature = crypto
    .sign(null, canonicalLicenseMessage(payload), keyObj)
    .toString('base64');
  return { ...payload, signature };
}

export function verifyDesktopLicense(
  license: Partial<SignedDesktopLicense> | null | undefined,
  expectedHardwareHash: string,
  expectedTenantId?: string,
  publicKeyRaw?: string,
): { valid: boolean; reason?: string } {
  if (!license || typeof license !== 'object') {
    return { valid: false, reason: 'Missing desktop license file.' };
  }
  if (
    !license.tenantId ||
    !license.hardwareHash ||
    !license.issuedAt ||
    !license.signature ||
    typeof license.version !== 'number'
  ) {
    return { valid: false, reason: 'Malformed desktop license payload.' };
  }

  const pem =
    normalizePem(publicKeyRaw ?? process.env.DESKTOP_LICENSE_PUBLIC_KEY) ||
    EMBEDDED_DESKTOP_PUBLIC_KEY;

  try {
    const keyObj = crypto.createPublicKey(pem);
    const sigBuf = Buffer.from(String(license.signature), 'base64');
    const ok = crypto.verify(
      null,
      canonicalLicenseMessage({
        version: license.version,
        tenantId: license.tenantId,
        hardwareHash: license.hardwareHash,
        deviceLabel: license.deviceLabel || 'POS-PC',
        issuedAt: license.issuedAt,
      }),
      keyObj,
      sigBuf,
    );
    if (!ok) {
      return { valid: false, reason: 'Invalid desktop license signature.' };
    }
  } catch {
    return { valid: false, reason: 'Unable to verify desktop license key.' };
  }

  if (license.hardwareHash !== expectedHardwareHash) {
    return {
      valid: false,
      reason:
        'This Restorch installation is bound to a different computer hardware ID.',
    };
  }

  if (expectedTenantId && license.tenantId !== expectedTenantId) {
    return {
      valid: false,
      reason: 'Desktop license belongs to a different restaurant tenant.',
    };
  }

  return { valid: true };
}

export function getLicenseFilePath(dir = process.cwd()): string {
  return path.resolve(dir, 'license.json');
}

export function readLocalDesktopLicense(
  dir = process.cwd(),
): SignedDesktopLicense | null {
  try {
    const filePath = getLicenseFilePath(dir);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as SignedDesktopLicense;
  } catch {
    return null;
  }
}

export function writeLocalDesktopLicense(
  license: SignedDesktopLicense,
  dir = process.cwd(),
): void {
  fs.writeFileSync(
    getLicenseFilePath(dir),
    JSON.stringify(license, null, 2),
    'utf8',
  );
}
