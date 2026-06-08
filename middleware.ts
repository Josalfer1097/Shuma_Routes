import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/', '/login'];
const AUTH_COOKIE = 'shuma_auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_ROUTES.some(route => pathname === route);
  if (isPublic) return NextResponse.next();

  const isAuthenticated = request.cookies.get(AUTH_COOKIE)?.value === '1';

  if (!isAuthenticated) {
    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|shuma_logo.png|.*\\.png|.*\\.ico|.*\\.svg).*)',
  ],
};
