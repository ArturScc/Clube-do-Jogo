'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Tabs from '@radix-ui/react-tabs';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { CalendarDays, Clock3, Gamepad2, Library, Plus, Search, Star, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchProfileWithGames } from '@/lib/data';
import type { Game, UserPlatform } from '@/lib/types';
import { formatMonth, shiftMonth } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from '@/components/app-provider';
import { GameListCard } from '@/components/game-list-card';
import { GameDialogPreview } from '@/components/game-dialog-preview';
import { ListSkeleton, Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { GameActionButton } from '@/components/game-action-button';
import { useUrlDialog, useUrlTab } from '@/hooks/use-url-state';

const animation = { duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' };

export function YourGamesPanel({ embedded = false }: { embedded?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const { user, isDemo, selectedMonth, isHistorical, runOptimistic } = useApp();
  const voteMonth = shiftMonth(selectedMonth, 1);
  const query = useStaleQuery(`your-games:${user?.id}:${voteMonth}`, () => fetchProfileWithGames(supabase, user!.id, isDemo, voteMonth), Boolean(user));
  const data = query.data;
  const [backlogParent] = useAutoAnimate<HTMLDivElement>(animation);
  const [completedParent] = useAutoAnimate<HTMLDivElement>(animation);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Game[]>([]);
  const [searchError, setSearchError] = useState('');
  const [platformQuery, setPlatformQuery] = useState('');
  const [platformSearching, setPlatformSearching] = useState(false);
  const [platformResults, setPlatformResults] = useState<UserPlatform[]>([]);
  const [platformError, setPlatformError] = useState('');
  const addDialog = useUrlDialog('add-backlog');
  const actionDialog = useUrlDialog('game-action');
  const [activeTab, setActiveTab] = useUrlTab('list', ['backlog', 'completed', 'platforms'] as const, 'backlog');

  async function removeBacklog(game: Game) {
    if (!data) return;
    const next = { ...data, backlog: data.backlog.filter(item => item.id !== game.id) };
    if (isDemo) query.setData(next);
    else await runOptimistic('Removendo do backlog…', () => query.setData(next), () => query.setData(data), () => supabase.from('backlogs').delete().eq('user_id', user!.id).eq('game_id', game.id));
  }

  async function addToBacklog(game: Game) {
    if (!data || data.backlog.some(item => item.id === game.id)) return;
    const next = { ...data, backlog: [game, ...data.backlog] };
    if (isDemo) query.setData(next);
    else await runOptimistic('Adicionando ao backlog…', () => query.setData(next), () => query.setData(data), () => supabase.from('backlogs').upsert({ user_id: user!.id, game_id: game.id }, { onConflict: 'user_id,game_id' }));
  }

  async function markFinished(game: Game, finished: boolean) {
    if (!data) return;
    const next = { ...data, completed: finished ? [...data.completed, game] : data.completed.filter(item => item.id !== game.id) };
    if (isDemo) {
      query.setData(next);
      return;
    }
    const now = new Date().toISOString();
    const request = supabase.from('game_progress').upsert({
      user_id: user!.id,
      game_id: game.id,
      status: finished ? 'finished' : 'started',
      started_at: now,
      finished_at: finished ? now : null,
      updated_at: now,
    }, { onConflict: 'user_id,game_id' });
    await runOptimistic(finished ? 'Marcando como finalizado…' : 'Removendo finalização…', () => query.setData(next), () => query.setData(data), () => request);
  }

  async function toggleVote(game: Game) {
    if (!data || isHistorical) return;
    const voted = data.votedGameIds.includes(game.id);
    const votedGameIds = voted ? data.votedGameIds.filter(id => id !== game.id) : [...data.votedGameIds, game.id];
    const next = {
      ...data,
      votedGameIds,
      rankingGameIds: voted ? data.rankingGameIds : Array.from(new Set([...data.rankingGameIds, game.id])),
      backlog: voted || data.backlog.some(item => item.id === game.id) ? data.backlog : [game, ...data.backlog],
    };
    if (isDemo) {
      query.setData(next);
      return;
    }
    const request = voted
      ? supabase.from('votes').delete().eq('user_id', user!.id).eq('game_id', game.id).eq('vote_month', voteMonth)
      : Promise.all([
        supabase.from('votes').insert({ user_id: user!.id, game_id: game.id, vote_month: voteMonth }),
        supabase.from('backlogs').upsert({ user_id: user!.id, game_id: game.id }, { onConflict: 'user_id,game_id' }),
      ]);
    await runOptimistic(voted ? 'Removendo voto…' : 'Registrando voto…', () => query.setData(next), () => query.setData(data), () => request);
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

  async function searchPlatforms(event: React.FormEvent) {
    event.preventDefault();
    if (!platformQuery.trim()) return;
    setPlatformSearching(true);
    setPlatformError('');
    if (isDemo) {
      const available: UserPlatform[] = [
        { igdb_platform_id: 130, name: 'Nintendo Switch', abbreviation: 'Switch' },
        { igdb_platform_id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' },
        { igdb_platform_id: 48, name: 'PlayStation 4', abbreviation: 'PS4' },
        { igdb_platform_id: 167, name: 'PlayStation 5', abbreviation: 'PS5' },
        { igdb_platform_id: 169, name: 'Xbox Series X|S', abbreviation: 'Xbox' },
      ];
      const normalized = platformQuery.toLocaleLowerCase('pt-BR');
      setPlatformResults(available.filter(platform => platform.name.toLocaleLowerCase('pt-BR').includes(normalized)));
      setPlatformSearching(false);
      return;
    }
    try {
      const response = await fetch(`/api/platforms/search?q=${encodeURIComponent(platformQuery)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível buscar consoles.');
      setPlatformResults(payload);
    } catch (value) {
      setPlatformError(value instanceof Error ? value.message : 'Não foi possível buscar consoles.');
    } finally {
      setPlatformSearching(false);
    }
  }

  async function addPlatform(platform: UserPlatform) {
    if (!data || data.platforms.some(item => item.igdb_platform_id === platform.igdb_platform_id)) return;
    const next = { ...data, platforms: [...data.platforms, platform].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) };
    if (isDemo) {
      query.setData(next);
      return;
    }
    await runOptimistic('Adicionando console…', () => query.setData(next), () => query.setData(data), () => supabase.from('user_platforms').upsert({
      user_id: user!.id,
      igdb_platform_id: platform.igdb_platform_id,
      name: platform.name,
      abbreviation: platform.abbreviation ?? null,
      logo_url: platform.logo_url ?? null,
    }, { onConflict: 'user_id,igdb_platform_id' }));
  }

  async function removePlatform(platform: UserPlatform) {
    if (!data) return;
    const next = { ...data, platforms: data.platforms.filter(item => item.igdb_platform_id !== platform.igdb_platform_id) };
    if (isDemo) {
      query.setData(next);
      return;
    }
    await runOptimistic('Removendo console…', () => query.setData(next), () => query.setData(data), () => supabase.from('user_platforms').delete().eq('user_id', user!.id).eq('igdb_platform_id', platform.igdb_platform_id));
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
      <Dialog open={actionDialog.open && actionDialog.getParam('action') === 'vote' && actionDialog.getParam('item') === game.id} onOpenChange={open => open ? actionDialog.show({ action: 'vote', item: game.id }) : actionDialog.close()}>
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
    <div className={embedded ? 'mt-10' : 'mx-auto max-w-3xl'}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>{embedded ? <><h2 className="text-xl font-black tracking-tight sm:text-2xl">Biblioteca</h2><p className="mt-1.5 text-sm text-zinc-500">Gerencie seu backlog, votos e jogos finalizados.</p></> : <><div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-300"><Library className="size-3" />Biblioteca</div><h1 className="text-2xl font-black tracking-tight sm:text-3xl">Seus jogos</h1><p className="mt-1.5 text-sm text-zinc-500">Seu backlog é pessoal e não interfere na votação.</p></>}</div>
        <Dialog open={false}>
          <DialogTrigger asChild><button className="hidden"><Plus /></button></DialogTrigger>
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

      <Tabs.Root value={activeTab} onValueChange={value => setActiveTab(value as typeof activeTab)}>
        <Tabs.List className="app-tabs grid grid-cols-3 rounded-2xl border border-white/8 bg-white/[0.025] p-1.5">
          <Tabs.Trigger value="backlog" className="rounded-xl px-3 py-2.5 text-xs font-extrabold text-zinc-500 outline-none data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300">Backlog · {data?.backlog.length || 0}</Tabs.Trigger>
          <Tabs.Trigger value="completed" className="rounded-xl px-3 py-2.5 text-xs font-extrabold text-zinc-500 outline-none data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-300">Finalizados · {data?.completed.length || 0}</Tabs.Trigger>
          <Tabs.Trigger value="platforms" className="rounded-xl px-2 py-2.5 text-xs font-extrabold text-zinc-500 outline-none data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-300">Meus Consoles</Tabs.Trigger>
        </Tabs.List>
        <div className="my-4 flex justify-end">
          <Dialog open={addDialog.open} onOpenChange={open => open ? addDialog.show() : addDialog.close()}>
            <DialogTrigger asChild><button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-extrabold hover:bg-violet-500"><Plus className="size-4" />{activeTab === 'backlog' ? 'Adicionar ao backlog' : activeTab === 'completed' ? 'Adicionar aos finalizados' : 'Adicionar console'}</button></DialogTrigger>
            {activeTab === 'platforms' ? <DialogContent title="Adicionar console" description="Busque um console na IGDB para incluir no seu perfil.">
              <form onSubmit={searchPlatforms} className="flex gap-2 border-b border-white/8 p-4"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" /><input autoFocus value={platformQuery} onChange={event => setPlatformQuery(event.target.value)} placeholder="Nome do console" className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-3 text-sm outline-none focus:border-violet-500" /></label><button disabled={platformSearching} className="h-11 shrink-0 rounded-xl bg-violet-600 px-4 text-xs font-bold disabled:opacity-50">Buscar</button></form>
              <div className="max-h-[55dvh] space-y-2 overflow-y-auto p-4">{platformSearching ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />) : platformError ? <p className="p-8 text-center text-sm text-red-300">{platformError}</p> : platformResults.length ? platformResults.map(platform => { const added = data?.platforms.some(item => item.igdb_platform_id === platform.igdb_platform_id); return <div key={platform.igdb_platform_id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3">{platform.logo_url ? <img src={platform.logo_url} alt="" className="size-10 shrink-0 rounded-lg object-contain" /> : <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/[.06] text-zinc-400"><Gamepad2 className="size-5" /></span>}<div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{platform.name}</div>{platform.abbreviation && <div className="mt-0.5 text-[11px] text-zinc-500">{platform.abbreviation}</div>}</div><button disabled={added} onClick={() => void addPlatform(platform)} type="button" className="shrink-0 rounded-lg bg-cyan-500/15 px-3 py-2 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500 hover:text-white disabled:text-emerald-300">{added ? 'Adicionado' : 'Adicionar'}</button></div>; }) : <p className="p-10 text-center text-sm text-zinc-500">Digite o nome de um console para começar.</p>}</div>
            </DialogContent> : <DialogContent title={activeTab === 'backlog' ? 'Adicionar ao backlog' : 'Adicionar aos finalizados'} description={activeTab === 'backlog' ? 'Busque um jogo para guardar na sua lista.' : 'Busque um jogo já concluído por você.'}>
              <form onSubmit={searchGames} className="flex gap-2 border-b border-white/8 p-4"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" /><input autoFocus value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Nome do jogo" className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-3 text-sm outline-none focus:border-violet-500" /></label><button disabled={searching} className="h-11 shrink-0 rounded-xl bg-violet-600 px-4 text-xs font-bold disabled:opacity-50">Buscar</button></form>
              <div className="max-h-[55dvh] space-y-2 overflow-y-auto p-4">{searching ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />) : searchError ? <p className="p-8 text-center text-sm text-red-300">{searchError}</p> : results.length ? results.map(game => { const added = activeTab === 'backlog' ? data?.backlog.some(item => item.id === game.id) : data?.completed.some(item => item.id === game.id); return <GameSearchResult key={game.id} game={game} added={Boolean(added)} label={added ? (activeTab === 'backlog' ? 'No backlog' : 'Finalizado') : 'Adicionar'} onAdd={() => void (activeTab === 'backlog' ? addToBacklog(game) : markFinished(game, true))} />; }) : <p className="p-10 text-center text-sm text-zinc-500">Digite o nome de um jogo para começar.</p>}</div>
            </DialogContent>}
          </Dialog>
        </div>
        <Tabs.Content value="backlog" className="outline-none data-[state=active]:animate-tab-in">{query.isInitialLoading ? <ListSkeleton /> : data?.backlog.length ? <div ref={backlogParent} className="space-y-3">{data.backlog.map(game => {
          const finished = data.completed.some(item => item.id === game.id);
          return <GameListCard key={game.id} game={game} action={<>
            <Dialog open={actionDialog.open && actionDialog.getParam('action') === 'remove' && actionDialog.getParam('item') === game.id} onOpenChange={open => open ? actionDialog.show({ action: 'remove', item: game.id }) : actionDialog.close()}><DialogTrigger asChild><button aria-label={`Remover ${game.title}`} className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-3.5" /></button></DialogTrigger><DialogContent title="Remover do backlog" description="Esta ação não altera votos nem o status de finalização." className="max-w-sm"><GameDialogPreview game={game} message="O jogo será removido apenas da sua lista pessoal." /><div className="flex gap-2 p-4"><DialogClose className="h-10 flex-1 rounded-xl bg-white/5 px-3 text-xs font-bold text-zinc-300">Cancelar</DialogClose><DialogClose onClick={() => void removeBacklog(game)} className="h-10 flex-1 rounded-xl bg-red-600 px-3 text-xs font-bold text-white">Remover</DialogClose></div></DialogContent></Dialog>
            <GameActionButton kind="completed" active={finished} onClick={() => void markFinished(game, !finished)} className="h-8 rounded-lg px-2.5 text-[10px]" />
            {voteAction(game)}
          </>} />;
        })}</div> : <Empty title="Seu backlog está vazio" description="Adicione jogos aqui sem interferir no ranking." />}</Tabs.Content>
        <Tabs.Content value="completed" className="outline-none data-[state=active]:animate-tab-in">{query.isInitialLoading ? <ListSkeleton /> : data?.completed.length ? <div ref={completedParent} className="space-y-3">{data.completed.map(game => <GameListCard key={game.id} game={game} action={<><GameActionButton kind="completed" active onClick={() => void markFinished(game, false)} className="h-8 rounded-lg px-2.5 text-[10px]" />{voteAction(game)}</>} />)}</div> : <Empty title="Nenhum jogo finalizado" description="Os jogos concluídos aparecerão aqui." />}</Tabs.Content>
        <Tabs.Content value="platforms" className="outline-none data-[state=active]:animate-tab-in">{query.isInitialLoading ? <ListSkeleton /> : data?.platforms.length ? <div className="flex flex-wrap gap-2">{data.platforms.map(platform => <span key={platform.igdb_platform_id} className="inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-400/15 bg-cyan-500/[.07] py-1 pl-2 pr-1 text-xs font-bold text-cyan-100">{platform.logo_url ? <img src={platform.logo_url} alt="" className="size-6 object-contain" /> : <Gamepad2 className="size-4 text-cyan-300" />}<span>{platform.name}</span><button type="button" onClick={() => void removePlatform(platform)} aria-label={`Remover ${platform.name}`} title={`Remover ${platform.name}`} className="grid size-7 place-items-center rounded-md text-cyan-200 transition hover:bg-red-500/15 hover:text-red-300"><Trash2 className="size-3.5" /></button></span>)}</div> : <Empty title="Nenhum console adicionado" description="Adicione os consoles que você tem para ver quais jogos são compatíveis." />}</Tabs.Content>
        </Tabs.Root>
    </div>
  );
}

function GameSearchResult({ game, added, label, onAdd }: { game: Game; added: boolean; label: string; onAdd: () => void }) {
  const rating = game.average_rating === null || game.average_rating === undefined ? null : (game.average_rating / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return (
    <article className="flex min-w-0 gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-3">
      <Link href={`/jogos/${game.id}?preview=1`} aria-label={`Ver detalhes de ${game.title}`} className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-900 transition hover:ring-2 hover:ring-violet-400/60">
        <img src={game.image_url} alt={`Capa de ${game.title}`} className="size-full object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-sm font-bold leading-5 text-zinc-100">{game.title}</h3>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-wrap gap-1.5 text-[11px] font-semibold text-zinc-400">
            <span className="inline-flex items-center gap-1 rounded-md bg-white/[.07] px-2 py-1"><Clock3 className="size-3 text-zinc-500" />{game.duration_hours} h</span>
            {rating && <span className="inline-flex items-center gap-1 rounded-md bg-white/[.07] px-2 py-1 text-amber-300"><Star className="size-3 fill-current" />{rating}</span>}
            {game.release_year && <span className="inline-flex items-center gap-1 rounded-md bg-white/[.07] px-2 py-1"><CalendarDays className="size-3 text-zinc-500" />{game.release_year}</span>}
          </div>
          <button disabled={added} onClick={onAdd} type="button" className="shrink-0 rounded-lg bg-violet-500/15 px-3 py-2 text-[11px] font-bold text-violet-300 transition hover:bg-violet-500 hover:text-white disabled:text-emerald-300">{label}</button>
        </div>
      </div>
    </article>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-60 place-items-center rounded-3xl border border-dashed border-white/10 p-8 text-center"><div><Library className="mx-auto size-8 text-zinc-700" /><h2 className="mt-3 text-sm font-bold text-zinc-300">{title}</h2><p className="mt-1 text-xs text-zinc-500">{description}</p></div></div>;
}

export default function YourGamesPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/perfil'); }, [router]);
  return <div className="mx-auto max-w-3xl"><ListSkeleton /></div>;
}
