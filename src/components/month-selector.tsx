'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { CalendarDays, Check, ChevronDown, LockKeyhole } from 'lucide-react';
import { useApp } from './app-provider';
import { formatMonth, monthKey, shiftMonth } from '@/lib/utils';

export function MonthSelector() {
  const { selectedMonth, availableMonths, setSelectedMonth, isHistorical } = useApp();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 outline-none transition hover:bg-white/10 data-[state=open]:bg-white/10">
        <CalendarDays className="size-3.5 text-violet-400" />
        <span className="truncate">{formatMonth(selectedMonth)}</span>
        {isHistorical && <LockKeyhole className="size-3 text-amber-400" />}
        <ChevronDown className="size-3.5 text-zinc-500" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="animated-popup z-[100] min-w-56 rounded-2xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl outline-none">
          <div className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Mês da atividade</div>
          {availableMonths.map(month => (
            <DropdownMenu.Item key={month} onSelect={() => setSelectedMonth(month)} className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-sm text-zinc-300 outline-none transition data-[highlighted]:bg-white/8 data-[highlighted]:text-white">
              <span>{formatMonth(month)}</span>
              {month === selectedMonth ? <Check className="size-4 text-violet-400" /> : month < monthKey() ? <LockKeyhole className="size-3.5 text-zinc-600" /> : null}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-white/8" />
          <div className="px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
            Em {formatMonth(selectedMonth, { includeYear: false }).toLowerCase()}, a votação escolhe o jogo de {formatMonth(shiftMonth(selectedMonth, 1), { includeYear: false }).toLowerCase()}.
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
