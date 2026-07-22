'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { Check, CheckCircle2, ChevronDown, ChevronUp, CircleHelp, Clock3, Library, MoreHorizontal, Plus, Search, ThumbsUp, Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchRankingData } from '@/lib/data';
import type { Game, RankingItem } from '@/lib/types';
import { formatMonth, shiftMonth } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from '@/components/app-provider';
import { Avatar } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ListSkeleton, Skeleton } from '@/components/ui/skeleton';
import { ParticipantsDialog } from '@/components/participants-dialog';
import { GameActionButton } from '@/components/game-action-button';
import { useUrlDialog } from '@/hooks/use-url-state';
import { LoadingToast } from '@/components/ui/loading-toast';
import { ClubGameAdminDialog } from '@/components/club-game-admin-dialog';

const rankingMotion = { type: 'spring', stiffness: 460, damping: 30, mass: 0.55 } as const;

function AnimatedCount({ count, label, className }: { count: number; label: string; className?: string }) {
  return (
    <span className={className} aria-live="polite" aria-atomic="true">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={count} initial={{ opacity: 0, y: 7, scale: 0.72 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -7, scale: 0.72 }} transition={rankingMotion} className="inline-block tabular-nums">{count}</motion.span>
      </AnimatePresence>
      {' '}{label}
    </span>
  );
}

function AnimatedPoints({ value }: { value: number }) {
  const motionValue = useMotionValue(value);
  const springValue = useSpring(motionValue, { stiffness: 270, damping: 24, mass: 0.5 });
  const display = useTransform(springValue, latest => latest.toFixed(1));

  useEffect(() => { motionValue.set(value); }, [motionValue, value]);

  return <motion.span className="inline-block tabular-nums" aria-label={`${value.toFixed(1)} pontos`}>{display}</motion.span>;
}

function PeopleStack({ people }: { people: RankingItem['voters'] }) {
  return (
    <span className="people-stack flex items-center -space-x-2">
      {people.slice(0, 3).map(person => <span key={person.id} className="inline-flex"><Avatar src={person.avatar_url} name={person.name} className="participant-avatar size-7 border-2 border-[#111114] text-[9px]" /></span>)}
      {people.length > 3 && <span className="participant-avatar grid size-7 place-items-center rounded-full border-2 border-[#111114] bg-zinc-800 text-[9px] font-black text-zinc-300">+{people.length - 3}</span>}
    </span>
  );
}

export default function RankingPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, isDemo, isAdmin, selectedMonth, isHistorical, runOptimistic, clubRevision } = useApp();
  const voteMonth = shiftMonth(selectedMonth, 1);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Game[]>([]);
  const [searchError, setSearchError] = useState('');
  const [rankingParent] = useAutoAnimate<HTMLDivElement>({ duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  const { data: ranking = [], isInitialLoading, isRefreshing, setData } = useStaleQuery(
    `ranking:${selectedMonth}:${isHistorical}:${user?.id}:${clubRevision}`,
    () => fetchRankingData(supabase, selectedMonth, user!.id, isDemo, isHistorical),
    Boolean(user),
  );
  const voteDialog = useUrlDialog('vote-game');

  const visibleRanking = showAll ? ranking : ranking.slice(0, 10);

  async function toggleVote(item: RankingItem) {
    if (isHistorical) return;
    const previous = ranking;
    const next = ranking.map(row => {
      if (row.game.id !== item.game.id) return row;
      const votesCount = row.votesCount + (row.votedByMe ? -1 : 1);
      const penalty = row.completedCount > 0 ? row.completedCount * 2 : 1;
      return {
        ...row,
        votedByMe: !row.votedByMe,
        votesCount,
        totalPoints: Math.round(((votesCount * 2 * row.playtimePoints * row.ratingMultiplier) / penalty) * 10) / 10,
        voters: row.votedByMe ? row.voters.filter(person => person.id !== user!.id) : [...row.voters, profile || { id: user!.id, name: 'Você', avatar_url: null }],
      };
    }).filter(row => row.votesCount > 0).sort((a, b) => b.totalPoints - a.totalPoints || a.game.title.localeCompare(b.game.title, 'pt-BR'));
    if (isDemo) {
      setData(next);
      return;
    }
    const request = item.votedByMe
      ? supabase.from('votes').delete().eq('user_id', user!.id).eq('game_id', item.game.id).eq('vote_month', voteMonth)
      : supabase.from('votes').insert({ user_id: user!.id, game_id: item.game.id, vote_month: voteMonth });
    await runOptimistic(item.votedByMe ? 'Removendo voto…' : 'Registrando voto…', () => setData(next), () => setData(previous), () => request);
  }

  async function toggleCompleted(item: RankingItem) {
    if (isHistorical) return;
    const me = profile || { id: user!.id, name: 'Você', avatar_url: null };
    const previous = ranking;
    const next = ranking.map(row => {
      if (row.game.id !== item.game.id) return row;
      const completedCount = row.completedCount + (row.completedByMe ? -1 : 1);
      const penalty = completedCount > 0 ? completedCount * 2 : 1;
      const totalPoints = Math.round(((row.votesCount * 2 * row.playtimePoints * row.ratingMultiplier) / penalty) * 10) / 10;
      return {
        ...row,
        completedByMe: !row.completedByMe,
        completedCount,
        completedBy: row.completedByMe ? row.completedBy.filter(person => person.id !== user!.id) : [...row.completedBy, me],
        totalPoints,
      };
    }).sort((a, b) => b.totalPoints - a.totalPoints || a.game.title.localeCompare(b.game.title, 'pt-BR'));
    if (isDemo) {
      setData(next);
      return;
    }
    const now = new Date().toISOString();
    const request = supabase.from('game_progress').upsert({
      user_id: user!.id,
      game_id: item.game.id,
      status: item.completedByMe ? 'started' : 'finished',
      started_at: now,
      finished_at: item.completedByMe ? null : now,
      updated_at: now,
    }, { onConflict: 'user_id,game_id' });
    await runOptimistic(item.completedByMe ? 'Removendo finalização…' : 'Marcando como finalizado…', () => setData(next), () => setData(previous), () => request);
  }

  async function searchGames(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError('');
    if (isDemo) {
      const normalized = query.toLocaleLowerCase('pt-BR');
      const { demoGames } = await import('@/lib/demo-data');
      setResults(demoGames.filter(game => game.title.toLocaleLowerCase('pt-BR').includes(normalized)));
      setSearching(false);
      return;
    }
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível buscar jogos.');
      setResults(payload);
    } catch (value) {
      setSearchError(value instanceof Error ? value.message : 'Não foi possível buscar jogos.');
    } finally {
      setSearching(false);
    }
  }

  async function addGame(game: Game) {
    const existing = ranking.find(item => item.game.id === game.id);
    if (existing) {
      if (!existing.votedByMe) await toggleVote(existing);
      return;
    }
    const ratingMultiplier = Number(game.average_rating || 50) / 100;
    const playtimePoints = game.duration_hours < 8 ? 1 : game.duration_hours <= 15 ? 3 : game.duration_hours <= 20 ? 2 : 1;
    const next = [...ranking, { game, votesCount: 1, completedCount: 0, voters: [profile || { id: user!.id, name: 'Você', avatar_url: null }], completedBy: [], playtimePoints, ratingMultiplier, totalPoints: Math.round(2 * playtimePoints * ratingMultiplier * 10) / 10, votedByMe: true, completedByMe: false, inBacklog: false }].sort((a, b) => b.totalPoints - a.totalPoints);
    if (isDemo) {
      setData(next);
      return;
    }
    await runOptimistic('Registrando voto…', () => setData(next), () => setData(ranking), () => supabase.from('votes').upsert({ user_id: user!.id, game_id: game.id, vote_month: voteMonth }, { onConflict: 'user_id,game_id,vote_month' }));
  }

  async function addToBacklog(item: RankingItem) {
    if (item.inBacklog || isHistorical) return;
    const next = ranking.map(row => row.game.id === item.game.id ? { ...row, inBacklog: true } : row);
    if (isDemo) setData(next);
    else await runOptimistic('Adicionando ao backlog…', () => setData(next), () => setData(ranking), () => supabase.from('backlogs').upsert({ user_id: user!.id, game_id: item.game.id }, { onConflict: 'user_id,game_id' }));
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <LoadingToast visible={isRefreshing} label="Atualizando ranking…" />
      <section className="mb-6 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Votação para {formatMonth(voteMonth, { includeYear: isHistorical })}</h1>
        </div>
        {!isHistorical && (
          <Dialog open={voteDialog.open} onOpenChange={open => open ? voteDialog.show() : voteDialog.close()}>
            <DialogTrigger asChild><button className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-end whitespace-nowrap rounded-xl bg-violet-600 px-4 text-xs font-extrabold transition hover:bg-violet-500 active:scale-95 sm:self-auto"><Plus className="size-4" />Votar em um jogo</button></DialogTrigger>
            <DialogContent title="Votar em um jogo" description={`Busque um jogo para a votação de ${formatMonth(voteMonth)}.`}>
              <form onSubmit={searchGames} className="flex gap-2 border-b border-white/8 p-4">
                <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome do jogo" className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-3 text-sm outline-none focus:border-violet-500" /></label>
                <button disabled={searching} className="h-11 shrink-0 whitespace-nowrap rounded-xl bg-violet-600 px-4 text-xs font-bold disabled:opacity-50">Buscar</button>
              </form>
              <div className="max-h-[60dvh] space-y-2 overflow-y-auto p-4">
                {searching ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />) : searchError ? <p className="p-8 text-center text-sm text-red-300">{searchError}</p> : results.length ? results.map(game => { const existing = ranking.find(item => item.game.id === game.id); return (
                  <div key={game.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3">
                    <img src={game.image_url} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{game.title}</div><div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500"><Clock3 className="size-3" />{game.duration_hours} h</div><div className="mt-1 text-[10px] text-zinc-600">{existing ? 'Já está no ranking' : 'Seu voto adiciona ao ranking'}</div></div>
                    <button disabled={existing?.votedByMe} onClick={() => void addGame(game)} type="button" className="shrink-0 whitespace-nowrap rounded-lg bg-violet-500/15 px-3 py-2 text-[11px] font-bold text-violet-300 hover:bg-violet-500 hover:text-white disabled:text-emerald-300">{existing?.votedByMe ? 'Votado' : 'Votar'}</button>
                  </div>
                ); }) : <p className="p-10 text-center text-sm text-zinc-500">Digite o nome de um jogo para começar.</p>}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </section>

      {isHistorical && <div className="mb-5 rounded-2xl border border-amber-500/15 bg-amber-500/7 px-4 py-3 text-xs leading-relaxed text-amber-200/80">Esta votação já encerrou e seu resultado foi preservado. Você pode consultar os dados, mas não alterá-los.</div>}
      {isInitialLoading ? <ListSkeleton count={6} /> : !ranking.length ? (
        <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center"><div><Trophy className="mx-auto size-8 text-zinc-700" /><h2 className="mt-3 text-sm font-bold text-zinc-300">A votação ainda está vazia</h2><p className="mt-1 text-xs text-zinc-500">Adicione o primeiro jogo para começar o ranking.</p></div></div>
      ) : (
        <div ref={rankingParent} className="ranking-list space-y-3 pl-2 pt-2">
          {visibleRanking.map((item, index) => (
            <article key={item.game.id} data-rank={index + 1} className={`ranking-card relative min-w-0 rounded-2xl border p-3 transition ${index === 0 ? 'border-amber-400/25 bg-gradient-to-br from-amber-400/[.07] to-white/[.025]' : 'border-white/[.07] bg-white/[.025]'}`}>
              {index < 3 ? <span aria-label={`${index + 1}º lugar`} className={`ranking-medal ranking-medal-${index + 1} absolute -left-2.5 -top-2.5 z-20 grid size-11 place-items-center rounded-full border border-white/35 shadow-[0_7px_14px_rgba(0,0,0,.35),inset_1px_1px_1px_rgba(255,255,255,.52),inset_-2px_-2px_4px_rgba(0,0,0,.2)] ${index === 0 ? 'bg-[radial-gradient(circle_at_31%_24%,rgba(255,255,255,.7),transparent_23%),linear-gradient(145deg,#fcd34d,#d97706)] text-amber-950' : index === 1 ? 'bg-[radial-gradient(circle_at_31%_24%,rgba(255,255,255,.75),transparent_23%),linear-gradient(145deg,#f4f4f5,#9ca3af)] text-zinc-800' : 'bg-[radial-gradient(circle_at_31%_24%,rgba(255,255,255,.55),transparent_23%),linear-gradient(145deg,#d97706,#78350f)] text-amber-50'}`}><Trophy className="size-5 stroke-[1.65]" /><span className="ranking-medal-number absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full border border-white/10 bg-zinc-950 text-[8px] font-black text-white">{index + 1}</span></span> : <span className="ranking-position absolute -left-1.5 -top-1.5 z-20 grid size-7 place-items-center rounded-full border-2 border-[#08080a] bg-zinc-800 text-[9px] font-black text-zinc-400">{index + 1}</span>}
              <ClubGameAdminDialog game={item.game} variant="icon" className={`absolute top-2 z-20 ${isHistorical ? 'right-2' : 'right-12'}`} />
              {!isHistorical && <DropdownMenu.Root><DropdownMenu.Trigger aria-label={`Opções de ${item.game.title}`} className="ranking-menu-trigger absolute right-2 top-2 z-20 grid size-8 place-items-center rounded-full bg-zinc-950/75 text-zinc-400 backdrop-blur hover:bg-zinc-800 hover:text-white"><MoreHorizontal className="size-4" /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="app-popup animated-popup z-[100] min-w-52 rounded-xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl outline-none"><DropdownMenu.Item disabled={item.inBacklog} onSelect={() => void addToBacklog(item)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none data-[disabled]:text-emerald-400 data-[highlighted]:bg-white/8">{item.inBacklog ? <Check className="size-3.5" /> : <Library className="size-3.5" />}{item.inBacklog ? 'Jogo já no Backlog' : 'Adicionar jogo ao Backlog'}</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>}
              <div className="ranking-card-summary flex min-w-0 gap-3">
                <Link href={`/jogos/${item.game.id}`} className="h-[112px] w-[82px] shrink-0 overflow-hidden rounded-xl bg-zinc-900 min-[380px]:h-[120px] min-[380px]:w-[88px]"><img src={item.game.image_url} alt={`Capa de ${item.game.title}`} className="size-full object-cover" /></Link>
                <div className={`flex min-w-0 flex-1 flex-col justify-center py-1 ${isAdmin ? 'pr-16' : 'pr-7'}`}>
                  <Link href={`/jogos/${item.game.id}`} className="block break-words text-sm font-extrabold leading-snug hover:text-violet-300">{item.game.title}</Link>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500"><span className="inline-flex items-center gap-1 whitespace-nowrap"><Clock3 className="size-3" />{item.game.duration_hours} h</span><AnimatedCount count={item.votesCount} label={item.votesCount === 1 ? 'voto' : 'votos'} className="inline-flex whitespace-nowrap" /></div>
                  <div className="ranking-score mt-2.5 whitespace-nowrap text-2xl font-black leading-none text-emerald-400"><AnimatedPoints value={item.totalPoints} /><span className="ml-1 text-[10px] font-bold text-zinc-500">pts</span></div>
                </div>
              </div>

              <div className="ranking-participation-grid mt-3 grid min-w-0 grid-cols-2 gap-2 border-t border-white/[0.07] pt-3">
                <ParticipantsDialog dialogId={`${item.game.id}:completed`} voters={item.voters} completed={item.completedBy} initialTab="completed"><button className="ranking-participants ranking-participants-completed flex min-h-[68px] min-w-0 flex-col items-start justify-center gap-1.5 rounded-xl bg-black/20 px-2 py-2 text-left transition hover:bg-white/5"><span className="flex min-w-0 max-w-full items-center gap-1"><span className="grid size-5 shrink-0 place-items-center rounded-md bg-emerald-500/10 text-emerald-300"><CheckCircle2 className="size-3" /></span><AnimatedCount count={item.completedCount} label={item.completedCount === 1 ? 'Finalizou' : 'Finalizaram'} className="min-w-0 truncate text-[9px] font-extrabold text-zinc-300" /></span><PeopleStack people={item.completedBy} /></button></ParticipantsDialog>
                <ParticipantsDialog dialogId={`${item.game.id}:votes`} voters={item.voters} completed={item.completedBy} initialTab="votes"><button className="ranking-participants ranking-participants-votes flex min-h-[68px] min-w-0 flex-col items-start justify-center gap-1.5 rounded-xl bg-black/20 px-2 py-2 text-left transition hover:bg-white/5"><span className="flex min-w-0 max-w-full items-center gap-1"><span className="grid size-5 shrink-0 place-items-center rounded-md bg-violet-500/10 text-violet-300"><ThumbsUp className="size-3" /></span><AnimatedCount count={item.votesCount} label={item.votesCount === 1 ? 'voto' : 'votos'} className="min-w-0 truncate text-[9px] font-extrabold text-zinc-300" /></span><PeopleStack people={item.voters} /></button></ParticipantsDialog>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <GameActionButton kind="completed" active={item.completedByMe} disabled={isHistorical} onClick={() => void toggleCompleted(item)} className="h-10" />
                <GameActionButton kind="vote" active={item.votedByMe} disabled={isHistorical} onClick={() => void toggleVote(item)} className="h-10" />
              </div>
            </article>
          ))}
          {ranking.length > 10 && <button onClick={() => setShowAll(value => !value)} className="flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/8 bg-white/[0.025] text-xs font-bold text-zinc-300 transition hover:bg-white/5">{showAll ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}{showAll ? 'Mostrar somente o top 10' : `Ver todos os ${ranking.length} jogos`}</button>}
          <div className="flex items-start gap-2 rounded-2xl bg-white/[0.025] p-3 text-[11px] leading-relaxed text-zinc-500"><CircleHelp className="mt-0.5 size-4 shrink-0" /><span>Em caso de empate, o título em ordem alfabética define a posição. O ranking é congelado quando um administrador inicia o próximo ciclo.</span></div>
        </div>
      )}
    </div>
  );
}
