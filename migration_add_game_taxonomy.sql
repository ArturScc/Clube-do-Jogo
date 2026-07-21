-- Execute uma vez no SQL Editor do Supabase.
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS genres TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS platforms TEXT[] DEFAULT '{}';
