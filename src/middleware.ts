import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

// The only host humans should operate on in production. The *.vercel.app alias is
// blocked wholesale by some corporate/ISP web filters, which made one user hit
// Chrome's "Dangerous site" wall while everyone on the custom domain was fine.
const CANONICAL_HOST = 'delivery.tkpapps.com';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();

  // Canonical-host redirect (production only): push page navigations off the
  // *.vercel.app alias onto the custom domain. Preview deployments
  // (VERCEL_ENV='preview') are left alone so they stay testable, and /api/* is
  // skipped so any host-pinned webhooks (e.g. LINE) keep working. Temporary (307)
  // so it is never cached permanently — the vercel.app host stays usable as a
  // fallback if the custom domain ever has DNS trouble.
  if (process.env.VERCEL_ENV === 'production' && !pathname.startsWith('/api/')) {
    const host = req.headers.get('host');
    if (host && host !== CANONICAL_HOST) {
      const url = req.nextUrl.clone();
      url.protocol = 'https:';
      url.host = CANONICAL_HOST;
      url.port = '';
      return NextResponse.redirect(url, 307);
    }
  }

  // If Supabase is not configured, redirect everything to /login so the app
  // loads with a helpful setup message instead of a 500 error.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (pathname !== '/login') return NextResponse.redirect(new URL('/login', req.url));
    return res;
  }

  // API routes authenticate themselves (getSessionUser) and must never be redirected.
  // Returning before auth here also avoids a wasted getUser() round-trip on every
  // API request — the route's own auth check is the single validation point.
  if (pathname.startsWith('/api/')) return res;

  // Skip public routes
  const publicPaths = ['/login', '/pending'];
  if (publicPaths.some((p) => pathname.startsWith(p))) return res;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
    const logisticsAllowed = ['/admin/drivers', '/admin/customers', '/admin/settings', '/admin/courier-companies', '/admin/cargo-companies'];
    if (
      logisticsAllowed.some((p) => pathname.startsWith(p)) &&
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
