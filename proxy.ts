import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Public paths that do NOT require authentication.
const PUBLIC_PATHS = ['/login', '/register', '/auth']

// Paths that authenticated users should be bounced away from.
const AUTH_ONLY_PATHS = ['/login', '/register']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Start with a pass-through response so cookies are forwarded correctly.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // Called when Supabase silently refreshes the access token.
        // We must update both the request and the response cookies so the
        // refreshed token is forwarded to both the server and the browser.
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: always use getUser() (network call) rather than getSession()
  // (local cache). getUser() validates the JWT with Supabase, which prevents
  // spoofed cookies from bypassing the proxy.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  const isAuthenticated = !!user && !error
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  // ── Unauthenticated → protected route ─────────────────────────────────────
  if (!isAuthenticated && !isPublicPath) {
    const loginUrl = new URL('/login', request.url)
    // Preserve the intended destination so we can redirect back after login
    // (future enhancement — kept as a hook point here).
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── Authenticated → auth-only page ────────────────────────────────────────
  if (isAuthenticated && AUTH_ONLY_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Run the proxy on every path EXCEPT:
     *  - _next/static      Next.js static chunk assets
     *  - _next/image       Next.js image optimisation endpoint
     *  - favicon.ico       Browser default favicon request
     *  - manifest.json / manifest.webmanifest  PWA manifest (public)
     *  - robots.txt        Crawler instructions (public)
     *  - sitemap.xml       SEO sitemap (public)
     *  - Common static extensions (images, fonts, styles, scripts)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.(?:json|webmanifest)|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|css|js)$).*)',
  ],
}
