'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Clock3, Flag, Gamepad2, ImageIcon, Library, Share2, Star, ThumbsUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { demoRanking } from '@/lib/demo-data';
import { fetchGame } from '@/lib/data';
import type { Profile } from '@/lib/types';
import { shiftMonth, youtubeEmbedUrl } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from '@/components/app-provider';
import { ParticipantsDialog } from '@/components/participants-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar } from '@/components/ui/avatar';
import { GameGallery } from '@/components/game-gallery';
import { GameActionButton } from '@/components/game-action-button';

interface GamePeople {
  voters: Profile[];
  completed: Profile[];
  votedByMe: boolean;
  completedByMe: boolean;
  inBacklog: boolean;
}

function PeoplePreview({ people, empty, color }: { people: Profile[]; empty: string; color: 'violet' | 'pink' }) {
  const visible = people.slice(0, 4);
  const more = people.length - visible.length;
  return (
    <div className="space-y-2.5">
      {visible.map(person => <div key={person.id} className="flex items-center gap-3"><Avatar src={person.avatar_url} name={person.name} className="size-10" /><span className="truncate text-base text-zinc-400">{person.name || 'Membro'}</span></div>)}
      {more > 0 && <span className={`block text-sm font-bold ${color === 'violet' ? 'text-violet-300' : 'text-pink-300'}`}>+{more} pessoas</span>}
      {!people.length && <span className="text-sm text-zinc-600">{empty}</span>}
    </div>
  );
}

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
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    return {
      voters: (votes || []).map(item => profileMap.get(item.user_id) || { id: item.user_id, name: 'Membro', avatar_url: null }),
      completed: (completed || []).map(item => profileMap.get(item.user_id) || { id: item.user_id, name: 'Membro', avatar_url: null }),
      votedByMe: (votes || []).some(item => item.user_id === user!.id),
      completedByMe: (completed || []).some(item => item.user_id === user!.id),
      inBacklog: Boolean(backlog),
    };
  }, Boolean(user));
  const game = gameQuery.data;
  const people = peopleQuery.data || { voters: [], completed: [], votedByMe: false, completedByMe: false, inBacklog: false };

  useEffect(() => {
    if (isDemo || !game?.igdb_id || ((game.screenshot_urls?.length || 0) >= 3 && game.genres?.length && game.platforms?.length) || mediaRequested.current.has(game.id)) return;
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
    const votingNow = !people.votedByMe;
    peopleQuery.setData({ ...people, votedByMe: votingNow, inBacklog: votingNow || people.inBacklog, voters: votingNow ? [...people.voters, mine] : people.voters.filter(item => item.id !== user!.id) });
    if (!isDemo) {
      if (!votingNow) await supabase.from('votes').delete().eq('user_id', user!.id).eq('game_id', game.id).eq('vote_month', voteMonth);
      else await Promise.all([
        supabase.from('votes').insert({ user_id: user!.id, game_id: game.id, vote_month: voteMonth }),
        supabase.from('backlogs').upsert({ user_id: user!.id, game_id: game.id }, { onConflict: 'user_id,game_id' }),
      ]);
    }
  }

  async function toggleCompleted() {
    if (!game || isHistorical) return;
    const mine: Profile = { id: user!.id, name: 'Você', avatar_url: null };
    const completedNow = !people.completedByMe;
    peopleQuery.setData({ ...people, completedByMe: completedNow, completed: completedNow ? [...people.completed, mine] : people.completed.filter(item => item.id !== user!.id) });
    if (!isDemo) {
      const request = completedNow
        ? supabase.from('completed_games').insert({ user_id: user!.id, game_id: game.id })
        : supabase.from('completed_games').delete().eq('user_id', user!.id).eq('game_id', game.id);
      await request;
    }
  }

  async function shareGame() {
    if (!game) return;
    const shareData = { title: game.title, text: `Veja ${game.title} no Clube do Jogo`, url: window.location.href };
    if (navigator.share) await navigator.share(shareData).catch(() => undefined);
    else await navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
  }

  if (gameQuery.isInitialLoading) return <div className="mx-auto max-w-3xl space-y-5"><Skeleton className="-mx-4 aspect-video rounded-none sm:mx-0 sm:rounded-2xl" /><Skeleton className="h-10 w-4/5" /><Skeleton className="h-24 w-full" /></div>;
  if (!game) return <div className="grid min-h-[60dvh] place-items-center text-center"><div><Gamepad2 className="mx-auto size-9 text-zinc-700" /><h1 className="mt-3 text-lg font-black">Jogo não encontrado</h1></div></div>;

  const trailer = youtubeEmbedUrl(game.trailer_url);
  const screenshots = game.screenshot_urls || [];
  const playtimePoints = game.duration_hours < 8 ? 1 : game.duration_hours <= 15 ? 3 : game.duration_hours <= 20 ? 2 : 1;
  const ratingMultiplier = Number(game.average_rating ?? 50) / 100;
  const completionPenalty = people.completed.length ? people.completed.length * 2 : 1;
  const totalPoints = Math.round(((people.voters.length * 2 * playtimePoints * ratingMultiplier) / completionPenalty) * 10) / 10;
  const starCount = game.average_rating === null || game.average_rating === undefined ? null : Math.round(game.average_rating / 20);

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <div className="relative -mx-4 -mt-5 aspect-video overflow-hidden bg-black sm:mx-0 sm:-mt-2 sm:rounded-2xl sm:border sm:border-white/10">
        {trailer ? <iframe src={trailer} title={`Trailer de ${game.title}`} className="size-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : <img src={game.image_url} alt={`Capa de ${game.title}`} className="size-full object-cover" />}
        <button onClick={() => router.back()} aria-label="Voltar" title="Voltar" className="absolute left-3 top-3 grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/80"><ArrowLeft className="size-5" /></button>
      </div>

      <section className="pt-6 sm:pt-8">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <h1 className="break-words text-4xl font-black leading-[.98] tracking-[-0.035em] sm:text-5xl">{game.title}</h1>
          <div className="flex shrink-0 gap-1.5">
            <button onClick={() => void addToBacklog()} aria-label={people.inBacklog ? 'Jogo no backlog' : 'Adicionar ao backlog'} title={people.inBacklog ? 'No backlog' : 'Adicionar ao backlog'} className={`grid size-10 place-items-center rounded-xl border transition ${people.inBacklog ? 'border-sky-400/30 bg-sky-500/[.12] text-sky-200' : 'border-white/10 bg-white/[.04] text-zinc-300 hover:bg-white/[.08] hover:text-white'}`}><Library className="size-4" /></button>
            <button onClick={() => void shareGame()} aria-label="Compartilhar jogo" title="Compartilhar jogo" className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[.04] text-zinc-300 transition hover:bg-white/[.08] hover:text-white"><Share2 className="size-4" /></button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold text-zinc-400">
          <span className="inline-flex items-center gap-2 rounded-lg bg-white/[.07] px-3 py-2"><Clock3 className="size-4 text-zinc-500" />{game.duration_hours}h</span>
          <span className="inline-flex items-center gap-2 rounded-lg bg-white/[.07] px-3 py-2">{starCount === null ? <span className="text-xs text-zinc-500">Sem nota</span> : <span className="flex text-amber-300">{Array.from({ length: 5 }, (_, index) => <Star key={index} className={`size-4 ${index < starCount ? 'fill-current' : 'text-zinc-600'}`} />)}</span>}</span>
          {game.release_year && <span className="inline-flex items-center gap-2 rounded-lg bg-white/[.07] px-3 py-2"><CalendarDays className="size-4 text-zinc-500" />{game.release_year}</span>}
        </div>
        <p className="mt-4 max-w-2xl text-[15px] leading-6 text-zinc-400 sm:text-base sm:leading-7">{game.description || 'Sem descrição disponível.'}</p>
      </section>

      <section className="mt-11">
        <h2 className="text-2xl font-black tracking-[-0.02em]">Pontuação</h2>
        <div className="mt-3 text-5xl font-black tracking-[-0.045em] text-emerald-400">{totalPoints.toFixed(1)}<span className="ml-2 text-2xl font-bold tracking-normal text-zinc-500">pts</span></div>
        <div className="mt-7 space-y-8">
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-2xl font-black text-violet-400"><ThumbsUp className="size-6 fill-current" />Votos</h3><GameActionButton kind="vote" active={people.votedByMe} disabled={isHistorical} onClick={() => void toggleVote()} className="h-10 px-4 text-sm" /></div>
            <ParticipantsDialog voters={people.voters} completed={people.completed}><button className="block w-full text-left" aria-label="Ver pessoas que votaram"><PeoplePreview people={people.voters} empty="Ainda ninguém votou." color="violet" /></button></ParticipantsDialog>
          </div>
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-2xl font-black text-pink-500"><Flag className="size-6 fill-current" />Zerei</h3><GameActionButton kind="completed" active={people.completedByMe} disabled={isHistorical} onClick={() => void toggleCompleted()} className="h-10 px-4 text-sm" /></div>
            <ParticipantsDialog voters={people.voters} completed={people.completed} initialTab="completed"><button className="block w-full text-left" aria-label="Ver pessoas que zeraram"><PeoplePreview people={people.completed} empty="Ainda ninguém marcou como zerado." color="pink" /></button></ParticipantsDialog>
          </div>
        </div>
      </section>

      {(game.genres?.length || game.platforms?.length) && <section className="mt-12 space-y-7">
        {game.genres?.length ? <div><h2 className="text-2xl font-black tracking-[-0.02em]">Gênero</h2><div className="mt-3 flex flex-wrap gap-2">{game.genres.map(genre => <span key={genre} className="rounded-lg bg-white/[.09] px-3 py-2 text-sm font-semibold text-zinc-400">{genre}</span>)}</div></div> : null}
        {game.platforms?.length ? <div><h2 className="text-2xl font-black tracking-[-0.02em]">Plataformas</h2><div className="mt-3 flex flex-wrap gap-2">{game.platforms.map(platform => <span key={platform} className="rounded-lg bg-white/[.09] px-3 py-2 text-sm font-semibold text-zinc-400">{platform}</span>)}</div></div> : null}
      </section>}

      {screenshots.length > 0 && <section className="mt-12"><div className="mb-4 flex items-center gap-2"><ImageIcon className="size-5 text-zinc-400" /><h2 className="text-2xl font-black tracking-[-0.02em]">Galeria</h2></div><GameGallery title={game.title} images={screenshots} /></section>}
    </div>
  );
}
