/**
 * Meta Graph API Authentication Template Publisher (`release_code_v1` & `verification_otp_v1`)
 *
 * Run ONLY after confirming `WHATSAPP_WABA_ID` and `WHATSAPP_ACCESS_TOKEN` are set.
 * Prints full HTTP status, redacted response body, and Meta error code / error_subcode.
 */

import fs from 'fs';
import path from 'path';
import { upsertMetaAuthenticationTemplates } from '../lib/whatsapp';

function loadEnvLocalIfPresent() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

async function main() {
  loadEnvLocalIfPresent();

  const wabaId = (process.env.WHATSAPP_WABA_ID || '').trim();
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  if (!wabaId || !accessToken) {
    console.error(
      'Missing WHATSAPP_WABA_ID or WHATSAPP_ACCESS_TOKEN. Set both environment variables before running.'
    );
    process.exit(1);
  }

  const results = await upsertMetaAuthenticationTemplates({ wabaId, accessToken });
  let hasError = false;

  for (const r of results) {
    if (!r.ok) hasError = true;
    console.log(`\n=== Template: ${r.templateName} ===`);
    console.log('HTTP Status:', r.httpStatus ?? 'N/A');
    console.log('Meta Error Code:', r.metaErrorCode ?? 'none');
    console.log('Meta Error Subcode:', r.metaErrorSubcode ?? 'none');
    console.log('Payload:', JSON.stringify(r.payload, null, 2));
    console.log('Response Body (tokens redacted):', JSON.stringify(r.responseBody, null, 2));
    if (r.error) console.log('Error Summary:', r.error);
  }

  process.exit(hasError ? 1 : 0);
}

main().catch((err) => {
  console.error('Unhandled template publisher failure:', err?.message || err);
  process.exit(1);
});
