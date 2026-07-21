'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gamepad2, Library, Trophy, UserRound } from 'lucide-react';
import { useApp } from './app-provider';
import { AuthScreen } from './auth-screen';
import { MonthSelector } from './month-selector';
import { Avatar } from './ui/avatar';
import { cn } from '@/lib/utils';

const navigation = [
  { href: '/jogo-do-mes', label: 'Jogo do mês', icon: Gamepad2 },
  { href: '/ranking', label: 'Ranking', icon: Trophy },
  { href: '/seus-jogos', label: 'Seus jogos', icon: Library },
  { href: '/perfil', label: 'Perfil', icon: UserRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, profile, authLoading } = useApp();
  const [navVisible, setNavVisible] = useState(true);
  const lastScroll = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const current = Math.max(window.scrollY, 0);
      const delta = current - lastScroll.current;
      if (current <= 12) setNavVisible(true);
      else if (delta > 7) setNavVisible(false);
      else if (delta < -7) setNavVisible(true);
      lastScroll.current = current;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (authLoading || !user) return <AuthScreen loading={authLoading} />;

  const detailRoute = pathname.startsWith('/jogos/') || pathname.startsWith('/perfil/');

  return (
    <div className="min-h-dvh bg-[#08080a] text-zinc-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_30%_0%,rgba(124,58,237,.12),transparent_62%)]" />
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#08080a]/86 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/jogo-do-mes" className="flex min-w-0 items-center gap-2.5" scroll={false}>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-950/50"><Gamepad2 className="size-5" /></span>
            <span className="hidden truncate text-sm font-black tracking-tight min-[360px]:block">Clube do Jogo</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {!detailRoute && <MonthSelector />}
            <Link href="/perfil" aria-label="Abrir perfil" scroll={false}><Avatar src={profile?.avatar_url} name={profile?.name} className="size-9" /></Link>
          </div>
        </div>
      </header>
      <main className="relative mx-auto w-full max-w-5xl overflow-x-clip px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-7">{children}</main>
      <nav aria-label="Navegação principal" className={cn('fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-2xl border-t border-white/[0.08] bg-[#0b0b0e]/94 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-12px_40px_rgba(0,0,0,.4)] backdrop-blur-2xl transition-transform duration-150 ease-[cubic-bezier(.22,1,.36,1)]', navVisible ? 'translate-y-0' : 'translate-y-[calc(100%+env(safe-area-inset-bottom))]')}>
        <div className="grid grid-cols-4">
          {navigation.map(item => {
            const active = item.href === '/perfil'
              ? pathname === '/perfil'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} scroll={false} aria-current={active ? 'page' : undefined} className={cn('group flex min-w-0 flex-col items-center gap-1 px-1 py-1.5 text-[10px] font-semibold text-zinc-500 transition', active && 'text-violet-400')}>
                <span className={cn('grid h-7 w-12 place-items-center rounded-full transition group-active:scale-90', active && 'bg-violet-500/15')}><Icon className={cn('size-5', active && 'fill-violet-400/15')} /></span>
                <span className="max-w-full truncate whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
