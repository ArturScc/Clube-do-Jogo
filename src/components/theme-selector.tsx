'use client';

import { Check, Palette } from 'lucide-react';
import { motion } from 'motion/react';
import { themes } from '@/lib/themes';
import { useApp } from './app-provider';

export function ThemeSelector() {
  const { theme, setTheme } = useApp();

  return (
    <section className="theme-settings mt-8 border-t border-white/8 pt-5" aria-labelledby="theme-title">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300"><Palette className="size-4" /></span>
        <div><h2 id="theme-title" className="text-sm font-extrabold">Tema visual</h2><p className="mt-0.5 text-[11px] text-zinc-500">Salvo somente neste dispositivo.</p></div>
      </div>
      <div role="radiogroup" aria-label="Tema visual" className="grid gap-2 sm:grid-cols-2">
        {themes.map(option => {
          const selected = option.id === theme;
          return (
            <button key={option.id} role="radio" aria-checked={selected} onClick={() => setTheme(option.id)} className={`theme-option relative min-w-0 overflow-hidden rounded-2xl border p-3 text-left transition ${selected ? 'border-violet-400/35 bg-violet-500/10' : 'border-white/8 bg-white/[0.025] hover:bg-white/5'}`}>
              {selected && <motion.span layoutId="selected-theme" className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-violet-500 text-white shadow-lg" transition={{ type: 'spring', stiffness: 500, damping: 34 }}><Check className="size-3.5" /></motion.span>}
              <span className="mb-2 flex gap-1.5" aria-hidden="true">{option.colors.map(color => <span key={color} className="size-5 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: color }} />)}</span>
              <strong className="block truncate pr-7 text-xs text-zinc-200">{option.name}</strong>
              <span className="mt-1 block text-[10px] leading-relaxed text-zinc-500">{option.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
