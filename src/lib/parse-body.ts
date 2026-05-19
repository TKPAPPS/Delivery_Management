import { NextRequest, NextResponse } from 'next/server';

export async function parseBody<T = unknown>(
  req: NextRequest
): Promise<{ data: T } | { error: NextResponse }> {
  try {
    const data = (await req.json()) as T;
    return { data };
  } catch {
    return {
      error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }
}
