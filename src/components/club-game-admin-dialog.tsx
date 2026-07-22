'use client';

import { useState } from 'react';
import { ArrowLeft, CalendarPlus2, CheckCircle2, Crown, RefreshCw, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import type { Game } from '@/lib/types';
import { formatMonth, monthKey, shiftMonth } from '@/lib/utils';
import { useUrlDialog } from '@/hooks/use-url-state';
import { type ClubUndoPreview, useApp } from './app-provider';
import { GameDialogPreview } from './game-dialog-preview';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { cn } from '@/lib/utils';

export function ClubGameAdminDialog({ game, variant = 'button', className }: {
  game: Game;
  variant?: 'button' | 'icon';
  className?: string;
}) {
  const { isAdmin, activeCycle, setClubGame, previewClubGameUndo, undoClubGameChange, redoClubGameChange } = useApp();
  const dialog = useUrlDialog('club-game', { item: game.id });
  const [submitting, setSubmitting] = useState(false);
  const [undoPreview, setUndoPreview] = useState<ClubUndoPreview | null>(null);

  if (!isAdmin) return null;

  const currentMonth = activeCycle?.month || monthKey();
  const nextMonth = shiftMonth(currentMonth, 1);
  const currentGameTitle = activeCycle?.game?.title;
  const isCurrentGame = activeCycle?.game_id === game.id;
  const phase = dialog.getParam('modalTab') || 'choose';
  const confirmMode = phase === 'confirm-next' ? 'next' : 'current';
  const undoEventId = dialog.getParam('action');
  const previousUndoEventId = dialog.getParam('source');

  async function confirm(mode: 'current' | 'next') {
    setSubmitting(true);
    const result = await setClubGame(game, mode);
    setSubmitting(false);
    if (!result.succeeded) return;
    dialog.setParam('action', result.undoEventId || null);
    dialog.setParam('source', null);
    dialog.setParam('modalTab', 'done');
  }

  async function beginUndo(eventId: string) {
    setSubmitting(true);
    const preview = await previewClubGameUndo(eventId);
    setSubmitting(false);
    if (!preview) return;
    setUndoPreview(preview);
    dialog.setParam('action', eventId);
    dialog.setParam('modalTab', 'confirm-undo');
  }

  async function confirmUndo() {
    if (!undoEventId) return;
    setSubmitting(true);
    const result = await undoClubGameChange(undoEventId, true);
    setSubmitting(false);
    if (!result.succeeded) return;
    setUndoPreview(null);
    dialog.setParam('action', result.redoEventId || null);
    dialog.setParam('source', result.previousUndoEventId || null);
    dialog.setParam('modalTab', 'undone');
  }

  async function redo() {
    if (!undoEventId) return;
    setSubmitting(true);
    const result = await redoClubGameChange(undoEventId);
    setSubmitting(false);
    if (!result.succeeded) return;
    dialog.setParam('action', result.undoEventId || null);
    dialog.setParam('source', null);
    dialog.setParam('modalTab', 'done');
  }

  const dialogTitle = phase === 'choose' ? 'Definir jogo do clube'
    : phase === 'done' ? 'Decisão aplicada'
      : phase === 'undone' ? 'Decisão desfeita'
        : phase === 'confirm-undo' ? 'Desfazer esta decisão?'
          : 'Confirmar decisão';

  return (
    <Dialog open={dialog.open} onOpenChange={open => open ? dialog.show() : dialog.close()}>
      <DialogTrigger asChild>
        {variant === 'icon' ? (
          <button aria-label={`Definir ${game.title} como jogo do clube`} className={cn('club-admin-trigger grid size-8 place-items-center rounded-full bg-amber-500/10 text-amber-300 backdrop-blur transition hover:bg-amber-500/20 hover:text-amber-200', className)}><Crown className="size-4" /></button>
        ) : (
          <button className={cn('club-admin-trigger inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 text-xs font-extrabold text-amber-200 transition hover:bg-amber-500/15', className)}><Crown className="size-4" />Gerenciar jogo do clube</button>
        )}
      </DialogTrigger>
      <DialogContent title={dialogTitle} description={phase === 'choose' ? 'Escolha o que deve acontecer com o ciclo.' : phase === 'confirm-undo' ? 'Revise o que será removido antes de continuar.' : 'A alteração será registrada no histórico administrativo.'}>
        <div className="space-y-3 p-4">
          {!['confirm-undo', 'undone'].includes(phase) && <GameDialogPreview game={game} message="A escolha será registrada no histórico administrativo." />}

          {phase === 'choose' && <>
            <ChoiceButton
              icon={RefreshCw}
              emphasis={activeCycle ? 'secondary' : 'primary'}
              disabled={isCurrentGame}
              title={activeCycle ? `Trocar Jogo de ${formatMonth(currentMonth, { includeYear: false })}` : `Definir como Jogo de ${formatMonth(currentMonth, { includeYear: false })}`}
              description={isCurrentGame ? 'Este já é o jogo do ciclo ativo.' : activeCycle ? `${game.title} substituirá ${currentGameTitle || 'o jogo atual'}. Os comentários atuais serão perdidos.` : `${game.title} será o jogo deste ciclo.`}
              onClick={() => dialog.setParam('modalTab', 'confirm-current')}
            />
            <ChoiceButton
              icon={CalendarPlus2}
              emphasis={activeCycle ? 'primary' : 'secondary'}
              title={activeCycle ? `Encerrar ${formatMonth(currentMonth, { includeYear: false })} e definir ${game.title} para ${formatMonth(nextMonth, { includeYear: false })}` : `Definir como Jogo de ${formatMonth(nextMonth, { includeYear: false })}`}
              description={activeCycle ? `Encerra o ciclo atual e inicia ${formatMonth(nextMonth, { includeYear: false }).toLowerCase()}.` : `Inicia diretamente o ciclo de ${formatMonth(nextMonth, { includeYear: false }).toLowerCase()}.`}
              onClick={() => dialog.setParam('modalTab', 'confirm-next')}
            />
          </>}

          {(phase === 'confirm-current' || phase === 'confirm-next') && <div className="space-y-4">
            <div className="admin-confirm-summary rounded-2xl border border-white/8 bg-white/[0.035] p-4 text-xs leading-relaxed text-zinc-300">
              {confirmMode === 'next' ? <>{activeCycle && <>O Ciclo de {formatMonth(currentMonth, { includeYear: false })} será encerrado. </>}O Ciclo de {formatMonth(nextMonth, { includeYear: false })} começa agora com <strong>{game.title}</strong>.</> : <>O Jogo de {formatMonth(currentMonth, { includeYear: false })} será <strong>{game.title}</strong>.{currentGameTitle && currentGameTitle !== game.title ? <> <strong>{currentGameTitle}</strong> será substituído.</> : null} Os comentários atuais deste ciclo serão perdidos.</>}
            </div>
            <div className="flex gap-2"><button onClick={() => dialog.setParam('modalTab', null)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white/5 text-xs font-bold text-zinc-300"><ArrowLeft className="size-3.5" />Voltar</button><button disabled={submitting} onClick={() => void confirm(confirmMode)} className="h-11 flex-1 rounded-xl bg-amber-500 text-xs font-extrabold text-zinc-950 disabled:opacity-50">{submitting ? 'Confirmando…' : 'Confirmar'}</button></div>
          </div>}

          {phase === 'done' && <div className="space-y-4"><div className="flex items-start gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-4 text-xs leading-relaxed text-zinc-300"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />A decisão foi registrada. Você pode desfazê-la e, se necessário, continuar voltando pelos ciclos anteriores.</div><div className="flex gap-2"><button onClick={() => dialog.close()} className="h-11 flex-1 rounded-xl bg-white/5 text-xs font-bold text-zinc-300">Concluir</button><button disabled={!undoEventId || submitting} onClick={() => undoEventId && void beginUndo(undoEventId)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 text-xs font-extrabold text-zinc-950 disabled:opacity-50"><Undo2 className="size-3.5" />Desfazer</button></div></div>}

          {phase === 'confirm-undo' && undoPreview && <UndoConfirmation preview={undoPreview} submitting={submitting} onBack={() => dialog.setParam('modalTab', 'done')} onConfirm={() => void confirmUndo()} />}

          {phase === 'undone' && <div className="space-y-4"><div className="flex items-start gap-3 rounded-2xl border border-sky-400/15 bg-sky-500/[0.06] p-4 text-xs leading-relaxed text-zinc-300"><RotateCcw className="mt-0.5 size-4 shrink-0 text-sky-300" />A decisão foi desfeita. Você tem 5 minutos para refazê-la. Uma nova definição manual cancela essa possibilidade.</div><div className="grid gap-2 sm:grid-cols-2"><button disabled={!undoEventId || submitting} onClick={() => void redo()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white/7 text-xs font-bold text-zinc-200 disabled:opacity-50"><RotateCcw className="size-3.5" />Refazer</button>{previousUndoEventId && <button disabled={submitting} onClick={() => void beginUndo(previousUndoEventId)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 text-xs font-extrabold text-zinc-950 disabled:opacity-50"><Undo2 className="size-3.5" />Continuar voltando</button>}<button onClick={() => dialog.close()} className="h-11 rounded-xl bg-white/5 text-xs font-bold text-zinc-300 sm:col-span-2">Concluir</button></div></div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceButton({ icon: Icon, emphasis, title, description, disabled, onClick }: { icon: typeof RefreshCw; emphasis: 'primary' | 'secondary'; title: string; description: string; disabled?: boolean; onClick: () => void }) {
  return <button data-emphasis={emphasis} disabled={disabled} onClick={onClick} className="admin-choice flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition disabled:cursor-default disabled:opacity-55"><span className="admin-choice-icon grid size-10 shrink-0 place-items-center rounded-xl"><Icon className="size-4" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><span className="mt-1 block text-[11px] leading-relaxed">{description}</span></span></button>;
}

function UndoConfirmation({ preview, submitting, onBack, onConfirm }: { preview: ClubUndoPreview; submitting: boolean; onBack: () => void; onConfirm: () => void }) {
  const removesCycle = preview.action === 'created';
  return <div className="space-y-4"><div className="rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-4"><div className="flex items-start gap-3"><Trash2 className="mt-0.5 size-4 shrink-0 text-red-300" /><div><strong className="block text-sm text-red-100">{removesCycle ? `O ciclo de ${formatMonth(preview.cycle_month)} será removido` : 'O jogo anterior será restaurado'}</strong><p className="mt-1 text-[11px] leading-relaxed text-red-100/60">{removesCycle ? 'Os dados permanentes por jogo continuam existindo. Serão removidos apenas os dados pertencentes a este ciclo:' : 'Esta troca não remove votos, comentários, progresso ou anotações.'}</p></div></div>{removesCycle && <ul className="mt-3 space-y-1.5 border-t border-red-300/10 pt-3 text-[11px] text-red-100/75"><li>{preview.comments} comentários e {preview.reactions} reações</li><li>{preview.votes} votos da eleição iniciada neste ciclo</li><li>{preview.ranking_rows} posições do ranking encerrado</li><li>{preview.progress_snapshots} estados de progresso e {preview.note_snapshots} anotações históricas</li></ul>}</div><div className="flex gap-2"><button onClick={onBack} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white/5 text-xs font-bold text-zinc-300"><ArrowLeft className="size-3.5" />Voltar</button><button disabled={submitting} onClick={onConfirm} className="h-11 flex-1 rounded-xl bg-red-600 text-xs font-extrabold text-white disabled:opacity-50">{submitting ? 'Desfazendo…' : 'Desfazer decisão'}</button></div></div>;
}
