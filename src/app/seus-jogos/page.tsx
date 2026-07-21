'use client';

import { useMemo, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Clock3, Library, Plus, Search, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchProfileWithGames } from '@/lib/data';
import type { Game } from '@/lib/types';
import { formatMonth, shiftMonth } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from '@/components/app-provider';
import { GameListCard } from '@/components/game-list-card';
import { GameDialogPreview } from '@/components/game-dialog-preview';
import { ListSkeleton, Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { GameActionButton } from '@/components/game-action-button';

const animation = { duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' };

export default function YourGamesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, isDemo, selectedMonth, isHistorical } = useApp();
  const voteMonth = shiftMonth(selectedMonth, 1);
  const query = useStaleQuery(`your-games:${user?.id}:${voteMonth}`, () => fetchProfileWithGames(supabase, user!.id, isDemo, voteMonth), Boolean(user));
  const data = query.data;
  const [backlogParent] = useAutoAnimate<HTMLDivElement>(animation);
  const [completedParent] = useAutoAnimate<HTMLDivElement>(animation);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Game[]>([]);
  const [searchError, setSearchError] = useState('');

  async function removeBacklog(game: Game) {
    if (!data) return;
    query.setData({ ...data, backlog: data.backlog.filter(item => item.id !== game.id) });
    if (!isDemo) await supabase.from('backlogs').delete().eq('user_id', user!.id).eq('game_id', game.id);
  }

  async function addToBacklog(game: Game) {
    if (!data || data.backlog.some(item => item.id === game.id)) return;
    query.setData({ ...data, backlog: [game, ...data.backlog] });
    if (!isDemo) await supabase.from('backlogs').upsert({ user_id: user!.id, game_id: game.id }, { onConflict: 'user_id,game_id' });
  }

  async function markFinished(game: Game, finished: boolean) {
    if (!data) return;
    query.setData({ ...data, completed: finished ? [...data.completed, game] : data.completed.filter(item => item.id !== game.id) });
    if (!isDemo) {
      if (finished) await supabase.from('completed_games').upsert({ user_id: user!.id, game_id: game.id }, { onConflict: 'user_id,game_id' });
      else await supabase.from('completed_games').delete().eq('user_id', user!.id).eq('game_id', game.id);
    }
  }

  async function toggleVote(game: Game) {
    if (!data || isHistorical) return;
    const voted = data.votedGameIds.includes(game.id);
    const votedGameIds = voted ? data.votedGameIds.filter(id => id !== game.id) : [...data.votedGameIds, game.id];
    query.setData({ ...data, votedGameIds, rankingGameIds: voted ? data.rankingGameIds : Array.from(new Set([...data.rankingGameIds, game.id])) });
    if (!isDemo) {
      const request = voted
        ? supabase.from('votes').delete().eq('user_id', user!.id).eq('game_id', game.id).eq('vote_month', voteMonth)
        : supabase.from('votes').insert({ user_id: user!.id, game_id: game.id, vote_month: voteMonth });
      const { error } = await request;
      if (!error) await query.refresh();
    }
  }

  async function searchGames(event: React.FormEvent) {
    event.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    if (isDemo) {
      const normalized = searchQuery.toLocaleLowerCase('pt-BR');
      const { demoGames } = await import('@/lib/demo-data');
      setResults(demoGames.filter(game => game.title.toLocaleLowerCase('pt-BR').includes(normalized)));
      setSearching(false);
      return;
    }
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível buscar jogos.');
      setResults(payload);
    } catch (value) {
      setSearchError(value instanceof Error ? value.message : 'Não foi possível buscar jogos.');
    } finally {
      setSearching(false);
    }
  }

  function voteAction(game: Game) {
    if (!data) return null;
    const voted = data.votedGameIds.includes(game.id);
    const alreadyRanked = data.rankingGameIds.includes(game.id);
    const message = voted
      ? `Seu voto será removido da votação de ${formatMonth(voteMonth)}. Se for o último voto, o jogo sairá do ranking.`
      : alreadyRanked
        ? `O jogo já está no ranking. Seu voto será somado à votação de ${formatMonth(voteMonth)}.`
        : `Seu voto adicionará o jogo ao ranking de ${formatMonth(voteMonth)}.`;
    return (
      <Dialog>
        <DialogTrigger asChild>
          <GameActionButton kind="vote" active={voted} disabled={isHistorical} className="h-8 rounded-lg px-2.5 text-[10px]" />
        </DialogTrigger>
        <DialogContent title={voted ? 'Remover voto' : 'Votar neste jogo'} description={`Votação para ${formatMonth(voteMonth)}.`} className="max-w-sm">
          <GameDialogPreview game={game} message={message} />
          <div className="flex gap-2 p-4"><DialogClose className="h-10 flex-1 rounded-xl bg-white/5 px-3 text-xs font-bold text-zinc-300">Cancelar</DialogClose><DialogClose onClick={() => void toggleVote(game)} className={`h-10 flex-1 rounded-xl px-3 text-xs font-extrabold text-white ${voted ? 'bg-red-600' : 'bg-violet-600'}`}>{voted ? 'Remover voto' : 'Confirmar voto'}</DialogClose></div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-300"><Library className="size-3" />Biblioteca</div><h1 className="text-2xl font-black tracking-tight sm:text-3xl">Seus jogos</h1><p className="mt-1.5 text-sm text-zinc-500">Seu backlog é pessoal e não interfere na votação.</p></div>
        <Dialog>
          <DialogTrigger asChild><button className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-end rounded-xl bg-violet-600 px-4 text-xs font-extrabold hover:bg-violet-500 sm:self-auto"><Plus className="size-4" />Adicionar ao backlog</button></DialogTrigger>
          <DialogContent title="Adicionar ao backlog" description="Busque um jogo para guardar na sua lista.">
            <form onSubmit={searchGames} className="flex gap-2 border-b border-white/8 p-4"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" /><input autoFocus value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Nome do jogo" className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-3 text-sm outline-none focus:border-violet-500" /></label><button disabled={searching} className="h-11 shrink-0 rounded-xl bg-violet-600 px-4 text-xs font-bold disabled:opacity-50">Buscar</button></form>
            <div className="max-h-[55dvh] space-y-2 overflow-y-auto p-4">
              {searching ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />) : searchError ? <p className="p-8 text-center text-sm text-red-300">{searchError}</p> : results.length ? results.map(game => {
                const added = data?.backlog.some(item => item.id === game.id);
                return <div key={game.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3"><img src={game.image_url} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{game.title}</div><div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500"><Clock3 className="size-3" />{game.duration_hours} h</div></div><button disabled={added} onClick={() => void addToBacklog(game)} type="button" className="shrink-0 rounded-lg bg-violet-500/15 px-3 py-2 text-[11px] font-bold text-violet-300 hover:bg-violet-500 hover:text-white disabled:text-emerald-300">{added ? 'No backlog' : 'Adicionar'}</button></div>;
              }) : <p className="p-10 text-center text-sm text-zinc-500">Digite o nome de um jogo para começar.</p>}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs.Root defaultValue="backlog">
        <Tabs.List className="mb-5 grid grid-cols-2 rounded-2xl border border-white/8 bg-white/[0.025] p-1.5">
          <Tabs.Trigger value="backlog" className="rounded-xl px-3 py-2.5 text-xs font-extrabold text-zinc-500 outline-none data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300">Backlog · {data?.backlog.length || 0}</Tabs.Trigger>
          <Tabs.Trigger value="completed" className="rounded-xl px-3 py-2.5 text-xs font-extrabold text-zinc-500 outline-none data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-300">Finalizados · {data?.completed.length || 0}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="backlog" className="outline-none data-[state=active]:animate-tab-in">{query.isInitialLoading ? <ListSkeleton /> : data?.backlog.length ? <div ref={backlogParent} className="space-y-3">{data.backlog.map(game => {
          const finished = data.completed.some(item => item.id === game.id);
          return <GameListCard key={game.id} game={game} action={<>
            <Dialog><DialogTrigger asChild><button aria-label={`Remover ${game.title}`} className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-3.5" /></button></DialogTrigger><DialogContent title="Remover do backlog" description="Esta ação não altera votos nem o status de finalização." className="max-w-sm"><GameDialogPreview game={game} message="O jogo será removido apenas da sua lista pessoal." /><div className="flex gap-2 p-4"><DialogClose className="h-10 flex-1 rounded-xl bg-white/5 px-3 text-xs font-bold text-zinc-300">Cancelar</DialogClose><DialogClose onClick={() => void removeBacklog(game)} className="h-10 flex-1 rounded-xl bg-red-600 px-3 text-xs font-bold text-white">Remover</DialogClose></div></DialogContent></Dialog>
            <GameActionButton kind="completed" active={finished} onClick={() => void markFinished(game, !finished)} className="h-8 rounded-lg px-2.5 text-[10px]" />
            {voteAction(game)}
          </>} />;
        })}</div> : <Empty title="Seu backlog está vazio" description="Adicione jogos aqui sem interferir no ranking." />}</Tabs.Content>
        <Tabs.Content value="completed" className="outline-none data-[state=active]:animate-tab-in">{query.isInitialLoading ? <ListSkeleton /> : data?.completed.length ? <div ref={completedParent} className="space-y-3">{data.completed.map(game => <GameListCard key={game.id} game={game} action={<><GameActionButton kind="completed" active onClick={() => void markFinished(game, false)} className="h-8 rounded-lg px-2.5 text-[10px]" />{voteAction(game)}</>} />)}</div> : <Empty title="Nenhum jogo finalizado" description="Os jogos concluídos aparecerão aqui." />}</Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-60 place-items-center rounded-3xl border border-dashed border-white/10 p-8 text-center"><div><Library className="mx-auto size-8 text-zinc-700" /><h2 className="mt-3 text-sm font-bold text-zinc-300">{title}</h2><p className="mt-1 text-xs text-zinc-500">{description}</p></div></div>;
}
