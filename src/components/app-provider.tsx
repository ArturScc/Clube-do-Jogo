'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, LoaderCircle, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { demoGames, demoMonths, demoProfiles } from '@/lib/demo-data';
import type { AppRole, ClubCycle, Game, Profile } from '@/lib/types';
import { monthKey, shiftMonth } from '@/lib/utils';
import { DEFAULT_THEME, isThemeId, THEME_STORAGE_KEY, type ThemeId } from '@/lib/themes';

interface AppContextValue {
  user: User | { id: string; email?: string } | null;
  profile: Profile | null;
  authLoading: boolean;
  isDemo: boolean;
  role: AppRole;
  isAdmin: boolean;
  selectedMonth: string;
  availableMonths: string[];
  cycles: ClubCycle[];
  activeCycle: ClubCycle | null;
  clubRevision: number;
  isHistorical: boolean;
  theme: ThemeId;
  setSelectedMonth: (month: string) => void;
  setTheme: (theme: ThemeId) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshClubState: () => Promise<void>;
  setClubGame: (game: Game, mode: 'current' | 'next') => Promise<{ succeeded: boolean; undoEventId?: string }>;
  previewClubGameUndo: (eventId: string) => Promise<ClubUndoPreview | null>;
  undoClubGameChange: (eventId: string, forceDelete?: boolean) => Promise<ClubUndoResult>;
  redoClubGameChange: (eventId: string) => Promise<{ succeeded: boolean; undoEventId?: string }>;
  runOperation: <T>(label: string, operation: () => PromiseLike<T>) => Promise<T>;
  runOptimistic: (label: string, apply: () => void, rollback: () => void, operation: () => PromiseLike<unknown>) => Promise<boolean>;
}

export interface ClubUndoPreview {
  event_id: string;
  cycle_month: string;
  action: 'created' | 'game_changed';
  comments: number;
  reactions: number;
  votes: number;
  ranking_rows: number;
  progress_snapshots: number;
  note_snapshots: number;
}

interface ClubUndoResult {
  succeeded: boolean;
  redoEventId?: string;
  previousUndoEventId?: string;
  redoExpiresAt?: string;
}

const AppContext = createContext<AppContextValue | null>(null);
const MONTH_STORAGE_KEY = 'clube-do-jogo:selected-month';

function getOperationError(result: unknown): Error | null {
  if (!result || typeof result !== 'object' || !('error' in result)) return null;
  const error = (result as { error?: unknown }).error;
  if (!error) return null;
  if (error instanceof Error) return error;
  if (typeof error === 'object' && error && 'message' in error) return new Error(String(error.message));
  return new Error(String(error));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<AppContextValue['user']>(isDemo ? { id: 'demo-user', email: 'artur@clubedojogo.com' } : null);
  const [profile, setProfile] = useState<Profile | null>(isDemo ? demoProfiles[0] : null);
  const [authLoading, setAuthLoading] = useState(!isDemo);
  const [selectedMonth, setSelectedMonthState] = useState(monthKey());
  const [availableMonths, setAvailableMonths] = useState<string[]>(isDemo ? demoMonths : [monthKey()]);
  const [role, setRole] = useState<AppRole>(isDemo ? 'admin' : 'member');
  const [cycles, setCycles] = useState<ClubCycle[]>(isDemo ? demoMonths.map((month, index) => ({ month, game_id: 'hades', status: index === 0 ? 'active' : 'closed', game: demoGames[0] })) : []);
  const [clubRevision, setClubRevision] = useState(0);
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);
  const [operations, setOperations] = useState<{ id: string; label: string }[]>([]);
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  const demoClubUndos = useRef(new Map<string, { beforeCycles: ClubCycle[]; beforeMonth: string; afterCycles: ClubCycle[]; afterMonth: string; previousEventId?: string; revertedAt?: number }>());
  const demoLatestClubEvent = useRef<string | undefined>(undefined);

  const showError = useCallback((value: unknown) => {
    const id = crypto.randomUUID();
    const detail = value instanceof Error ? value.message : 'Não foi possível concluir a ação.';
    const message = detail && detail !== 'Não foi possível concluir a ação.'
      ? `Não foi possível concluir a ação. ${detail}`
      : detail;
    setToasts(current => [...current, { id, message }]);
    window.setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), 5000);
  }, []);

  const runOperation = useCallback(async function runOperation<T>(label: string, operation: () => PromiseLike<T>) {
    const id = crypto.randomUUID();
    setOperations(current => [...current, { id, label }]);
    try {
      const result = await operation();
      const error = getOperationError(result);
      if (error) showError(error);
      return result;
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      setOperations(current => current.filter(item => item.id !== id));
    }
  }, [showError]);

  const runOptimistic = useCallback(async (label: string, apply: () => void, rollback: () => void, operation: () => PromiseLike<unknown>) => {
    const id = crypto.randomUUID();
    apply();
    setOperations(current => [...current, { id, label }]);
    try {
      const result = await operation();
      const error = getOperationError(result);
      if (error) throw error;
      return true;
    } catch (error) {
      rollback();
      showError(error);
      return false;
    } finally {
      setOperations(current => current.filter(item => item.id !== id));
    }
  }, [showError]);

  const fetchProfile = useCallback(async (userId: string) => {
    const [{ data }, { data: roleData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
    ]);
    if (data) setProfile(data as Profile);
    setRole(roleData?.role === 'admin' ? 'admin' : 'member');
  }, [supabase]);

  const fetchClubState = useCallback(async () => {
    if (isDemo) return;
    const { data, error } = await supabase.from('club_months').select('month, game_id, status, started_at, closed_at, selected_by, game:games (*)').order('month', { ascending: false });
    if (error) throw error;
    const nextCycles = (data || []) as unknown as ClubCycle[];
    const active = nextCycles.find(item => item.status === 'active') || null;
    const months = nextCycles.map(item => item.month);
    setCycles(nextCycles);
    setAvailableMonths(months.length ? months : [monthKey()]);
    setSelectedMonthState(current => months.includes(current) ? current : active?.month || months[0] || monthKey());
    setClubRevision(current => current + 1);
  }, [isDemo, supabase]);

  useEffect(() => {
    const stored = window.localStorage.getItem(MONTH_STORAGE_KEY);
    if (stored && /^\d{4}-\d{2}$/.test(stored)) {
      queueMicrotask(() => setSelectedMonthState(stored));
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(stored)) queueMicrotask(() => setThemeState(stored));
    else if (stored) window.localStorage.removeItem(THEME_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        void Promise.all([fetchProfile(data.session.user.id), fetchClubState()]).finally(() => setAuthLoading(false));
      } else {
        setAuthLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        void Promise.all([fetchProfile(session.user.id), fetchClubState()]).finally(() => setAuthLoading(false));
      } else {
        setProfile(null);
        setRole('member');
        setAuthLoading(false);
      }
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchClubState, fetchProfile, isDemo, supabase]);

  const setSelectedMonth = useCallback((value: string) => {
    if (!availableMonths.includes(value)) return;
    setSelectedMonthState(value);
    window.localStorage.setItem(MONTH_STORAGE_KEY, value);
  }, [availableMonths]);

  const setClubGame = useCallback(async (game: Game, mode: 'current' | 'next') => {
    const previousCycles = cycles;
    const previousMonth = selectedMonth;
    const active = cycles.find(item => item.status === 'active') || null;
    const targetMonth = mode === 'next' ? shiftMonth(active?.month || monthKey(), 1) : active?.month || monthKey();
    const optimisticCycles = mode === 'next' && active
      ? [{ month: targetMonth, game_id: game.id, status: 'active' as const, started_at: new Date().toISOString(), game }, ...cycles.map(item => item.status === 'active' ? { ...item, status: 'closed' as const, closed_at: new Date().toISOString() } : item)]
      : active
        ? cycles.map(item => item.status === 'active' ? { ...item, game_id: game.id, game } : item)
        : [{ month: targetMonth, game_id: game.id, status: 'active' as const, started_at: new Date().toISOString(), game }, ...cycles];
    const apply = () => {
      setCycles(optimisticCycles);
      setAvailableMonths(optimisticCycles.map(item => item.month).sort().reverse());
      setSelectedMonthState(targetMonth);
      window.localStorage.setItem(MONTH_STORAGE_KEY, targetMonth);
      setClubRevision(current => current + 1);
    };
    const rollback = () => {
      setCycles(previousCycles);
      setAvailableMonths(previousCycles.map(item => item.month).sort().reverse());
      setSelectedMonthState(previousMonth);
      window.localStorage.setItem(MONTH_STORAGE_KEY, previousMonth);
      setClubRevision(current => current + 1);
    };
    if (isDemo) {
      for (const [eventId, undo] of demoClubUndos.current) if (undo.revertedAt) demoClubUndos.current.delete(eventId);
      const undoEventId = `demo-cycle-${crypto.randomUUID()}`;
      demoClubUndos.current.set(undoEventId, { beforeCycles: previousCycles, beforeMonth: previousMonth, afterCycles: optimisticCycles, afterMonth: targetMonth, previousEventId: demoLatestClubEvent.current });
      demoLatestClubEvent.current = undoEventId;
      apply();
      return { succeeded: true, undoEventId };
    }
    let rpcUndoEventId: string | undefined;
    const succeeded = await runOptimistic(
      mode === 'next' ? 'Iniciando novo ciclo…' : active ? 'Trocando jogo do ciclo…' : 'Criando ciclo…',
      apply,
      rollback,
      async () => {
        const result = await supabase.rpc('set_club_game', { selected_game_id: game.id, mode });
        rpcUndoEventId = (result.data as { undo_event_id?: string } | null)?.undo_event_id;
        return result;
      },
    );
    if (succeeded) await fetchClubState();
    return { succeeded, undoEventId: rpcUndoEventId };
  }, [cycles, fetchClubState, isDemo, runOptimistic, selectedMonth, supabase]);

  const previewClubGameUndo = useCallback(async (eventId: string): Promise<ClubUndoPreview | null> => {
    if (isDemo) {
      const undo = demoClubUndos.current.get(eventId);
      return undo ? { event_id: eventId, cycle_month: undo.afterMonth, action: 'created', comments: 0, reactions: 0, votes: 0, ranking_rows: 0, progress_snapshots: 0, note_snapshots: 0 } : null;
    }
    const result = await supabase.rpc('get_club_game_undo_preview', { change_event_id: eventId });
    const error = getOperationError(result);
    if (error) { showError(error); return null; }
    return result.data as ClubUndoPreview | null;
  }, [isDemo, showError, supabase]);

  const undoClubGameChange = useCallback(async (eventId: string, forceDelete = false): Promise<ClubUndoResult> => {
    const demoUndo = demoClubUndos.current.get(eventId);
    if (isDemo && demoUndo) {
      setCycles(demoUndo.beforeCycles);
      setAvailableMonths(demoUndo.beforeCycles.map(item => item.month).sort().reverse());
      setSelectedMonthState(demoUndo.beforeMonth);
      window.localStorage.setItem(MONTH_STORAGE_KEY, demoUndo.beforeMonth);
      setClubRevision(current => current + 1);
      demoUndo.revertedAt = Date.now();
      demoLatestClubEvent.current = demoUndo.previousEventId;
      return { succeeded: true, redoEventId: eventId, previousUndoEventId: demoUndo.previousEventId, redoExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    }
    let rpcRedoEventId: string | undefined;
    let rpcPreviousUndoEventId: string | undefined;
    let rpcRedoExpiresAt: string | undefined;
    const succeeded = await runOptimistic(
      'Revertendo decisão do ciclo…',
      () => undefined,
      () => undefined,
      async () => {
        const result = await supabase.rpc('undo_club_game_change', { change_event_id: eventId, force_delete: forceDelete });
        const data = result.data as { redo_event_id?: string; previous_undo_event_id?: string; redo_expires_at?: string } | null;
        rpcRedoEventId = data?.redo_event_id;
        rpcPreviousUndoEventId = data?.previous_undo_event_id;
        rpcRedoExpiresAt = data?.redo_expires_at;
        return result;
      },
    );
    if (succeeded) await fetchClubState();
    return { succeeded, redoEventId: rpcRedoEventId, previousUndoEventId: rpcPreviousUndoEventId, redoExpiresAt: rpcRedoExpiresAt };
  }, [fetchClubState, isDemo, runOptimistic, supabase]);

  const redoClubGameChange = useCallback(async (eventId: string) => {
    const demoUndo = demoClubUndos.current.get(eventId);
    if (isDemo && demoUndo?.revertedAt && Date.now() - demoUndo.revertedAt <= 5 * 60_000) {
      setCycles(demoUndo.afterCycles);
      setAvailableMonths(demoUndo.afterCycles.map(item => item.month).sort().reverse());
      setSelectedMonthState(demoUndo.afterMonth);
      window.localStorage.setItem(MONTH_STORAGE_KEY, demoUndo.afterMonth);
      setClubRevision(current => current + 1);
      delete demoUndo.revertedAt;
      demoLatestClubEvent.current = eventId;
      return { succeeded: true, undoEventId: eventId };
    }
    let undoEventId: string | undefined;
    const succeeded = await runOptimistic('Refazendo decisão do ciclo…', () => undefined, () => undefined, async () => {
      const result = await supabase.rpc('redo_club_game_change', { change_event_id: eventId });
      undoEventId = (result.data as { undo_event_id?: string } | null)?.undo_event_id;
      return result;
    });
    if (succeeded) await fetchClubState();
    return { succeeded, undoEventId };
  }, [fetchClubState, isDemo, runOptimistic, supabase]);

  const setTheme = useCallback((value: ThemeId) => {
    setThemeState(value);
    document.documentElement.dataset.theme = value;
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, []);

  const signOut = useCallback(async () => {
    if (!isDemo) await runOperation('Saindo da conta…', () => supabase.auth.signOut());
  }, [isDemo, runOperation, supabase]);

  const value = useMemo<AppContextValue>(() => ({
    user,
    profile,
    authLoading,
    isDemo,
    role,
    isAdmin: role === 'admin',
    selectedMonth,
    availableMonths,
    cycles,
    activeCycle: cycles.find(item => item.status === 'active') || null,
    clubRevision,
    isHistorical: selectedMonth !== (cycles.find(item => item.status === 'active')?.month || selectedMonth),
    theme,
    setSelectedMonth,
    setTheme,
    signOut,
    runOperation,
    runOptimistic,
    setClubGame,
    previewClubGameUndo,
    undoClubGameChange,
    redoClubGameChange,
    refreshClubState: fetchClubState,
    refreshProfile: async () => {
      if (user) await fetchProfile(user.id);
    },
  }), [authLoading, availableMonths, clubRevision, cycles, fetchClubState, fetchProfile, isDemo, previewClubGameUndo, profile, redoClubGameChange, role, runOperation, runOptimistic, selectedMonth, setClubGame, setSelectedMonth, setTheme, signOut, theme, undoClubGameChange, user]);

  const currentOperation = operations.at(-1);

  return (
    <AppContext.Provider value={value}>
      {children}
      <AnimatePresence mode="wait">
        {currentOperation && (
          <motion.div
            key={currentOperation.id}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -12, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-[300] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-[#17171c]/95 px-3.5 py-2 text-xs font-bold text-white shadow-xl shadow-black/35 backdrop-blur-md"
          >
            <LoaderCircle className="size-3.5 animate-spin text-violet-300" />
            {currentOperation.label}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="pointer-events-none fixed inset-x-3 top-[max(4rem,calc(env(safe-area-inset-top)+4rem))] z-[310] flex flex-col items-center gap-2" aria-live="assertive">
        <AnimatePresence initial={false}>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              role="alert"
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              className="pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl border border-red-400/20 bg-[#211416]/95 px-4 py-3 text-xs font-semibold leading-relaxed text-red-100 shadow-2xl shadow-black/40 backdrop-blur-md"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-300" />
              <span className="min-w-0 flex-1">{toast.message}</span>
              <button aria-label="Fechar aviso" onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))} className="grid size-6 shrink-0 place-items-center rounded-full text-red-200/60 hover:bg-white/10 hover:text-red-100"><X className="size-3.5" /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp precisa estar dentro de AppProvider.');
  return value;
}
