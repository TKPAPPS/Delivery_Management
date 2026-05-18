import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();

  // Skip public routes and API auth callback
  const publicPaths = ['/login', '/pending', '/api/auth'];
  if (publicPaths.some((p) => pathname.startsWith(p))) return res;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  // Check active profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('active, role')
    .eq('id', user.id)
    .single();

  if (!profile?.active) return NextResponse.redirect(new URL('/pending', req.url));

  // Admin route guard
  if (pathname.startsWith('/admin')) {
    if (
      pathname.startsWith('/admin/drivers') &&
      (profile.role === 'logistics' || profile.role === 'admin')
    ) {
      return res;
    }
    if (profile.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
