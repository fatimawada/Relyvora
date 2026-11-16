# Relyvora Meta WhatsApp Cloud API Templates (`v1`)

All buyer and vendor transactional notifications run through approved Meta Cloud API templates (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`). Free-form session messages are avoided outside Meta's 24-hour customer service window; keep this set lean because every conversation is billable.

---

## 1. Template Inventory

| # | Template Name | Meta Category | Variables (`{{1}}..`) | Buttons & Payloads | When It Fires |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | `payment_link_v1` | `UTILITY` | `{{1}}` Vendor Display Name<br>`{{2}}` Item Name<br>`{{3}}` Formatted Total (`₦...`) | Quick Reply 0: `CONFIRM_ORDER:<txId>` ("Confirm this is me")<br>Quick Reply 1: `NOT_ME_ORDER:<txId>` ("Not me")<br>URL Button 2: `https://ng.relyvora.com/pay/{{1}}` | When verified vendor creates link with buyer WhatsApp number + explicit buyer consent checkbox. |
| 2 | `release_code_v1` | `AUTHENTICATION`<br>*(TTL = `-1` = 30d)* | `{{1}}` 6-digit release code | OTP `COPY_CODE` button (`Copy code`, dynamic code parameter `{{1}}`) | When deposit locks funds (`FUNDS_LOCKED`), on buyer OTP reissue, or on webhook failure single retry / admin recovery. |
| 3 | `order_dispatched_v1` | `UTILITY` | `{{1}}` Vendor Display Name<br>`{{2}}` Item Name<br>`{{3}}` Courier / Rider Info (name + phone)<br>`{{4}}` Order ID short ref | URL Button 0: `https://ng.relyvora.com/order/{{1}}` | Immediately after vendor submits mandatory proof of delivery via `POST /api/escrow/dispatch`. No files attached. |
| 4 | `delivery_reminder_v1` | `UTILITY` | `{{1}}` Item Name<br>`{{2}}` Vendor Display Name<br>`{{3}}` Delivery Deadline / Hours Left | Quick Reply 0: `DISPUTE_ORDER:<txId>` ("Report Problem")<br>URL Button 1: `https://ng.relyvora.com/order/{{1}}` | Daily cron check ~24 hours before `delivery_deadline_at` expires while status is `FUNDS_LOCKED` or `DISPATCHED` and reminder not yet sent. |
| 5 | `payout_cooling_notice_v1` | `UTILITY` | `{{1}}` Item Name<br>`{{2}}` Formatted Amount<br>`{{3}}` Cooling Hours (`2`)<br>`{{4}}` Payout Available At (timestamp) | Quick Reply 0: `PROBLEM` | Immediately when buyer's 6-digit release code enters the cooling window (`COOLING_HOLD`). Tapping `PROBLEM` freezes payout to `DISPUTED`. |
| 6 | `dispute_opened_v1` | `UTILITY` | `{{1}}` Order Item Name<br>`{{2}}` Scenario / Stage Label<br>`{{3}}` Response Window Deadline | URL Button 0: `https://ng.relyvora.com/order/{{1}}` | When either party raises a dispute or submits counter-evidence/outcome update. |
| 7 | `verification_otp_v1` | `UTILITY` | `{{1}}` 6-digit OTP<br>`{{2}}` Purpose label (e.g. `reissuing your Relyvora release code`, `opening an escrow dispute`, `confirming your Relyvora refund bank account`) | *(None)* | Buyer self-service OTP verification for code reissue, raising dispute (when link unverified), or setting refund destination bank account. |
| 8 | `vendor_phone_verify_v1` | `UTILITY` | `{{1}}` Vendor Store Name<br>`{{2}}` Email / Handle | Quick Reply 0: `CONFIRM_VENDOR_PHONE:<vendorId>` | After vendor KYC is verified with Anchor so vendor confirms WhatsApp business number before creating links. |
| 9 | `settlement_change_confirm_v1` | `UTILITY` | `{{1}}` Vendor Store Name<br>`{{2}}` Last 4 digits of new NUBAN<br>`{{3}}` Bank Code<br>`{{4}}` Hold Hours (`48`) | Quick Reply 0: `CONFIRM_SETTLEMENT_CHANGE:<vendorId>` | When verified vendor requests a settlement bank account change; triggers 48-hour payout hold upon confirmation. |

---

## 2. Meta Cloud API Command — Set `message_send_ttl_seconds = -1` on `release_code_v1`

Meta Authentication templates default to a **10-minute (`600` seconds)** delivery TTL, causing messages to drop if a Nigerian buyer's handset is offline during escrow funding. Relyvora overrides this to **`-1` (30-day maximum Meta TTL)**:

### Exact HTTP Request (Create / Update via Graph API v21.0)

```bash
curl -X POST "https://graph.facebook.com/v21.0/${WHATSAPP_WABA_ID}/message_templates" \
  -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "release_code_v1",
    "language": "en",
    "category": "AUTHENTICATION",
    "message_send_ttl_seconds": -1,
    "components": [
      {
        "type": "BODY",
        "add_security_recommendation": false
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "OTP",
            "otp_type": "COPY_CODE",
            "text": "Copy code"
          }
        ]
      }
    ]
  }'
```

- **Updating an existing template ID (`${WHATSAPP_RELEASE_TEMPLATE_ID}`):**
  ```bash
  curl -X POST "https://graph.facebook.com/v21.0/${WHATSAPP_RELEASE_TEMPLATE_ID}" \
    -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "category": "AUTHENTICATION",
      "message_send_ttl_seconds": -1,
      "components": [
        { "type": "BODY", "add_security_recommendation": false },
        { "type": "BUTTONS", "buttons": [{ "type": "OTP", "otp_type": "COPY_CODE", "text": "Copy code" }] }
      ]
    }'
  ```
- Code helper: `upsertMetaReleaseCodeTemplateTtl()` in `lib/whatsapp.ts` wraps this exact payload.

---

## 3. Exact Meta Template Copy (For Submission)

### `payment_link_v1` (`UTILITY`)
> Hello, {{1}} created a Relyvora escrow payment link for *{{2}}* (Total: *{{3}}*). Funds are held in escrow until you inspect the delivery and give the rider your 6-digit release code.
>
> Please confirm below that you requested this link to view the bank transfer details, or tap 'Not me' if you did not request this order.
- Button 0 (`QUICK_REPLY`): `Confirm this is me`
- Button 1 (`QUICK_REPLY`): `Not me`
- Button 2 (`URL`): `https://ng.relyvora.com/pay/{{1}}`

### `order_dispatched_v1` (`UTILITY`)
> Good news: {{1}} marked your order *{{2}}* (Ref: {{4}}) as dispatched with {{3}}. Inspect your package before handing over your 6-digit release code.
- Button 0 (`URL`): `https://ng.relyvora.com/order/{{1}}`

### `delivery_reminder_v1` (`UTILITY`)
> Reminder for *{{1}}* from {{2}}: your delivery inspection window ends in {{3}}. If your order has arrived intact, share your 6-digit code with the rider; if anything is wrong or missing, open your order page immediately.
- Button 0 (`QUICK_REPLY`): `Report Problem`
- Button 1 (`URL`): `https://ng.relyvora.com/order/{{1}}`

### `dispute_opened_v1` (`UTILITY`)
> Relyvora escrow update for *{{1}}*: {{2}}. Please review the timeline and submit any response or evidence on your order page before {{3}}.
- Button 0 (`URL`): `https://ng.relyvora.com/order/{{1}}`
