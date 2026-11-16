import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { checkSharedRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  EvidenceCategory,
  EvidenceUploaderRole,
  uploadOrderEvidenceFile,
} from '@/lib/evidenceStorage';
import { mergeTransactionWithLifecycleOverlay, updateTransactionWithFallback } from '@/lib/orderLifecycle';

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const rl = await checkSharedRateLimit(`${clientIp}:evidence_upload`, 25, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many file uploads. Please wait before uploading again.' },
        { status: 429 }
      );
    }

    const contentType = request.headers.get('content-type') || '';
    let transactionId = '';
    let uploadedByRole: EvidenceUploaderRole = 'BUYER';
    let evidenceCategory: EvidenceCategory = 'DISPUTE_EVIDENCE';
    let scenarioId: number | null = null;
    let description: string | null = null;
    let fileBuffer: Buffer | null = null;
    let mimeType = '';
    let originalFilename = 'evidence';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      transactionId = String(formData.get('transactionId') || '').trim();
      uploadedByRole = String(formData.get('uploadedByRole') || 'BUYER').toUpperCase() as EvidenceUploaderRole;
      evidenceCategory = String(formData.get('evidenceCategory') || 'DISPUTE_EVIDENCE').toUpperCase() as EvidenceCategory;
      const rawScenario = formData.get('scenarioId');
      scenarioId = rawScenario ? Number(rawScenario) : null;
      description = formData.get('description') ? String(formData.get('description')) : null;
      const file = formData.get('file') as File | null;
      if (file) {
        mimeType = file.type;
        originalFilename = file.name || 'evidence';
        fileBuffer = Buffer.from(await file.arrayBuffer());
      }
    } else {
      const body = await request.json();
      transactionId = String(body?.transactionId || '').trim();
      uploadedByRole = String(body?.uploadedByRole || 'BUYER').toUpperCase() as EvidenceUploaderRole;
      evidenceCategory = String(body?.evidenceCategory || 'DISPUTE_EVIDENCE').toUpperCase() as EvidenceCategory;
      scenarioId = body?.scenarioId ? Number(body.scenarioId) : null;
      description = body?.description ? String(body.description) : null;
      mimeType = String(body?.mimeType || '');
      originalFilename = String(body?.filename || body?.originalFilename || 'evidence');
      if (typeof body?.fileBase64 === 'string' && body.fileBase64.length > 0) {
        const cleanB64 = body.fileBase64.replace(/^data:[^;]+;base64,/, '');
        fileBuffer = Buffer.from(cleanB64, 'base64');
      }
    }

    if (!transactionId || !fileBuffer || fileBuffer.byteLength === 0) {
      return NextResponse.json(
        { success: false, error: 'transactionId and non-empty file are required.' },
        { status: 400 }
      );
    }

    if (!['BUYER', 'VENDOR', 'ADMIN'].includes(uploadedByRole)) {
      return NextResponse.json({ success: false, error: 'Invalid uploadedByRole.' }, { status: 400 });
    }
    if (!['DISPUTE_EVIDENCE', 'DISPATCH_PROOF', 'DELIVERY_HANDOVER_PROOF'].includes(evidenceCategory)) {
      return NextResponse.json({ success: false, error: 'Invalid evidenceCategory.' }, { status: 400 });
    }

    if (uploadedByRole === 'ADMIN') {
      const auth = await verifyAdminSession(request);
      if (!auth.authorized) {
        return NextResponse.json({ success: false, error: auth.error }, { status: auth.statusCode });
      }
    }

    const supabase = getServiceSupabase();
    const { data: rawTx, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txErr || !rawTx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }
    const tx = mergeTransactionWithLifecycleOverlay(rawTx);

    const res = await uploadOrderEvidenceFile({
      transactionId,
      uploadedByRole,
      evidenceCategory,
      scenarioId,
      fileBuffer,
      mimeType,
      originalFilename,
      description,
      supabaseClient: supabase,
    });

    if (!res.success || !res.record) {
      return NextResponse.json({ success: false, error: res.error || 'Upload rejected.' }, { status: 400 });
    }

    if (evidenceCategory === 'DISPATCH_PROOF') {
      await updateTransactionWithFallback(
        transactionId,
        { dispatch_proof_count: Number(tx.dispatch_proof_count || 0) + 1 },
        supabase
      );
    } else if (evidenceCategory === 'DELIVERY_HANDOVER_PROOF') {
      await updateTransactionWithFallback(
        transactionId,
        { handover_proof_count: Number(tx.handover_proof_count || 0) + 1 },
        supabase
      );
    }

    return NextResponse.json(
      {
        success: true,
        file: {
          id: res.record.id,
          transaction_id: res.record.transaction_id,
          uploaded_by_role: res.record.uploaded_by_role,
          evidence_category: res.record.evidence_category,
          mime_type: res.record.mime_type,
          file_size_bytes: res.record.file_size_bytes,
          original_filename: res.record.original_filename,
          created_at: res.record.created_at,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to upload evidence file.' },
      { status: 500 }
    );
  }
}
