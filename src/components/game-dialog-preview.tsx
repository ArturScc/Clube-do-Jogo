import { Clock3 } from 'lucide-react';
import type { Game } from '@/lib/types';

export function GameDialogPreview({ game, message }: { game: Game; message?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-white/8 bg-white/[0.025] px-5 py-4">
      <img src={game.image_url} alt={`Capa de ${game.title}`} className="h-20 w-15 shrink-0 rounded-xl object-cover shadow-lg" />
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-extrabold text-zinc-100">{game.title}</strong>
        <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-500"><Clock3 className="size-3" />{game.duration_hours} h</span>
        {message && <p className="mt-2 text-xs leading-relaxed text-zinc-400">{message}</p>}
      </div>
    </div>
  );
}
