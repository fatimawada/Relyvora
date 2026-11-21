/**
 * Structured Redacted Application Logger & Error-Tracking Hook
 *
 * Strictly strips release codes, OTPs, secrets, hashes, BVN/NIN, and masks phone/account numbers.
 */

export type LogLevel = 'info' | 'warn' | 'error';

const SECRET_KEY_RE =
  /secret|token|password|pepper|salt|hash|cipher|auth_?tag|release_?code|otp|bvn|signature|api_?key|authorization|cookie/i;
const NIN_KEY_RE = /(?:^|_)nin(?:$|_)|(?<=[a-z])Nin(?:[A-Z]|$)|\bNIN\b/;
const PHONE_KEY_RE = /phone|whatsapp|msisdn|mobile/i;
const ACCOUNT_KEY_RE = /account|nuban|iban/i;

function isSecretKey(key: string): boolean {
  return SECRET_KEY_RE.test(key) || NIN_KEY_RE.test(key);
}

function maskTail(val: string, prefix: string): string {
  const clean = val.trim();
  if (clean.length <= 4) return prefix;
  return `${prefix}${clean.slice(-4)}`;
}

export function redactLogValue(key: string, value: unknown, depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;

  if (isSecretKey(key)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    if (PHONE_KEY_RE.test(key)) {
      return maskTail(value, '***-***-');
    }
    if (ACCOUNT_KEY_RE.test(key) && /\d{6,}/.test(value)) {
      return maskTail(value, '******');
    }
    // Redact inline E.164 Nigerian phone strings inside unstructured messages
    return value.replace(/\+?234\d{6}(\d{4})/g, '***-***-$1');
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => redactLogValue(key, item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactLogValue(k, v, depth + 1);
    }
    return out;
  }

  return value;
}

export function redactLogContext(context?: Record<string, unknown>): Record<string, unknown> {
  if (!context) return {};
  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(context)) {
    sanitized[key] = redactLogValue(key, val, 0);
  }
  return sanitized;
}

function emitStructuredLog(level: LogLevel, event: string, context?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    service: 'relyvora-app',
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    ...redactLogContext(context),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(event: string, context?: Record<string, unknown>) {
  emitStructuredLog('info', event, context);
}

export function logWarn(event: string, context?: Record<string, unknown>) {
  emitStructuredLog('warn', event, context);
}

export function logError(event: string, context?: Record<string, unknown>) {
  emitStructuredLog('error', event, context);
}

export async function captureException(
  event: string,
  err: unknown,
  context?: Record<string, unknown>
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err || 'Unknown error');
  const name = err instanceof Error ? err.name : 'Error';
  emitStructuredLog('error', event, {
    ...context,
    errorName: name,
    errorMessage: redactLogValue('message', message),
  });

  const hookUrl = process.env.ERROR_TRACKING_WEBHOOK_URL?.trim();
  if (!hookUrl) return;

  try {
    await fetch(hookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ts: new Date().toISOString(),
        event,
        errorName: name,
        errorMessage: redactLogValue('message', message),
        context: redactLogContext(context),
      }),
    }).catch(() => {});
  } catch {
    // Never throw from observability hook
  }
}
