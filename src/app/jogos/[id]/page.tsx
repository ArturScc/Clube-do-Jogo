'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import { CalendarDays, CheckCircle2, Clock3, Gamepad2, ImageIcon, Info, ListChecks, NotebookPen, Play, Share2, Star, Trash2, UsersRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { demoRanking } from '@/lib/demo-data';
import { fetchGame, fetchUserPlatforms } from '@/lib/data';
import type { Profile, UserPlatform } from '@/lib/types';
import { formatFinishedCount, shiftMonth, youtubeEmbedUrl } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from '@/components/app-provider';
import { ParticipantsDialog } from '@/components/participants-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { GameGallery } from '@/components/game-gallery';
import { GameActionButton } from '@/components/game-action-button';
import { AppBackButton } from '@/components/app-back-button';
import { ProgressList } from '@/components/progress-list';
import { NotesChat } from '@/components/notes-chat';
import { ClubGameAdminDialog } from '@/components/club-game-admin-dialog';
import { FloatingTrailer } from '@/components/floating-trailer';
import { useUrlTab } from '@/hooks/use-url-state';

interface GamePeople { voters: Profile[]; completed: Profile[]; votedByMe: boolean; completedByMe: boolean; inBacklog: boolean; }

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const { user, isDemo, selectedMonth, isHistorical, runOptimistic, clubRevision } = useApp();
  const voteMonth = shiftMonth(selectedMonth, 1);
  const gameQuery = useStaleQuery(`game:${params.id}`, () => fetchGame(supabase, params.id, isDemo));
  const mediaRequested = useRef(new Set<string>());
  const peopleQuery = useStaleQuery<GamePeople>(`game-people:${params.id}:${voteMonth}:${clubRevision}`, async () => {
    if (isDemo) {
      const item = demoRanking().find(row => row.game.id === params.id) || demoRanking()[0];
      return { voters: item.voters, completed: item.completedBy, votedByMe: item.votedByMe, completedByMe: item.completedByMe, inBacklog: item.inBacklog };
    }
    const [{ data: votes, error: votesError }, { data: completed, error: completedError }, { data: backlog }] = await Promise.all([
      supabase.from('votes').select('user_id').eq('game_id', params.id).eq('vote_month', voteMonth),
      supabase.from('game_progress').select('user_id').eq('game_id', params.id).eq('status', 'finished'),
      supabase.from('backlogs').select('id').eq('game_id', params.id).eq('user_id', user!.id).maybeSingle(),
    ]);
    if (votesError) throw votesError;
    if (completedError) throw completedError;
    const ids = Array.from(new Set([...(votes || []).map(item => item.user_id), ...(completed || []).map(item => item.user_id)]));
    let profiles: Profile[] = [];
    if (ids.length) {
      const response = await supabase.from('profiles').select('id, name, avatar_url').in('id', ids);
      if (response.error) throw response.error;
      profiles = response.data as Profile[];
    }
    const map = new Map(profiles.map(profile => [profile.id, profile]));
    return {
      voters: (votes || []).map(item => map.get(item.user_id) || { id: item.user_id, name: 'Membro', avatar_url: null }),
      completed: (completed || []).map(item => map.get(item.user_id) || { id: item.user_id, name: 'Membro', avatar_url: null }),
      votedByMe: (votes || []).some(item => item.user_id === user!.id),
      completedByMe: (completed || []).some(item => item.user_id === user!.id),
      inBacklog: Boolean(backlog),
    };
  }, Boolean(user));
  const game = gameQuery.data;
  const people = peopleQuery.data || { voters: [], completed: [], votedByMe: false, completedByMe: false, inBacklog: false };
  const platformsQuery = useStaleQuery<UserPlatform[]>(`user-platforms:${user?.id}`, () => fetchUserPlatforms(supabase, user!.id, isDemo), Boolean(user));
  const ownedPlatformIds = new Set((platformsQuery.data || []).map(platform => platform.igdb_platform_id));
  const [activeSection, setActiveSection] = useUrlTab('section', ['about', 'progress', 'notes'] as const, 'about');

  useEffect(() => {
    if (isDemo || !game || ((game.screenshot_urls?.length || 0) >= 3 && game.genres?.length && game.platforms?.length && game.platform_ids?.length) || mediaRequested.current.has(game.id)) return;
    mediaRequested.current.add(game.id);
    void fetch(`/api/games/${game.id}/media`, { method: 'POST' })
      .then(response => response.ok ? response.json() : null)
      .then(updated => { if (updated) gameQuery.setData(updated); })
      .catch(() => undefined);
  }, [game, gameQuery, isDemo]);

  async function addToBacklog() {
    if (!game || people.inBacklog) return;
    const next = { ...people, inBacklog: true };
    if (isDemo) peopleQuery.setData(next);
    else await runOptimistic('Adicionando ao backlog…', () => peopleQuery.setData(next), () => peopleQuery.setData(people), () => supabase.from('backlogs').upsert({ user_id: user!.id, game_id: game.id }, { onConflict: 'user_id,game_id' }));
  }

  async function removeFromBacklog() {
    if (!game || !people.inBacklog) return;
    const next = { ...people, inBacklog: false };
    if (isDemo) peopleQuery.setData(next);
    else await runOptimistic('Removendo do backlog…', () => peopleQuery.setData(next), () => peopleQuery.setData(people), () => supabase.from('backlogs').delete().eq('user_id', user!.id).eq('game_id', game.id));
  }

  async function toggleVote() {
    if (!game || isHistorical) return;
    const mine: Profile = { id: user!.id, name: 'Você', avatar_url: null };
    const next = { ...people, votedByMe: !people.votedByMe, voters: people.votedByMe ? people.voters.filter(item => item.id !== user!.id) : [...people.voters, mine] };
    if (isDemo) {
      peopleQuery.setData(next);
      return;
    }
    const request = people.votedByMe
      ? supabase.from('votes').delete().eq('user_id', user!.id).eq('game_id', game.id).eq('vote_month', voteMonth)
      : supabase.from('votes').insert({ user_id: user!.id, game_id: game.id, vote_month: voteMonth });
    await runOptimistic(people.votedByMe ? 'Removendo voto…' : 'Registrando voto…', () => peopleQuery.setData(next), () => peopleQuery.setData(people), () => request);
  }

  async function shareGame() {
    if (!game) return;
    const shareData = { title: game.title, text: `Veja ${game.title} no Clube do Jogo`, url: window.location.href };
    if (navigator.share) {
      await navigator.share(shareData).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
  }

  if (gameQuery.isInitialLoading) return <div className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-8 w-24" /><div className="flex gap-5"><Skeleton className="aspect-[3/4] w-36 shrink-0 rounded-2xl" /><div className="flex-1 space-y-3"><Skeleton className="h-9 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-24 w-full" /></div></div></div>;
  if (!game) return <div className="grid min-h-[60dvh] place-items-center text-center"><div><Gamepad2 className="mx-auto size-9 text-zinc-700" /><h1 className="mt-3 text-lg font-black">Jogo não encontrado</h1></div></div>;
  const trailer = youtubeEmbedUrl(game.trailer_url);
  const screenshots = game.screenshot_urls || [];

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      <div className="mb-5 flex items-center justify-between gap-3">
        <AppBackButton />
        <button onClick={() => void shareGame()} className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-xl bg-white/5 px-3 text-xs font-bold text-zinc-400 transition hover:bg-white/10 hover:text-white"><Share2 className="size-3.5" />Compartilhar</button>
      </div>
      <section className="game-detail-hero relative overflow-hidden rounded-[30px] border border-white/8 bg-white/[0.025] p-4 sm:p-7">
        <div className="game-detail-backdrop pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden border-b border-white/[0.07] sm:h-full" aria-hidden="true">
          <img src={game.image_url} alt="" className="game-detail-backdrop-image absolute -inset-[10%] size-[120%] object-cover blur-sm brightness-[.64] saturate-[1.5]" />
          <div className="game-detail-shade absolute inset-0 bg-[radial-gradient(ellipse_at_50%_22%,rgba(8,8,10,.22),rgba(8,8,10,.46)_48%,rgba(8,8,10,.86)_100%),linear-gradient(90deg,rgba(8,8,10,.50),transparent_50%,rgba(8,8,10,.50))]" />
          <div className="game-detail-tint absolute inset-0 bg-violet-950/20 mix-blend-multiply" />
        </div>
        <div className="game-detail-summary relative flex min-w-0 flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
          <div className="game-detail-cover aspect-[3/4] w-40 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-zinc-900 shadow-2xl sm:w-52"><img src={game.image_url} alt={`Capa de ${game.title}`} className="size-full object-cover" /></div>
          <div className="game-detail-info min-w-0 flex-1 pt-5 sm:pt-7"><h1 className="break-words text-3xl font-black tracking-[-0.035em] sm:text-5xl">{game.title}</h1><div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px] font-bold text-zinc-400 sm:justify-start"><span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/6 px-3 py-1.5"><Clock3 className="size-3.5" />{game.duration_hours} horas</span>{game.average_rating && <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-500/10 px-3 py-1.5 text-amber-300"><Star className="size-3.5 fill-current" />{Math.round(game.average_rating)}/100</span>}{game.release_year && <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/6 px-3 py-1.5"><CalendarDays className="size-3.5" />{game.release_year}</span>}</div><p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-300">{game.description || 'Sem descrição disponível.'}</p>
            <div className="game-detail-actions mt-5 flex flex-wrap justify-center gap-2">
              {people.inBacklog ? (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild><GameActionButton kind="backlog" active className="h-10 px-4" aria-label="Opções do backlog" /></DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content align="start" sideOffset={8} collisionPadding={12} className="app-popup animated-popup z-[100] min-w-52 rounded-xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl outline-none">
                      <DropdownMenu.Item onSelect={() => void removeFromBacklog()} className="danger-action flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold text-red-300 outline-none data-[highlighted]:bg-red-500/10">
                        <Trash2 className="size-3.5" />Remover do backlog
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              ) : <GameActionButton kind="backlog" active={false} onClick={() => void addToBacklog()} className="h-10 px-4" />}
              <GameActionButton kind="vote" active={people.votedByMe} disabled={isHistorical} onClick={() => void toggleVote()} className="h-10 px-4" />
            </div>
            <ClubGameAdminDialog game={game} className="mt-3" />
          </div>
        </div>
      </section>

      <Tabs.Root value={activeSection} onValueChange={value => setActiveSection(value as typeof activeSection)} className="mt-4">
        <Tabs.List aria-label="Seções do jogo" className="app-tabs sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 mb-5 grid grid-cols-3 rounded-2xl border border-white/8 bg-[#0c0c0f]/92 p-1.5 shadow-xl backdrop-blur-xl min-[960px]:top-4">
          <Tabs.Trigger value="about" className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 py-2.5 text-[11px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300"><Info className="size-3.5" /><span className="truncate">Sobre</span></Tabs.Trigger>
          <Tabs.Trigger value="progress" className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 py-2.5 text-[11px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300"><ListChecks className="size-3.5" /><span className="truncate">Progresso</span></Tabs.Trigger>
          <Tabs.Trigger value="notes" className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 py-2.5 text-[11px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300"><NotebookPen className="size-3.5" /><span className="truncate">Anotações</span></Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="about" className="outline-none data-[state=active]:animate-tab-in">
          <ParticipantsDialog dialogId={params.id} voters={people.voters} completed={people.completed}><button className="participation-card flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-left transition hover:bg-white/5"><span className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><UsersRound className="size-4" /></span><span className="min-w-0"><strong className="block text-sm">Participação</strong><span className="block truncate text-[10px] text-zinc-500 min-[360px]:text-[11px]">{people.voters.length} votos · {formatFinishedCount(people.completed.length)}</span></span></span><span className="shrink-0 text-xs font-bold text-violet-300"><span className="min-[360px]:hidden">Ver</span><span className="hidden min-[360px]:inline">Ver pessoas</span></span></button></ParticipantsDialog>

          {(game.genres?.length || game.platforms?.length) && <section className="mt-8 space-y-5"><div className="border-t border-white/8" />{game.genres?.length ? <div><h2 className="text-sm font-extrabold">Gêneros</h2><div className="mt-2.5 flex flex-wrap gap-2">{game.genres.map(genre => <span key={genre} className="rounded-full bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-zinc-400">{genre}</span>)}</div></div> : null}{game.platforms?.length ? <div><h2 className="text-sm font-extrabold">Plataformas</h2><div className="mt-2.5 flex flex-wrap gap-2">{game.platforms.map((platform, index) => { const owned = ownedPlatformIds.has(game.platform_ids?.[index] ?? -1); return <span key={platform} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${owned ? 'border border-emerald-400/25 bg-emerald-500/[.12] text-emerald-200' : 'bg-white/[0.05] text-zinc-400'}`}>{owned && <CheckCircle2 className="size-3.5 shrink-0" />}{platform}</span>; })}</div></div> : null}</section>}

          {screenshots.length > 0 && <section className="mt-8"><div className="mb-3 flex items-center gap-2"><ImageIcon className="size-4 text-violet-400" /><h2 className="text-base font-extrabold">Imagens do jogo</h2></div><GameGallery title={game.title} images={screenshots} /></section>}
          {trailer && <section className="mt-8"><div className="mb-3 flex items-center gap-2"><Play className="size-4 fill-violet-400 text-violet-400" /><h2 className="text-base font-extrabold">Trailer</h2></div><div className="game-trailer-card overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"><FloatingTrailer src={trailer} title={`Trailer de ${game.title}`} /></div></section>}
        </Tabs.Content>
        <Tabs.Content value="progress" className="outline-none data-[state=active]:animate-tab-in"><ProgressList game={game} /></Tabs.Content>
        <Tabs.Content value="notes" className="outline-none data-[state=active]:animate-tab-in"><NotesChat game={game} /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
