'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import { CalendarClock, Crown, ListChecks, MessageCircle, NotebookPen } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchGameOfMonth } from '@/lib/data';
import { formatMonth } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from '@/components/app-provider';
import { Timeline } from '@/components/timeline';
import { ProgressList } from '@/components/progress-list';
import { NotesChat } from '@/components/notes-chat';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlTab } from '@/hooks/use-url-state';

export default function GameOfMonthPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedMonth, isHistorical, isDemo, clubRevision, cycles } = useApp();
  const { data: game, isInitialLoading } = useStaleQuery(`game-of-month:${selectedMonth}:${clubRevision}`, () => isDemo ? Promise.resolve(cycles.find(item => item.month === selectedMonth)?.game || null) : fetchGameOfMonth(supabase, selectedMonth, false));
  const [activeTab, setActiveTab] = useUrlTab('section', ['timeline', 'progress', 'notes'] as const, 'timeline');

  if (isInitialLoading) return <div className="mx-auto max-w-3xl space-y-5"><Skeleton className="mx-auto aspect-[3/4] w-44 rounded-3xl" /><Skeleton className="mx-auto h-9 w-64" /><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full rounded-3xl" /></div>;

  if (!game) return (
    <div className="mx-auto grid min-h-[65dvh] max-w-xl place-items-center text-center"><div><CalendarClock className="mx-auto size-10 text-zinc-700" /><h1 className="mt-4 text-xl font-black">Jogo ainda não definido</h1><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">Um administrador ainda não definiu o jogo de {formatMonth(selectedMonth)}.</p></div></div>
  );

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <section className="game-month-hero relative mb-7 overflow-hidden rounded-[32px] border border-white/[0.08] bg-zinc-950 px-5 pb-6 pt-7 text-center shadow-[0_20px_70px_rgba(0,0,0,.28)] sm:px-8">
        <div className="game-month-backdrop pointer-events-none absolute -inset-[10%] scale-110" aria-hidden="true"><img src={game.image_url} alt="" className="size-full object-cover opacity-100 blur-sm brightness-[.64] saturate-[1.5]" /></div>
        <div className="game-month-shade pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_22%,rgba(8,8,10,.22),rgba(8,8,10,.46)_48%,rgba(8,8,10,.86)_100%),linear-gradient(90deg,rgba(8,8,10,.50),transparent_50%,rgba(8,8,10,.50))]" aria-hidden="true" />
        <div className="game-month-tint pointer-events-none absolute inset-0 bg-violet-950/20 mix-blend-multiply" aria-hidden="true" />
        <div className="relative">
          <div className="game-month-chip relative isolate mb-4 inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-amber-300/35 bg-[linear-gradient(145deg,rgba(255,221,108,.28),rgba(120,53,15,.28))] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.17em] text-amber-200 shadow-[0_5px_14px_rgba(0,0,0,.3),inset_1px_1px_1px_rgba(255,255,255,.3),inset_-1px_-2px_2px_rgba(0,0,0,.3)] before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-white/45"><Crown className="relative size-3.5 fill-amber-300/35 stroke-amber-100" />Jogo de {formatMonth(selectedMonth, { includeYear: false })}</div>
          <Link href={`/jogos/${game.id}`} className="group mx-auto block w-fit"><div className="game-month-cover mx-auto aspect-[3/4] w-40 overflow-hidden rounded-2xl border border-white/15 bg-zinc-900 shadow-2xl shadow-black/70 transition duration-300 group-hover:-translate-y-1 sm:w-48"><img src={game.image_url} alt={`Capa de ${game.title}`} className="size-full object-cover" /></div><h1 className="game-month-title mx-auto mt-5 max-w-xl text-3xl font-black tracking-[-0.03em] text-white [text-shadow:0_2px_18px_rgba(0,0,0,.9)] sm:text-5xl">{game.title}</h1></Link>
          <p className="game-month-description mx-auto mt-2 max-w-lg text-xs leading-relaxed text-white/75 [text-shadow:0_1px_10px_rgba(0,0,0,.9)] sm:text-sm">{game.description}</p>
        </div>
      </section>

      <Tabs.Root value={activeTab} onValueChange={value => setActiveTab(value as typeof activeTab)}>
        <Tabs.List aria-label="Seções do jogo do mês" className="app-tabs sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 mb-5 grid grid-cols-3 rounded-2xl border border-white/8 bg-[#0c0c0f]/92 p-1.5 shadow-xl backdrop-blur-xl">
          <Tabs.Trigger value="timeline" className="flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-1 py-2.5 text-[11px] font-extrabold text-zinc-500 outline-none transition data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300"><MessageCircle className="size-3.5" /><span className="truncate">Timeline</span></Tabs.Trigger>
          <Tabs.Trigger value="progress" className="flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-1 py-2.5 text-[11px] font-extrabold text-zinc-500 outline-none transition data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300"><ListChecks className="size-3.5" /><span className="truncate">Progresso</span></Tabs.Trigger>
          <Tabs.Trigger value="notes" className="flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-1 py-2.5 text-[11px] font-extrabold text-zinc-500 outline-none transition data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300"><NotebookPen className="size-3.5" /><span className="truncate">Anotações</span></Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="timeline" className="outline-none data-[state=active]:animate-tab-in"><Timeline game={game} /></Tabs.Content>
        <Tabs.Content value="progress" className="outline-none data-[state=active]:animate-tab-in"><ProgressList game={game} snapshotMonth={isHistorical ? selectedMonth : undefined} /></Tabs.Content>
        <Tabs.Content value="notes" className="outline-none data-[state=active]:animate-tab-in"><NotesChat game={game} snapshotMonth={isHistorical ? selectedMonth : undefined} /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
