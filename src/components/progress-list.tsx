'use client';

import { useMemo } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { CheckCircle2, Circle, Clock3, PlayCircle, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { demoProgress, demoProfiles } from '@/lib/demo-data';
import type { Game, GameProgress, ProgressStatus, Profile } from '@/lib/types';
import { formatDate, formatFinishedCount } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from './app-provider';
import { Avatar } from './ui/avatar';
import { ListSkeleton } from './ui/skeleton';
import { LetterboxdRating } from './letterboxd-rating';

const statusMeta: Record<ProgressStatus, { label: string; icon: typeof Circle; color: string }> = {
  not_started: { label: 'Não iniciado', icon: Circle, color: 'text-zinc-500' },
  started: { label: 'Comecei', icon: PlayCircle, color: 'text-sky-400' },
  finished: { label: 'Finalizado', icon: CheckCircle2, color: 'text-emerald-400' },
};

export function ProgressList({ game }: { game: Game }) {
  const supabase = useMemo(() => createClient(), []);
  const { user, isDemo, selectedMonth, isHistorical } = useApp();
  const query = useStaleQuery<GameProgress[]>(`progress:${game.id}:${selectedMonth}`, async () => {
    if (isDemo) return demoProgress.map(item => ({ ...item, club_month: selectedMonth }));
    const [{ data: profiles, error: profilesError }, { data: progress, error: progressError }] = await Promise.all([
      supabase.from('profiles').select('id, name, avatar_url').order('name'),
      supabase.from('game_progress').select('*').eq('game_id', game.id).eq('club_month', selectedMonth),
    ]);
    if (profilesError) throw profilesError;
    if (progressError) throw progressError;
    const progressMap = new Map((progress || []).map(item => [item.user_id, item]));
    return (profiles as Profile[]).map(profile => ({
      id: progressMap.get(profile.id)?.id || `new-${profile.id}`,
      user_id: profile.id,
      game_id: game.id,
      club_month: selectedMonth,
      status: (progressMap.get(profile.id)?.status || 'not_started') as ProgressStatus,
      rating: progressMap.get(profile.id)?.rating || null,
      started_at: progressMap.get(profile.id)?.started_at || null,
      finished_at: progressMap.get(profile.id)?.finished_at || null,
      profile,
    }));
  });
  const progress = query.data || [];
  const [progressParent] = useAutoAnimate<HTMLDivElement>({ duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });

  async function updateStatus(status: ProgressStatus) {
    if (isHistorical) return;
    const existing = progress.find(item => item.user_id === user!.id);
    const now = new Date().toISOString();
    const next: GameProgress = existing ? {
      ...existing,
      status,
      started_at: existing.started_at || (status === 'not_started' ? null : now),
      finished_at: status === 'finished' ? existing.finished_at || now : null,
      rating: status === 'finished' ? existing.rating : null,
    } : {
      id: crypto.randomUUID(), user_id: user!.id, game_id: game.id, club_month: selectedMonth, status,
      rating: null, started_at: status === 'not_started' ? null : now, finished_at: status === 'finished' ? now : null,
      profile: demoProfiles[0],
    };
    query.setData(progress.some(item => item.user_id === user!.id) ? progress.map(item => item.user_id === user!.id ? next : item) : [next, ...progress]);
    if (!isDemo) await supabase.from('game_progress').upsert({ user_id: user!.id, game_id: game.id, club_month: selectedMonth, status: next.status, rating: next.rating, started_at: next.started_at, finished_at: next.finished_at }, { onConflict: 'user_id,game_id,club_month' });
  }

  async function updateRating(rating: number) {
    if (isHistorical) return;
    const next = progress.map(item => item.user_id === user!.id ? { ...item, rating } : item);
    query.setData(next);
    if (!isDemo) await supabase.from('game_progress').update({ rating }).eq('user_id', user!.id).eq('game_id', game.id).eq('club_month', selectedMonth);
  }

  const mine = progress.find(item => item.user_id === user!.id);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-extrabold">Meu progresso</h2><p className="mt-0.5 text-[11px] text-zinc-500">{isHistorical ? 'Fechado ao final do mês.' : 'Atualize conforme você avança.'}</p></div>{mine && <span className={`text-xs font-bold ${statusMeta[mine.status].color}`}>{statusMeta[mine.status].label}</span>}</div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(Object.keys(statusMeta) as ProgressStatus[]).map(status => { const MetaIcon = statusMeta[status].icon; return <button key={status} disabled={isHistorical} onClick={() => void updateStatus(status)} className={`flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-3 text-[10px] font-bold transition disabled:cursor-not-allowed ${mine?.status === status ? 'border-violet-400/35 bg-violet-500/15 text-violet-200' : 'border-white/8 bg-white/[0.025] text-zinc-500 hover:bg-white/5'}`}><MetaIcon className="size-4" /><span className="max-w-full truncate whitespace-nowrap">{statusMeta[status].label}</span></button>; })}
        </div>
        {mine?.status === 'finished' && <div className="mt-4 flex animate-pop-in flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4"><div><span className="block text-xs font-bold text-zinc-400">Minha nota</span><span className="mt-0.5 block text-[10px] text-zinc-600">de ½ a 5 estrelas</span></div><LetterboxdRating value={mine.rating} onChange={rating => void updateRating(rating)} disabled={isHistorical} /></div>}
      </section>

      <div className="flex items-center justify-between"><h2 className="text-sm font-extrabold">Progresso do clube</h2><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">{formatFinishedCount(progress.filter(item => item.status === 'finished').length)}</span></div>
      {query.isInitialLoading ? <ListSkeleton count={4} /> : <div ref={progressParent} className="space-y-2">{progress.map(item => {
        const meta = statusMeta[item.status];
        const Icon = meta.icon;
        return (
          <article key={item.user_id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
            <Avatar src={item.profile?.avatar_url} name={item.profile?.name} className="size-10" />
            <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><span className="truncate text-xs font-extrabold">{item.profile?.name || 'Membro'}</span>{item.rating && <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-emerald-400"><Star className="size-3 fill-current" />{(item.rating / 2).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span>}</div><div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[9px] text-zinc-600">{item.started_at && <span className="inline-flex items-center gap-1 whitespace-nowrap"><Clock3 className="size-2.5" />Início: {formatDate(item.started_at)}</span>}{item.finished_at && <span className="whitespace-nowrap">Fim: {formatDate(item.finished_at)}</span>}</div></div>
            <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-bold ${meta.color}`}><Icon className="size-3.5" /><span className="hidden min-[360px]:inline">{meta.label}</span></span>
          </article>
        );
      })}</div>}
    </div>
  );
}
