'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { demoMonths, demoProfiles } from '@/lib/demo-data';
import type { Profile } from '@/lib/types';
import { monthKey } from '@/lib/utils';

interface AppContextValue {
  user: User | { id: string; email?: string } | null;
  profile: Profile | null;
  authLoading: boolean;
  isDemo: boolean;
  selectedMonth: string;
  availableMonths: string[];
  isHistorical: boolean;
  setSelectedMonth: (month: string) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);
const MONTH_STORAGE_KEY = 'clube-do-jogo:selected-month';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<AppContextValue['user']>(isDemo ? { id: 'demo-user', email: 'artur@clubedojogo.com' } : null);
  const [profile, setProfile] = useState<Profile | null>(isDemo ? demoProfiles[0] : null);
  const [authLoading, setAuthLoading] = useState(!isDemo);
  const [selectedMonth, setSelectedMonthState] = useState(monthKey());
  const [availableMonths, setAvailableMonths] = useState<string[]>(isDemo ? demoMonths : [monthKey()]);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data) setProfile(data as Profile);
  }, [supabase]);

  const fetchAvailableMonths = useCallback(async () => {
    if (isDemo) return;
    const current = monthKey();
    const [{ data: clubMonths }, { data: votes }] = await Promise.all([
      supabase.from('club_months').select('month').lte('month', current),
      supabase.from('votes').select('vote_month'),
    ]);
    const months = new Set<string>([current]);
    clubMonths?.forEach(item => item.month && months.add(item.month));
    votes?.forEach(item => {
      if (item.vote_month && item.vote_month <= current) months.add(item.vote_month);
    });
    setAvailableMonths(Array.from(months).sort().reverse());
  }, [isDemo, supabase]);

  useEffect(() => {
    const stored = window.localStorage.getItem(MONTH_STORAGE_KEY);
    if (stored && /^\d{4}-\d{2}$/.test(stored) && stored <= monthKey()) {
      queueMicrotask(() => setSelectedMonthState(stored));
    }
  }, []);

  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        void fetchProfile(data.session.user.id);
        void fetchAvailableMonths();
      }
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        void fetchProfile(session.user.id);
        void fetchAvailableMonths();
      } else {
        setProfile(null);
      }
      setAuthLoading(false);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchAvailableMonths, fetchProfile, isDemo, supabase]);

  const setSelectedMonth = useCallback((value: string) => {
    if (value > monthKey()) return;
    setSelectedMonthState(value);
    window.localStorage.setItem(MONTH_STORAGE_KEY, value);
  }, []);

  const signOut = useCallback(async () => {
    if (!isDemo) await supabase.auth.signOut();
  }, [isDemo, supabase]);

  const value = useMemo<AppContextValue>(() => ({
    user,
    profile,
    authLoading,
    isDemo,
    selectedMonth,
    availableMonths,
    isHistorical: selectedMonth < monthKey(),
    setSelectedMonth,
    signOut,
    refreshProfile: async () => {
      if (user) await fetchProfile(user.id);
    },
  }), [authLoading, availableMonths, fetchProfile, isDemo, profile, selectedMonth, setSelectedMonth, signOut, user]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp precisa estar dentro de AppProvider.');
  return value;
}
