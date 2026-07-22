'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { CalendarDays, Camera, CheckCircle2, ChevronRight, Gamepad2, Library, LogOut, Save, ShieldCheck, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchProfileWithGames } from '@/lib/data';
import { formatDate, formatFinishedCount } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from './app-provider';
import { Avatar } from './ui/avatar';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { GameListCard } from './game-list-card';
import { ListSkeleton, Skeleton } from './ui/skeleton';
import { ThemeSelector } from './theme-selector';
import { useUrlDialog, useUrlTab } from '@/hooks/use-url-state';
import { YourGamesPanel } from '@/app/seus-jogos/page';

export function ProfileView({ profileId, own = false, showThemeSelector = false }: { profileId: string; own?: boolean; showThemeSelector?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const { isDemo, isAdmin, signOut, refreshProfile, runOptimistic } = useApp();
  const query = useStaleQuery(`profile:${profileId}`, () => fetchProfileWithGames(supabase, profileId, isDemo));
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [backlogParent] = useAutoAnimate<HTMLDivElement>({ duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  const [completedParent] = useAutoAnimate<HTMLDivElement>({ duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  const data = query.data;
  const editDialog = useUrlDialog('edit-profile', { item: profileId });
  const [activeTab, setActiveTab] = useUrlTab('list', ['backlog', 'completed'] as const, 'backlog');
  const initializedEdit = useRef(false);

  useEffect(() => {
    if (!editDialog.open) {
      initializedEdit.current = false;
      return;
    }
    if (!data?.profile || initializedEdit.current) return;
    initializedEdit.current = true;
    setName(data.profile.name || '');
    setBio(data.profile.bio || '');
    setAvatar(data.profile.avatar_url || '');
  }, [data?.profile, editDialog.open]);

  async function saveProfile() {
    if (!data?.profile) return;
    setSaving(true);
    const patch = { name: name.trim() || data.profile.name || 'Membro', bio: bio.trim() || null, avatar_url: avatar.trim() || null, updated_at: new Date().toISOString() };
    const next = { ...data, profile: { ...data.profile, ...patch } };
    let saved = true;
    if (isDemo) query.setData(next);
    else saved = await runOptimistic('Atualizando perfil…', () => query.setData(next), () => query.setData(data), () => supabase.from('profiles').update(patch).eq('id', profileId));
    if (saved) {
      await refreshProfile();
      editDialog.close();
    }
    setSaving(false);
  }

  if (query.isInitialLoading) return <div className="mx-auto max-w-3xl"><div className="mb-8 text-center"><Skeleton className="mx-auto size-24 rounded-full" /><Skeleton className="mx-auto mt-4 h-7 w-44" /><Skeleton className="mx-auto mt-2 h-4 w-64" /></div><ListSkeleton /></div>;
  if (!data?.profile) return <div className="grid min-h-[60dvh] place-items-center text-center"><div><UserRound className="mx-auto size-9 text-zinc-700" /><h1 className="mt-3 text-lg font-black">Perfil não encontrado</h1></div></div>;

  const person = data.profile;
  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <section className="profile-hero relative mb-7 overflow-hidden rounded-[30px] border border-white/8 bg-white/[0.025] p-6 text-center">
        <div className="profile-hero-glow pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-violet-500/10 to-transparent" />
        <div className="relative mx-auto w-fit"><Avatar src={person.avatar_url} name={person.name} className="size-24 border-2 border-violet-400/25 text-xl shadow-xl" />{own && <Dialog open={editDialog.open} onOpenChange={open => open ? editDialog.show() : editDialog.close()}><DialogTrigger asChild><button aria-label="Editar perfil" className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full border-4 border-[#101014] bg-violet-600 text-white shadow"><Camera className="size-4" /></button></DialogTrigger><DialogContent title="Editar perfil" description="Atualize como você aparece para o clube."><div className="space-y-4 p-5"><label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-zinc-500">Nome</span><input value={name} onChange={event => setName(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-violet-500" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-zinc-500">Sobre você</span><textarea value={bio} onChange={event => setBio(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm outline-none focus:border-violet-500" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-zinc-500">URL do avatar</span><input type="url" value={avatar} onChange={event => setAvatar(event.target.value)} placeholder="https://…" className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-violet-500" /></label><button disabled={saving} onClick={() => void saveProfile()} className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-violet-600 px-4 text-sm font-extrabold disabled:opacity-50"><Save className="size-4" />{saving ? 'Salvando…' : 'Salvar alterações'}</button></div></DialogContent></Dialog>}</div>
        <h1 className="mt-4 text-2xl font-black tracking-tight">{person.name || 'Membro do clube'}</h1>
        {person.bio && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">{person.bio}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold text-zinc-500"><span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/5 px-2.5 py-1.5"><Library className="size-3" />{data.backlog.length} no backlog</span><span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/5 px-2.5 py-1.5"><CheckCircle2 className="size-3" />{formatFinishedCount(data.completed.length)}</span>{person.created_at && <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/5 px-2.5 py-1.5"><CalendarDays className="size-3" />Desde {formatDate(person.created_at)}</span>}</div>
      </section>

      {own ? <YourGamesPanel embedded /> : <Tabs.Root value={activeTab} onValueChange={value => setActiveTab(value as typeof activeTab)}>
        <Tabs.List className="app-tabs mb-5 grid grid-cols-2 rounded-2xl border border-white/8 bg-white/[0.025] p-1.5"><Tabs.Trigger value="backlog" className="whitespace-nowrap rounded-xl py-2.5 text-xs font-extrabold text-zinc-500 outline-none data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300">Backlog</Tabs.Trigger><Tabs.Trigger value="completed" className="whitespace-nowrap rounded-xl py-2.5 text-xs font-extrabold text-zinc-500 outline-none data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-300">Finalizados</Tabs.Trigger></Tabs.List>
        <Tabs.Content value="backlog" className="outline-none data-[state=active]:animate-fade-in">{data.backlog.length ? <div ref={backlogParent} className="space-y-3">{data.backlog.map(game => <GameListCard key={game.id} game={game} />)}</div> : <Empty text="Nenhum jogo no backlog." />}</Tabs.Content>
        <Tabs.Content value="completed" className="outline-none data-[state=active]:animate-fade-in">{data.completed.length ? <div ref={completedParent} className="space-y-3">{data.completed.map(game => <GameListCard key={game.id} game={game} />)}</div> : <Empty text="Nenhum jogo finalizado." />}</Tabs.Content>
      </Tabs.Root>}

      {own && isAdmin && <Link href="/admin" className="admin-entry mb-5 flex items-center gap-3 rounded-2xl border border-violet-400/15 bg-violet-500/[0.06] p-4 transition hover:bg-violet-500/10"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/12 text-violet-300"><ShieldCheck className="size-4" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">Cargos e acesso</strong><span className="mt-0.5 block text-[11px] text-zinc-500">Gerencie administradores e usuários comuns.</span></span><ChevronRight className="size-4 shrink-0 text-zinc-600" /></Link>}
      {showThemeSelector && <ThemeSelector />}
      {own && <div className="mt-5 border-t border-white/8 pt-5"><button onClick={() => void signOut()} className="danger-action inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-red-500/15 bg-red-500/[0.06] px-4 text-xs font-extrabold text-red-300 transition hover:bg-red-500/10"><LogOut className="size-4" />Sair da conta</button></div>}
    </div>
  );
}

function Empty({ text }: { text: string }) { return <div className="grid min-h-52 place-items-center rounded-3xl border border-dashed border-white/10 text-center"><div><Gamepad2 className="mx-auto size-8 text-zinc-700" /><p className="mt-3 text-sm text-zinc-500">{text}</p></div></div>; }
