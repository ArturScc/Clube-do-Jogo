'use client';

import { useState } from 'react';
import { Gamepad2, Mail, LockKeyhole } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getBrowserSiteUrl } from '@/lib/site-url';
import { Skeleton } from './ui/skeleton';

export function AuthScreen({ loading = false }: { loading?: boolean }) {
  const supabase = createClient();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#08080a] p-5">
        <div className="w-full max-w-sm space-y-5">
          <Skeleton className="mx-auto size-16 rounded-2xl" />
          <Skeleton className="mx-auto h-8 w-48" />
          <Skeleton className="h-80 w-full rounded-3xl" />
        </div>
      </main>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      } else {
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: email.split('@')[0] },
            emailRedirectTo: `${getBrowserSiteUrl()}/auth/callback`,
          },
        });
        if (authError) throw authError;
        setMessage('Cadastro feito! Abra o link que enviamos para o seu e-mail.');
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Não foi possível autenticar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#08080a] px-5 py-[max(2rem,env(safe-area-inset-top))] text-white">
      <div className="pointer-events-none absolute -left-24 top-0 size-72 rounded-full bg-violet-700/15 blur-[100px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-72 rounded-full bg-fuchsia-700/10 blur-[100px]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-[20px] bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-xl shadow-violet-950/60">
            <Gamepad2 className="size-8" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">Clube do Jogo</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-zinc-400">Um jogo por mês. Muitas histórias para compartilhar.</p>
        </div>
        <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 shadow-2xl backdrop-blur-xl">
          <h2 className="text-xl font-extrabold">{mode === 'login' ? 'Boas-vindas de volta' : 'Entre para o clube'}</h2>
          <p className="mt-1 text-sm text-zinc-500">{mode === 'login' ? 'Continue de onde você parou.' : 'Crie sua conta para votar e participar.'}</p>
          {(error || message) && <div role="status" className={`mt-4 rounded-xl border px-3 py-2.5 text-xs ${error ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>{error || message}</div>}
          <form onSubmit={submit} className="mt-5 space-y-3">
            <label className="relative block">
              <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
              <input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="Seu e-mail" className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-4 text-sm outline-none transition placeholder:text-zinc-600 focus:border-violet-500" />
            </label>
            <label className="relative block">
              <LockKeyhole className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
              <input type="password" required minLength={6} value={password} onChange={event => setPassword(event.target.value)} placeholder="Sua senha" className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-4 text-sm outline-none transition placeholder:text-zinc-600 focus:border-violet-500" />
            </label>
            <button disabled={submitting} className="h-12 w-full whitespace-nowrap rounded-xl bg-violet-600 px-4 text-sm font-extrabold transition hover:bg-violet-500 active:scale-[.98] disabled:opacity-50">
              {submitting ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage(''); }} className="mt-4 w-full whitespace-nowrap py-2 text-xs font-bold text-violet-400 hover:text-violet-300">
            {mode === 'login' ? 'Ainda não tenho conta' : 'Já tenho uma conta'}
          </button>
        </div>
      </div>
    </main>
  );
}
