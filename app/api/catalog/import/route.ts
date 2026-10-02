import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const rowSchema = z.object({ name: z.coerce.string().min(1), internal_sku: z.coerce.string().optional(), description: z.coerce.string().optional(), unit: z.coerce.string().default('each'), category: z.coerce.string().optional(), manufacturer: z.coerce.string().optional(), brand: z.coerce.string().optional() });

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file'); const companyId = form.get('companyId');
  if (!(file instanceof File) || typeof companyId !== 'string') return NextResponse.json({ error: 'file and companyId are required' }, { status: 400 });
  if (!/\.(csv|xlsx)$/i.test(file.name)) return NextResponse.json({ error: 'Only CSV or XLSX files are accepted' }, { status: 415 });
  const workbook = XLSX.read(await file.arrayBuffer());
  const raw = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
  const rows = raw.map((value, index) => ({ index: index + 2, result: rowSchema.safeParse(value) }));
  const invalid = rows.flatMap(({ index, result }) => result.success ? [] : [{ row: index, errors: result.error.flatten().fieldErrors }]);
  if (invalid.length) return NextResponse.json({ error: 'Invalid catalog rows', rows: invalid }, { status: 422 });
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const items = rows.flatMap(({ result }) => result.success
    ? [{ ...result.data, company_id: companyId, internal_sku: result.data.internal_sku || null }]
    : []);
  const { data, error } = await supabase.from('supplyr_catalog_items').upsert(items, { onConflict: 'company_id,internal_sku' }).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 });
  return NextResponse.json({ imported: data.length });
}
