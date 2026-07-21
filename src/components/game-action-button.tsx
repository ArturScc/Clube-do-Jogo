import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Flag, Library, ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';

type ActionKind = 'vote' | 'completed' | 'backlog';

const meta = {
  vote: { Icon: ThumbsUp, idle: 'Votar', active: 'Votado', activeClass: 'border-violet-400/25 bg-violet-500/[.12] text-violet-200', fillClass: 'fill-violet-400/25' },
  completed: { Icon: Flag, idle: 'Zerei', active: 'Zerado', activeClass: 'border-pink-400/30 bg-pink-500/[.12] text-pink-200', fillClass: 'fill-pink-400/25' },
  backlog: { Icon: Library, idle: 'Adicionar ao backlog', active: 'No backlog', activeClass: 'border-sky-400/25 bg-sky-500/[.10] text-sky-200', fillClass: 'fill-sky-400/20' },
} as const;

export const GameActionButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  kind: ActionKind;
  active: boolean;
  label?: string;
}>(function GameActionButton({ kind, active, label, className, ...props }, ref) {
  const config = meta[kind];
  const Icon = config.Icon;
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-[11px] font-extrabold transition duration-150 active:scale-[.97] disabled:opacity-55',
        active ? config.activeClass : 'border-white/10 bg-white/[.04] text-zinc-300 hover:border-white/15 hover:bg-white/[.08] hover:text-white',
        className,
      )}
      {...props}
    >
      <Icon className={cn('size-3.5 shrink-0', active && config.fillClass)} />
      <span className="truncate">{label || (active ? config.active : config.idle)}</span>
    </button>
  );
});
