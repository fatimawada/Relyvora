# Relyvora Meta WhatsApp Cloud API Templates (`v1`)

All buyer and vendor transactional notifications run through approved Meta Cloud API templates (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`). Free-form session messages are avoided outside Meta's 24-hour customer service window; keep this set lean because every conversation is billable.

All **UTILITY** templates exclude the words `code`, `verify`, `confirm`, and `OTP` (and avoid mentioning one-time release codes) so Meta does not recategorize utility notifications as Authentication or Marketing. Only the two `AUTHENTICATION` templates carry one-time 6-digit verification codes (`COPY_CODE` button). All Quick Reply payloads (`CONFIRM_ORDER:<txId>`, `NOT_ME_ORDER:<txId>`, `PROBLEM_ORDER:<txId>`, `DISPUTE_ORDER:<txId>`, `CONFIRM_VENDOR_PHONE:<vendorId>`, `CONFIRM_SETTLEMENT_CHANGE:<vendorId>`) are **set strictly server-side in code**, and `/api/webhooks/whatsapp` acts strictly on `button.payload` / `interactive.button_reply.id`, never on button label text.

---

## 1. Template Inventory

| # | Template Name | Meta Category | Body / Button Components | Exact Variable Order & Runtime Sender Mapping | When It Fires |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | `payment_link_v1` | `UTILITY` | **Body** + **Footer** (`Secured by Relyvora Escrow`)<br>Quick Reply `0`: `"Continue"` (`CONFIRM_ORDER:<txId>`)<br>Quick Reply `1`: `"Not my order"` (`NOT_ME_ORDER:<txId>`)<br>URL `2`: `"Open payment page"` (`https://ng.relyvora.com/pay/{{1}}`) | Body `{{1}}`: Vendor display name<br>Body `{{2}}`: Item name<br>Body `{{3}}`: Number-only total (no `₦`)<br>URL `2` `{{1}}`: Transaction UUID | When verified vendor creates link with buyer WhatsApp number + explicit buyer consent checkbox (`sendPaymentLinkWhatsappTemplate`). |
| 2 | `release_code_v1` | `AUTHENTICATION`<br>*(TTL = `-1` = 30d)* | Meta Auth Body (`add_security_recommendation: false`, no expiry footer)<br>Button `0` (`OTP`/`COPY_CODE`): `"Copy code"` | Body `{{1}}`: 6-digit release code<br>Button `0` (`sub_type: url`): Same 6-digit release code | When deposit locks funds (`FUNDS_LOCKED`), on buyer OTP reissue, or on webhook failure 1x auto-retry (`sendReleaseCodeWhatsappTemplate`). |
| 3 | `verification_otp_v1` | `AUTHENTICATION`<br>*(Default 10m TTL)* | Meta Auth Body (`add_security_recommendation: false`, no expiry footer)<br>Button `0` (`OTP`/`COPY_CODE`): `"Copy code"` | Body `{{1}}`: 6-digit OTP<br>Button `0` (`sub_type: url`): Same 6-digit OTP | Buyer step-up OTP verification for code reissue, opening dispute, buyer session sign-in, or setting refund bank (`sendOtpWhatsappTemplate`). |
| 4 | `order_dispatched_v1` | `UTILITY` | **Body**<br>URL `0`: `"Track Order"` (`https://ng.relyvora.com/order/{{1}}`) | Body `{{1}}`: Vendor display name<br>Body `{{2}}`: Item name<br>Body `{{3}}`: Order/waybill reference<br>Body `{{4}}`: Courier name/phone<br>URL `0` `{{1}}`: Transaction UUID | Immediately after vendor submits mandatory proof of dispatch via `POST /api/escrow/dispatch` (`sendOrderDispatchedWhatsapp`). |
| 5 | `delivery_reminder_v1` | `UTILITY` | **Body**<br>Quick Reply `0`: `"Report Problem"` (`DISPUTE_ORDER:<txId>`)<br>URL `1`: `"View Order"` (`https://ng.relyvora.com/order/{{1}}`) | Body `{{1}}`: Item name<br>Body `{{2}}`: Vendor display name<br>Body `{{3}}`: Time remaining / deadline<br>URL `1` `{{1}}`: Transaction UUID | Daily cron ~24h before `delivery_deadline_at` expires while `FUNDS_LOCKED`/`DISPATCHED` (`sendDeliveryReminderWhatsapp`). |
| 6 | `payout_cooling_notice_v1` | `UTILITY` | **Body**<br>Quick Reply `0`: `"Problem"` (`PROBLEM_ORDER:<txId>`) | Body `{{1}}`: Item name<br>Body `{{2}}`: Formatted total (`₦...`)<br>Body `{{3}}`: Cooling hold hours<br>Body `{{4}}`: Payout available timestamp | Immediately when buyer release code enters `COOLING_HOLD` (`sendCoolingWindowWhatsappNotice`). |
| 7 | `dispute_opened_v1` | `UTILITY` | **Body**<br>URL `0`: `"Open Dispute View"` (`https://ng.relyvora.com/order/{{1}}`) | Body `{{1}}`: Item name<br>Body `{{2}}`: Dispute summary<br>Body `{{3}}`: SLA response deadline<br>URL `0` `{{1}}`: Transaction UUID | When either party opens a dispute or submits counter-evidence (`sendDisputeOpenedOrUpdatedWhatsapp`). |
| 8 | `vendor_phone_verify_v1` | `UTILITY` | **Body**<br>Quick Reply `0`: `"Yes, this is my number"` (`CONFIRM_VENDOR_PHONE:<vendorId>`) | Body `{{1}}`: Vendor store name<br>Body `{{2}}`: Vendor email / hint | After Anchor KYC verification completes so vendor links WhatsApp number (`sendVendorPhoneVerifyWhatsapp`). |
| 9 | `settlement_change_confirm_v1` | `UTILITY` | **Body**<br>Quick Reply `0`: `"Approve bank change"` (`CONFIRM_SETTLEMENT_CHANGE:<vendorId>`) | Body `{{1}}`: Vendor store name<br>Body `{{2}}`: Last 4 digits (no asterisks)<br>Body `{{3}}`: Resolved Bank Name<br>Body `{{4}}`: Hold hours (`48`) | When verified vendor initiates settlement bank change; starts 48h payout hold once approved (`sendSettlementChangeConfirmWhatsapp`). |

---

## 2. Meta Cloud API Requests — Authentication Templates (`release_code_v1` & `verification_otp_v1`)

Both Authentication templates use Meta's `COPY_CODE` button with `add_security_recommendation: false` and no expiration footer line. `release_code_v1` sets `message_send_ttl_seconds = -1` (30-day Meta maximum TTL so codes are not dropped when Nigerian phones are offline); `verification_otp_v1` omits `message_send_ttl_seconds` so Meta applies its default 10-minute OTP TTL (`600` seconds).

### 2a. `release_code_v1` (`AUTHENTICATION`, `message_send_ttl_seconds = -1`)

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

### 2b. `verification_otp_v1` (`AUTHENTICATION`, default 10-minute TTL)

```bash
curl -X POST "https://graph.facebook.com/v21.0/${WHATSAPP_WABA_ID}/message_templates" \
  -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "verification_otp_v1",
    "language": "en",
    "category": "AUTHENTICATION",
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
- Code helpers: `buildMetaReleaseCodeTemplatePayload()`, `buildMetaVerificationOtpTemplatePayload()`, `upsertMetaAuthTemplate()`, and `upsertMetaAuthenticationTemplates()` in `lib/whatsapp.ts` (CLI runner: `scripts/upsert-meta-auth-templates.ts`).

---

## 3. Exact Meta Submission Text, Variable Order & Sample Values (All 9 Templates)

### 1. `payment_link_v1` (`UTILITY`) — Live on Meta
- **Body:**
  > Hello. {{1}} has created a payment link on Relyvora for {{2}} (₦{{3}}). Your payment is securely held until your order is delivered. Tap Continue to open your payment page.
- **Footer:** `Secured by Relyvora Escrow`
- **Buttons:**
  - `0` (`QUICK_REPLY`): `Continue` *(code-only payload: `CONFIRM_ORDER:<txId>`)*
  - `1` (`QUICK_REPLY`): `Not my order` *(code-only payload: `NOT_ME_ORDER:<txId>`)*
  - `2` (`URL`): `Open payment page` — `https://ng.relyvora.com/pay/{{1}}`
- **Variables & Sample Values:**
  1. Body `{{1}}` (Vendor Display Name): `Kemi Luxury Hairs`
  2. Body `{{2}}` (Item Name): `24-inch Raw Vietnamese Bone Straight Wig`
  3. Body `{{3}}` (Total Amount number only, no `₦`): `45,000`
  4. Button `2` URL `{{1}}` (Transaction UUID): `8f3d6b2e-7b5e-4e92-8a4a-3b1d7e2a0011`

### 2. `release_code_v1` (`AUTHENTICATION`, `message_send_ttl_seconds = -1`)
- **Body** *(`add_security_recommendation: false`, no expiry footer)*:
  > {{1}} is your verification code.
- **Buttons:**
  - `0` (`OTP` / `COPY_CODE`): `Copy code`
- **Variables & Sample Values:**
  1. Body `{{1}}` (6-digit Release Code): `482910`
  2. Button `0` `COPY_CODE` (`text`): `482910`

### 3. `verification_otp_v1` (`AUTHENTICATION`, default 10-minute TTL)
- **Body** *(`add_security_recommendation: false`, no expiry footer)*:
  > {{1}} is your verification code.
- **Buttons:**
  - `0` (`OTP` / `COPY_CODE`): `Copy code`
- **Variables & Sample Values:**
  1. Body `{{1}}` (6-digit OTP): `739204`
  2. Button `0` `COPY_CODE` (`text`): `739204`

### 4. `order_dispatched_v1` (`UTILITY`) — Live Variable Order
- **Body:**
  > Good news: {{1}} marked your order {{2}} (Ref: {{3}}) as dispatched with {{4}}. Please inspect your package carefully on arrival before finalizing order handover on Relyvora.
- **Buttons:**
  - `0` (`URL`): `Track Order` — `https://ng.relyvora.com/order/{{1}}`
- **Variables & Sample Values:**
  1. Body `{{1}}` (Vendor Display Name): `Kemi Luxury Hairs`
  2. Body `{{2}}` (Item Name): `24-inch Raw Vietnamese Bone Straight Wig`
  3. Body `{{3}}` (Tracking / Waybill Reference): `WAYBILL-991`
  4. Body `{{4}}` (Courier / Rider Label): `GIG Logistics (+2348011112222)`
  5. Button `0` URL `{{1}}` (Transaction UUID): `8f3d6b2e-7b5e-4e92-8a4a-3b1d7e2a0011`

### 5. `delivery_reminder_v1` (`UTILITY`)
- **Body:**
  > Reminder for {{1}} from {{2}}: your delivery inspection window ends in {{3}}. If your order arrived intact, complete handover with the rider; if anything is wrong or missing, open your order page immediately.
- **Buttons:**
  - `0` (`QUICK_REPLY`): `Report Problem` *(code-only payload: `DISPUTE_ORDER:<txId>`)*
  - `1` (`URL`): `View Order` — `https://ng.relyvora.com/order/{{1}}`
- **Variables & Sample Values:**
  1. Body `{{1}}` (Item Name): `24-inch Raw Vietnamese Bone Straight Wig`
  2. Body `{{2}}` (Vendor Display Name): `Kemi Luxury Hairs`
  3. Body `{{3}}` (Remaining Inspection Window): `24 hours`
  4. Button `1` URL `{{1}}` (Transaction UUID): `8f3d6b2e-7b5e-4e92-8a4a-3b1d7e2a0011`

### 6. `payout_cooling_notice_v1` (`UTILITY`)
- **Body:**
  > Handover update for {{1}} ({{2}}): Order completion was submitted. For your protection, payout is held for {{3}} hours until {{4}}. Tap Problem below immediately if anything is wrong with your item.
- **Buttons:**
  - `0` (`QUICK_REPLY`): `Problem` *(code-only payload: `PROBLEM_ORDER:<txId>`)*
- **Variables & Sample Values:**
  1. Body `{{1}}` (Item Name): `iPhone 15 Pro Max`
  2. Body `{{2}}` (Formatted Total with `₦`): `₦850,000`
  3. Body `{{3}}` (Cooling Hold Hours): `2`
  4. Body `{{4}}` (Payout Available At Timestamp): `2026-11-18T16:30:00Z`

### 7. `dispute_opened_v1` (`UTILITY`)
- **Body:**
  > Relyvora escrow update for {{1}}: {{2}}. Please review the timeline and submit any response or evidence on your order page before {{3}}.
- **Buttons:**
  - `0` (`URL`): `Open Dispute View` — `https://ng.relyvora.com/order/{{1}}`
- **Variables & Sample Values:**
  1. Body `{{1}}` (Item Name): `24-inch Raw Vietnamese Bone Straight Wig`
  2. Body `{{2}}` (Dispute Update Summary): `Buyer opened Quality Mismatch case`
  3. Body `{{3}}` (SLA Response Deadline): `2026-11-18T18:00:00Z`
  4. Button `0` URL `{{1}}` (Transaction UUID): `8f3d6b2e-7b5e-4e92-8a4a-3b1d7e2a0011`

### 8. `vendor_phone_verify_v1` (`UTILITY`)
- **Body:**
  > Hello {{1}}, please tap below to link this WhatsApp number to your Relyvora merchant account ({{2}}).
- **Buttons:**
  - `0` (`QUICK_REPLY`): `Yes, this is my number` *(code-only payload: `CONFIRM_VENDOR_PHONE:<vendorId>`)*
- **Variables & Sample Values:**
  1. Body `{{1}}` (Vendor Store Name): `Kemi Luxury Hairs`
  2. Body `{{2}}` (Vendor Email / Account Context): `kemi@kemiluxury.ng`

### 9. `settlement_change_confirm_v1` (`UTILITY`)
- **Body:**
  > Account update notice for {{1}}: A request was submitted to update your Relyvora payout bank account to the account ending in {{2}} at {{3}}. Tap Approve bank change below if you requested this; payouts will pause for {{4}} hours once approved.
- **Buttons:**
  - `0` (`QUICK_REPLY`): `Approve bank change` *(code-only payload: `CONFIRM_SETTLEMENT_CHANGE:<vendorId>`)*
- **Variables & Sample Values:**
  1. Body `{{1}}` (Vendor Store Name): `Kemi Luxury Hairs`
  2. Body `{{2}}` (Last 4 Digits of NUBAN, no asterisks): `6789`
  3. Body `{{3}}` (Resolved Bank Name, no asterisks): `Guaranty Trust Bank (GTBank)`
  4. Body `{{4}}` (Mandatory Hold Hours): `48`
