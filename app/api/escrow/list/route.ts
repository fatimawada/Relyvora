import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { resolveVendorSessionForWrite } from '@/lib/orderAuth';
import { sendSystemAlert } from '@/lib/alerts';
import { applyWhatsappVerificationRedaction } from '@/lib/whatsapp';

const LIST_COLUMNS = `
  id,
  created_at,
  updated_at,
  vendor_id,
  item_name,
  item_price,
  delivery_fee,
  protection_fee,
  total_amount,
  amount_paid,
  vendor_handle,
  status,
  paid_at,
  dispatched_at,
  released_at,
  disputed_at,
  dispute_reason,
  virtual_account_number,
  virtual_bank_name,
  virtual_account_name,
  code_locked,
  failed_code_attempts,
  delivery_type,
  delivery_window_days,
  dispatch_deadline_at,
  delivery_deadline_at,
  expires_at,
  buyer_whatsapp_consent,
  buyer_phone_verified,
  buyer_phone_verified_at,
  whatsapp_delivery_status,
  whatsapp_blocked
`;

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const requestedHandle = searchParams.get('vendorHandle');

    // Admin AAL2 Supabase session may inspect across vendors or filter by handle
    const adminCheck = await verifyAdminSession(request);
    if (adminCheck.authorized) {
      let adminQuery = supabase
        .from('transactions')
        .select(LIST_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(100);

      if (requestedHandle && requestedHandle.trim()) {
        adminQuery = adminQuery.ilike('vendor_handle', requestedHandle.trim());
      }

      const { data, error } = await adminQuery;
      if (error) {
        await sendSystemAlert({
          type: 'SYSTEM_FAILURE',
          severity: 'CRITICAL',
          title: 'Admin Escrow List Query Failed (Fail Closed)',
          details: { error: error.message },
        }).catch(() => {});
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        transactions: (data || []).map((row) => applyWhatsappVerificationRedaction(row)),
      });
    }
    if (adminCheck.code === 'MFA_AAL2_REQUIRED' || adminCheck.code === 'MFA_NOT_ENROLLED') {
      return NextResponse.json(
        { success: false, code: adminCheck.code, error: adminCheck.error || 'Admin MFA (AAL2) required.' },
        { status: adminCheck.statusCode || 403 }
      );
    }

    // Standard callers must authenticate as an active Supabase vendor; filter strictly to their vendor_id
    const vendorSession = await resolveVendorSessionForWrite(request, supabase);
    if (!vendorSession.authorized || !vendorSession.vendor) {
      return NextResponse.json(
        {
          success: false,
          code: vendorSession.code || 'UNAUTHORIZED',
          error: vendorSession.error || 'Vendor authentication required.',
        },
        { status: vendorSession.statusCode || 401 }
      );
    }

    const { data, error } = await supabase
      .from('transactions')
      .select(LIST_COLUMNS)
      .eq('vendor_id', vendorSession.vendor.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Vendor Escrow List Query Failed (Fail Closed)',
        details: { vendorId: vendorSession.vendor.id, error: error.message },
      }).catch(() => {});
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const safeTransactions = (data || []).map((row) =>
      applyWhatsappVerificationRedaction(row)
    );

    return NextResponse.json({
      success: true,
      transactions: safeTransactions,
      vendorStoreName: vendorSession.vendor.store_name || null,
    });
  } catch (err: any) {
    console.error('Unhandled error in get-transactions list:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
