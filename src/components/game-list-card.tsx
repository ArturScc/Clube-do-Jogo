import Link from 'next/link';
import { CalendarDays, Clock3, Star } from 'lucide-react';
import type { Game } from '@/lib/types';

export function GameListCard({ game, action, badge }: { game: Game; action?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <article className="group relative flex min-w-0 gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 transition hover:border-violet-500/25 hover:bg-white/[0.05]">
      {badge}
      <Link href={`/jogos/${game.id}`} className="relative h-[92px] w-[69px] shrink-0 overflow-hidden rounded-xl bg-zinc-900">
        <img src={game.image_url} alt={`Capa de ${game.title}`} className="size-full object-cover transition duration-300 group-hover:scale-105" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div className="min-w-0">
          <Link href={`/jogos/${game.id}`} className="block truncate text-sm font-extrabold text-zinc-100 hover:text-violet-300">{game.title}</Link>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1 whitespace-nowrap"><Clock3 className="size-3" />{game.duration_hours} h</span>
            {game.average_rating && <span className="inline-flex items-center gap-1 whitespace-nowrap text-amber-400"><Star className="size-3 fill-current" />{Math.round(game.average_rating / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span>}
            {game.release_year && <span className="inline-flex items-center gap-1 whitespace-nowrap"><CalendarDays className="size-3" />{game.release_year}</span>}
          </div>
        </div>
        {action && <div className="mt-2 flex min-w-0 flex-wrap items-center justify-end gap-1.5">{action}</div>}
      </div>
    </article>
  );
}
