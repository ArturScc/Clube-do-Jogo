'use client';

import { useMemo, useState } from 'react';
import { Search, ShieldCheck, ShieldOff, UserCog, UsersRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { demoProfiles } from '@/lib/demo-data';
import type { AdminUser, AppRole } from '@/lib/types';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useUrlDialog } from '@/hooks/use-url-state';
import { useApp } from '@/components/app-provider';
import { Avatar } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ListSkeleton } from '@/components/ui/skeleton';

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, isAdmin, isDemo, runOptimistic, refreshProfile } = useApp();
  const [search, setSearch] = useState('');
  const roleDialog = useUrlDialog('change-role');
  const query = useStaleQuery<AdminUser[]>('admin:users', async () => {
    if (isDemo) return demoProfiles.map((profile, index) => ({ ...profile, role: index === 0 ? 'admin' : 'member' }));
    const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] = await Promise.all([
      supabase.from('profiles').select('id, name, email, avatar_url, bio, created_at').order('name'),
      supabase.from('user_roles').select('user_id, role'),
    ]);
    if (profilesError) throw profilesError;
    if (rolesError) throw rolesError;
    const roleMap = new Map((roles || []).map(item => [item.user_id, item.role as AppRole]));
    return (profiles || []).map(profile => ({ ...profile, role: roleMap.get(profile.id) || 'member' })) as AdminUser[];
  }, isAdmin);
  const users = query.data || [];
  const targetId = roleDialog.getParam('item');
  const nextRole = roleDialog.getParam('action') === 'admin' ? 'admin' : 'member';
  const target = users.find(item => item.id === targetId);
  const adminCount = users.filter(item => item.role === 'admin').length;
  const visibleUsers = users.filter(item => `${item.name || ''} ${item.email || ''}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));

  async function changeRole() {
    if (!target || target.role === nextRole) return;
    const previous = users;
    const next = users.map(item => item.id === target.id ? { ...item, role: nextRole as AppRole } : item);
    let succeeded = true;
    if (isDemo) query.setData(next);
    else succeeded = await runOptimistic(
      nextRole === 'admin' ? 'Concedendo acesso administrativo…' : 'Removendo acesso administrativo…',
      () => query.setData(next),
      () => query.setData(previous),
      () => supabase.rpc('set_user_role', { target_user_id: target.id, new_role: nextRole }),
    );
    if (succeeded) {
      roleDialog.close();
      if (target.id === user?.id && !isDemo) await refreshProfile();
    }
  }

  if (!isAdmin) return <div className="grid min-h-[65dvh] place-items-center text-center"><div><ShieldOff className="mx-auto size-10 text-zinc-700" /><h1 className="mt-4 text-xl font-black">Área restrita</h1><p className="mt-2 text-sm text-zinc-500">Somente administradores podem gerenciar cargos.</p></div></div>;

  return (
    <div className="admin-page mx-auto max-w-3xl animate-fade-in">
      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-500/12 text-violet-300"><UserCog className="size-5" /></span>
        <div><h1 className="text-2xl font-black tracking-tight sm:text-3xl">Cargos e acesso</h1><p className="mt-1 text-sm leading-relaxed text-zinc-500">Gerencie quem pode encerrar ciclos e definir o jogo do clube.</p></div>
      </div>

      <label className="relative mb-4 block"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" className="h-12 w-full rounded-2xl border border-white/8 bg-white/[0.03] pl-11 pr-4 text-sm outline-none transition focus:border-violet-400/35 focus:bg-white/[0.045]" /></label>

      <div className="mb-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600"><span className="inline-flex items-center gap-1.5"><UsersRound className="size-3.5" />{users.length} usuários</span><span>{users.filter(item => item.role === 'admin').length} admins</span></div>
      {query.isInitialLoading ? <ListSkeleton count={5} /> : (
        <div className="space-y-2">
          {visibleUsers.map(person => {
            const promote = person.role !== 'admin';
            const lastAdmin = person.role === 'admin' && adminCount === 1;
            return (
              <article key={person.id} className="admin-user-card flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
                <Avatar src={person.avatar_url} name={person.name} className="size-11" />
                <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><strong className="truncate text-sm">{person.name || 'Membro'}</strong>{person.id === user?.id && <span className="text-[9px] font-bold text-zinc-600">Você</span>}</div><span className="block truncate text-[11px] text-zinc-500">{person.email || 'Sem e-mail público'}</span></div>
                <span className={`admin-role-badge hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black sm:inline-flex ${person.role === 'admin' ? 'bg-violet-500/12 text-violet-300' : 'bg-white/5 text-zinc-500'}`}>{person.role === 'admin' && <ShieldCheck className="size-3" />}{person.role === 'admin' ? 'Admin' : 'Usuário comum'}</span>
                <button disabled={lastAdmin} title={lastAdmin ? 'Promova outro administrador antes de remover este cargo.' : undefined} onClick={() => roleDialog.show({ item: person.id, action: promote ? 'admin' : 'member' })} className={`h-9 shrink-0 whitespace-nowrap rounded-xl px-3 text-[10px] font-extrabold transition disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-zinc-600 ${promote ? 'bg-violet-500/12 text-violet-300 hover:bg-violet-500/20' : 'bg-red-500/[0.07] text-red-300 hover:bg-red-500/12'}`}>{lastAdmin ? 'Último admin' : promote ? 'Tornar admin' : 'Remover admin'}</button>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={roleDialog.open} onOpenChange={open => open ? undefined : roleDialog.close()}>
        <DialogContent title={nextRole === 'admin' ? 'Conceder cargo de admin?' : 'Remover cargo de admin?'} description="Esta alteração entra em vigor imediatamente em todos os dispositivos.">
          {target && <div className="p-5"><div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3"><Avatar src={target.avatar_url} name={target.name} className="size-11" /><div className="min-w-0"><strong className="block truncate text-sm">{target.name || 'Membro'}</strong><span className="block truncate text-[11px] text-zinc-500">{target.email}</span></div></div><p className="mt-4 text-xs leading-relaxed text-zinc-400">{nextRole === 'admin' ? 'Essa pessoa poderá definir jogos, encerrar ciclos e gerenciar os cargos de todos os usuários.' : 'Essa pessoa perderá acesso à administração e não poderá mais alterar jogos ou cargos.'}</p><div className="mt-5 flex gap-2"><button onClick={() => roleDialog.close()} className="h-11 flex-1 rounded-xl bg-white/5 text-xs font-bold text-zinc-300">Cancelar</button><button onClick={() => void changeRole()} className={`h-11 flex-1 rounded-xl text-xs font-extrabold ${nextRole === 'admin' ? 'bg-violet-600 text-white' : 'bg-red-600 text-white'}`}>Confirmar alteração</button></div></div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
