'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Clock3, Gamepad2, ImageIcon, Play, Star, UsersRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { demoRanking } from '@/lib/demo-data';
import { fetchGame } from '@/lib/data';
import type { Profile } from '@/lib/types';
import { formatFinishedCount, shiftMonth, youtubeEmbedUrl } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from '@/components/app-provider';
import { ParticipantsDialog } from '@/components/participants-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { GameGallery } from '@/components/game-gallery';
import { GameActionButton } from '@/components/game-action-button';

interface GamePeople { voters: Profile[]; completed: Profile[]; votedByMe: boolean; completedByMe: boolean; inBacklog: boolean; }

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { user, isDemo, selectedMonth, isHistorical } = useApp();
  const voteMonth = shiftMonth(selectedMonth, 1);
  const gameQuery = useStaleQuery(`game:${params.id}`, () => fetchGame(supabase, params.id, isDemo));
  const mediaRequested = useRef(new Set<string>());
  const peopleQuery = useStaleQuery<GamePeople>(`game-people:${params.id}:${voteMonth}`, async () => {
    if (isDemo) {
      const item = demoRanking().find(row => row.game.id === params.id) || demoRanking()[0];
      return { voters: item.voters, completed: item.completedBy, votedByMe: item.votedByMe, completedByMe: item.completedByMe, inBacklog: item.inBacklog };
    }
    const [{ data: votes, error: votesError }, { data: completed, error: completedError }, { data: backlog }] = await Promise.all([
      supabase.from('votes').select('user_id').eq('game_id', params.id).eq('vote_month', voteMonth),
      supabase.from('completed_games').select('user_id').eq('game_id', params.id),
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

  useEffect(() => {
    if (isDemo || !game?.igdb_id || (game.screenshot_urls?.length || 0) >= 3 || mediaRequested.current.has(game.id)) return;
    mediaRequested.current.add(game.id);
    void fetch(`/api/games/${game.id}/media`, { method: 'POST' })
      .then(response => response.ok ? response.json() : null)
      .then(updated => { if (updated) gameQuery.setData(updated); })
      .catch(() => undefined);
  }, [game, gameQuery, isDemo]);

  async function addToBacklog() {
    if (!game || people.inBacklog) return;
    peopleQuery.setData({ ...people, inBacklog: true });
    if (!isDemo) await supabase.from('backlogs').upsert({ user_id: user!.id, game_id: game.id }, { onConflict: 'user_id,game_id' });
  }

  async function toggleVote() {
    if (!game || isHistorical) return;
    const mine: Profile = { id: user!.id, name: 'Você', avatar_url: null };
    peopleQuery.setData({ ...people, votedByMe: !people.votedByMe, voters: people.votedByMe ? people.voters.filter(item => item.id !== user!.id) : [...people.voters, mine] });
    if (!isDemo) {
      if (people.votedByMe) await supabase.from('votes').delete().eq('user_id', user!.id).eq('game_id', game.id).eq('vote_month', voteMonth);
      else await supabase.from('votes').insert({ user_id: user!.id, game_id: game.id, vote_month: voteMonth });
    }
  }

  async function toggleCompleted() {
    if (!game || isHistorical) return;
    const mine: Profile = { id: user!.id, name: 'Você', avatar_url: null };
    peopleQuery.setData({
      ...people,
      completedByMe: !people.completedByMe,
      completed: people.completedByMe ? people.completed.filter(item => item.id !== user!.id) : [...people.completed, mine],
    });
    if (!isDemo) {
      const request = people.completedByMe
        ? supabase.from('completed_games').delete().eq('user_id', user!.id).eq('game_id', game.id)
        : supabase.from('completed_games').insert({ user_id: user!.id, game_id: game.id });
      await request;
    }
  }

  if (gameQuery.isInitialLoading) return <div className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-8 w-24" /><div className="flex gap-5"><Skeleton className="aspect-[3/4] w-36 shrink-0 rounded-2xl" /><div className="flex-1 space-y-3"><Skeleton className="h-9 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-24 w-full" /></div></div></div>;
  if (!game) return <div className="grid min-h-[60dvh] place-items-center text-center"><div><Gamepad2 className="mx-auto size-9 text-zinc-700" /><h1 className="mt-3 text-lg font-black">Jogo não encontrado</h1></div></div>;
  const trailer = youtubeEmbedUrl(game.trailer_url);
  const screenshots = game.screenshot_urls || [];

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      <button onClick={() => router.back()} className="mb-5 inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-xl bg-white/5 px-3 text-xs font-bold text-zinc-400 hover:bg-white/10 hover:text-white"><ArrowLeft className="size-4" />Voltar</button>
      <section className="relative overflow-hidden rounded-[30px] border border-white/8 bg-white/[0.025] p-4 sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden border-b border-white/[0.07] sm:h-full" aria-hidden="true">
          <img src={game.image_url} alt="" className="absolute -inset-[10%] size-[120%] object-cover blur-sm brightness-[.64] saturate-[1.5]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_22%,rgba(8,8,10,.22),rgba(8,8,10,.46)_48%,rgba(8,8,10,.86)_100%),linear-gradient(90deg,rgba(8,8,10,.50),transparent_50%,rgba(8,8,10,.50))]" />
          <div className="absolute inset-0 bg-violet-950/20 mix-blend-multiply" />
        </div>
        <div className="relative flex min-w-0 flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
          <div className="aspect-[3/4] w-40 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-zinc-900 shadow-2xl sm:w-52"><img src={game.image_url} alt={`Capa de ${game.title}`} className="size-full object-cover" /></div>
          <div className="min-w-0 flex-1 pt-5 sm:pt-7"><h1 className="break-words text-3xl font-black tracking-[-0.035em] sm:text-5xl">{game.title}</h1><div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px] font-bold text-zinc-400 sm:justify-start"><span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/6 px-3 py-1.5"><Clock3 className="size-3.5" />{game.duration_hours} horas</span>{game.average_rating && <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-500/10 px-3 py-1.5 text-amber-300"><Star className="size-3.5 fill-current" />{Math.round(game.average_rating)}/100</span>}{game.release_year && <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/6 px-3 py-1.5"><CalendarDays className="size-3.5" />{game.release_year}</span>}</div><p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-300">{game.description || 'Sem descrição disponível.'}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2"><GameActionButton kind="backlog" active={people.inBacklog} onClick={() => void addToBacklog()} className="h-10 px-4" /><GameActionButton kind="completed" active={people.completedByMe} disabled={isHistorical} onClick={() => void toggleCompleted()} className="h-10 px-4" /><GameActionButton kind="vote" active={people.votedByMe} disabled={isHistorical} onClick={() => void toggleVote()} className="h-10 px-4" /></div>
          </div>
        </div>
      </section>

      <ParticipantsDialog voters={people.voters} completed={people.completed}><button className="mt-4 flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-left transition hover:bg-white/5"><span className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><UsersRound className="size-4" /></span><span className="min-w-0"><strong className="block text-sm">Participação</strong><span className="block truncate text-[11px] text-zinc-500">{people.voters.length} votos · {formatFinishedCount(people.completed.length)}</span></span></span><span className="shrink-0 text-xs font-bold text-violet-300">Ver pessoas</span></button></ParticipantsDialog>

      {screenshots.length > 0 && <section className="mt-8"><div className="mb-3 flex items-center gap-2"><ImageIcon className="size-4 text-violet-400" /><h2 className="text-base font-extrabold">Imagens do jogo</h2></div><GameGallery title={game.title} images={screenshots} /></section>}
      {trailer && <section className="mt-8"><div className="mb-3 flex items-center gap-2"><Play className="size-4 fill-violet-400 text-violet-400" /><h2 className="text-base font-extrabold">Trailer</h2></div><div className="aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"><iframe src={trailer} title={`Trailer de ${game.title}`} className="size-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div></section>}
    </div>
  );
}
