import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-xl bg-zinc-800/80', className)} />;
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="Carregando conteúdo">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex gap-3 rounded-2xl border border-white/5 bg-white/[0.025] p-3">
          <Skeleton className="h-20 w-16 shrink-0" />
          <div className="flex flex-1 flex-col justify-center gap-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-7 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
