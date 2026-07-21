import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServerSiteUrl } from '@/lib/site-url';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Se "next" for informado, redireciona para lá após o login
  const requestedNext = searchParams.get('next') ?? '/jogo-do-mes';
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/jogo-do-mes';
  const siteUrl = getServerSiteUrl(origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${siteUrl}${next}`);
    }
  }

  // Redireciona para uma página de erro caso falhe
  return NextResponse.redirect(`${siteUrl}/auth/auth-code-error`);
}
