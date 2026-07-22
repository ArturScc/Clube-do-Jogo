'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gamepad2, ShieldCheck, Trophy, UserRound } from 'lucide-react';
import { useApp } from './app-provider';
import { AuthScreen } from './auth-screen';
import { MonthSelector } from './month-selector';
import { Avatar } from './ui/avatar';
import { cn } from '@/lib/utils';

const navigation = [
  { href: '/jogo-do-mes', label: 'Jogo do mês', icon: Gamepad2 },
  { href: '/ranking', label: 'Ranking', icon: Trophy },
  { href: '/perfil', label: 'Perfil', icon: UserRound },
];

function isNavigationActive(pathname: string, href: string) {
  return href === '/perfil'
    ? pathname === '/perfil'
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, profile, authLoading, isAdmin } = useApp();
  const [navVisible, setNavVisible] = useState(true);
  const lastScroll = useRef(0);
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      window.history.replaceState({ ...window.history.state, __clubeHasAppBack: true }, '', window.location.href);
      previousPath.current = pathname;
    }
  }, [pathname]);

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
  const desktopNavigation = isAdmin ? [...navigation, { href: '/admin', label: 'Administração', icon: ShieldCheck }] : navigation;

  return (
    <div className="theme-shell relative isolate min-h-dvh text-zinc-100">
      <div className="theme-pattern pointer-events-none fixed inset-0 z-0" aria-hidden="true" />
      <div className="theme-ambient pointer-events-none fixed inset-x-0 top-0 z-0 h-80 min-[960px]:bottom-0 min-[960px]:left-56 min-[960px]:h-auto" aria-hidden="true" />

      <aside className="theme-nav theme-sidebar fixed inset-y-0 left-0 z-50 hidden w-56 flex-col border-r border-white/[0.08] min-[960px]:flex">
        <Link href="/jogo-do-mes" className="flex h-20 items-center gap-3 border-b border-white/[0.08] px-5" scroll={false}>
          <span className="theme-logo grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-950/50"><Gamepad2 className="size-5" /></span>
          <span className="min-w-0"><strong className="block truncate text-sm font-black tracking-tight">Clube do Jogo</strong><span className="mt-0.5 block text-[10px] font-semibold text-zinc-500">Jogando juntos</span></span>
        </Link>

        <div className="border-b border-white/[0.08] px-4 py-4">
          <div className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.16em] text-zinc-600">Ciclo do clube</div>
          <MonthSelector />
        </div>

        <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-1.5 p-3">
          {desktopNavigation.map(item => {
            const active = isNavigationActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} scroll={false} aria-current={active ? 'page' : undefined} className={cn('group flex h-12 min-w-0 items-center gap-3 rounded-xl px-3 text-xs font-bold text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200', active && 'bg-violet-500/15 text-violet-300')}>
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg transition group-active:scale-90', active && 'bg-violet-500/15')}><Icon className={cn('size-[18px]', active && 'fill-violet-400/15')} /></span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.08] p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <Link href="/perfil" aria-label="Abrir perfil" scroll={false} className="flex min-w-0 items-center gap-3 rounded-xl p-2 transition hover:bg-white/5">
            <Avatar src={profile?.avatar_url} name={profile?.name} className="size-10 shrink-0" />
            <span className="min-w-0"><strong className="block truncate text-xs text-zinc-200">{profile?.name || 'Meu perfil'}</strong><span className="mt-0.5 block text-[10px] text-zinc-600">{isAdmin ? 'Administrador' : 'Ver perfil'}</span></span>
          </Link>
        </div>
      </aside>

      <header className="theme-header sticky top-0 z-50 border-b border-white/[0.06] pt-[env(safe-area-inset-top)] backdrop-blur-xl min-[960px]:hidden">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/jogo-do-mes" className="flex min-w-0 items-center gap-2.5" scroll={false}>
            <span className="theme-logo grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-950/50"><Gamepad2 className="size-5" /></span>
            <span className="hidden truncate text-sm font-black tracking-tight min-[360px]:block">Clube do Jogo</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {!detailRoute && <MonthSelector />}
            <Link href="/perfil" aria-label="Abrir perfil" scroll={false}><Avatar src={profile?.avatar_url} name={profile?.name} className="size-9" /></Link>
          </div>
        </div>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-5xl overflow-x-clip px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-7 min-[960px]:ml-56 min-[960px]:w-[calc(100%-14rem)] min-[960px]:max-w-none min-[960px]:px-4 min-[960px]:pb-12 min-[960px]:pt-8">{children}</main>
      <nav aria-label="Navegação principal" className={cn('theme-nav fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-2xl border-t border-white/[0.08] pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-2xl transition-transform duration-150 ease-[cubic-bezier(.22,1,.36,1)] min-[960px]:hidden', navVisible ? 'translate-y-0' : 'translate-y-[calc(100%+env(safe-area-inset-bottom))]')}>
        <div className="grid grid-cols-3">
          {navigation.map(item => {
            const active = isNavigationActive(pathname, item.href);
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
