'use client';

import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { CheckCircle2, ThumbsUp } from 'lucide-react';
import type { Profile } from '@/lib/types';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { Avatar } from './ui/avatar';
import { formatFinishedCount } from '@/lib/utils';

function PeopleList({ people, empty }: { people: Profile[]; empty: string }) {
  const [parent] = useAutoAnimate<HTMLDivElement>({ duration: 150, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  if (!people.length) return <div className="grid min-h-48 place-items-center px-6 text-center text-sm text-zinc-500">{empty}</div>;
  return (
    <div ref={parent} className="max-h-[60dvh] overflow-y-auto p-2">
      {people.map(person => (
        <Link key={person.id} href={`/perfil/${person.id}`} className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-white/5 active:bg-white/10">
          <Avatar src={person.avatar_url} name={person.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-zinc-100">{person.name || 'Membro'}</div>
            <div className="text-xs text-zinc-500">Ver perfil e backlog</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function ParticipantsDialog({ voters, completed, children, initialTab = 'votes' }: {
  voters: Profile[];
  completed: Profile[];
  children: React.ReactNode;
  initialTab?: 'votes' | 'completed';
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Participantes" description="Veja quem votou e quem já terminou este jogo.">
        <Tabs.Root defaultValue={initialTab}>
          <Tabs.List className="mx-4 mt-4 grid grid-cols-2 rounded-xl bg-black/30 p-1">
            <Tabs.Trigger value="votes" className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold text-zinc-500 outline-none transition data-[state=active]:bg-zinc-800 data-[state=active]:text-violet-300"><ThumbsUp className="size-3.5" />Votos · {voters.length}</Tabs.Trigger>
            <Tabs.Trigger value="completed" className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold text-zinc-500 outline-none transition data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-300"><CheckCircle2 className="size-3.5" />{formatFinishedCount(completed.length)}</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="votes" className="outline-none data-[state=active]:animate-tab-in"><PeopleList people={voters} empty="Ninguém votou neste jogo ainda." /></Tabs.Content>
          <Tabs.Content value="completed" className="outline-none data-[state=active]:animate-tab-in"><PeopleList people={completed} empty="Ninguém finalizou este jogo ainda." /></Tabs.Content>
        </Tabs.Root>
      </DialogContent>
    </Dialog>
  );
}
