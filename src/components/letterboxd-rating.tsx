'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LetterboxdRating({ value, onChange, disabled = false }: {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? value ?? 0;

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setPreview(null)}
      aria-label={value ? `Nota ${(value / 2).toLocaleString('pt-BR')} de 5` : 'Sem nota'}
    >
      {Array.from({ length: 5 }).map((_, index) => {
        const fullUnits = (index + 1) * 2;
        const fill = shown >= fullUnits ? 100 : shown === fullUnits - 1 ? 50 : 0;
        return (
          <span key={index} className="relative block size-7 shrink-0">
            <Star className="absolute inset-0 size-7 text-zinc-700" strokeWidth={1.8} />
            <span className="pointer-events-none absolute inset-0 overflow-hidden" style={{ width: `${fill}%` }}>
              <Star className="size-7 fill-emerald-400 text-emerald-400" strokeWidth={1.8} />
            </span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Dar nota ${index + 0.5}`}
              onMouseEnter={() => !disabled && setPreview(fullUnits - 1)}
              onFocus={() => !disabled && setPreview(fullUnits - 1)}
              onClick={() => onChange(fullUnits - 1)}
              className={cn('absolute inset-y-0 left-0 z-10 w-1/2', disabled && 'cursor-not-allowed')}
            />
            <button
              type="button"
              disabled={disabled}
              aria-label={`Dar nota ${index + 1}`}
              onMouseEnter={() => !disabled && setPreview(fullUnits)}
              onFocus={() => !disabled && setPreview(fullUnits)}
              onClick={() => onChange(fullUnits)}
              className={cn('absolute inset-y-0 right-0 z-10 w-1/2', disabled && 'cursor-not-allowed')}
            />
          </span>
        );
      })}
    </div>
  );
}
