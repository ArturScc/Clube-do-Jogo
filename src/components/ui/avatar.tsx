import { cn, initials } from '@/lib/utils';

export function Avatar({ src, name, className }: { src?: string | null; name?: string | null; className?: string }) {
  return (
    <span className={cn('inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-800 text-xs font-bold text-zinc-300', className)}>
      {src ? <img src={src} alt={name || 'Avatar'} className="size-full object-cover" /> : initials(name)}
    </span>
  );
}
