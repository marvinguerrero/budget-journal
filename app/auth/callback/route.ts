import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // OAuth providers send errors as query params
  if (error) {
    const message = errorDescription ?? error
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`
    )
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`
      )
    }
  }

  // Successful OAuth flow — redirect to dashboard.
  // The session cookie is now set; the proxy will validate it on the next request.
  return NextResponse.redirect(`${origin}/dashboard`)
}
