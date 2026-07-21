-- Clube do Jogo: modelo mensal, timeline, progresso e metadados ricos.
-- Execute este arquivo uma vez no SQL Editor do Supabase.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.games ADD COLUMN IF NOT EXISTS screenshot_urls TEXT[] DEFAULT '{}';
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS trailer_url TEXT;

-- Restaura a dimensão mensal caso migration_remove_vote_month.sql tenha sido aplicada.
ALTER TABLE public.votes ADD COLUMN IF NOT EXISTS vote_month TEXT;
UPDATE public.votes
SET vote_month = TO_CHAR((NOW() AT TIME ZONE 'America/Fortaleza') + INTERVAL '1 month', 'YYYY-MM')
WHERE vote_month IS NULL;
ALTER TABLE public.votes ALTER COLUMN vote_month SET NOT NULL;
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_user_id_game_id_key;
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_user_id_game_id_vote_month_key;
ALTER TABLE public.votes ADD CONSTRAINT votes_user_id_game_id_vote_month_key UNIQUE (user_id, game_id, vote_month);
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_month_format;
ALTER TABLE public.votes ADD CONSTRAINT votes_month_format CHECK (vote_month ~ '^\d{4}-(0[1-9]|1[0-2])$') NOT VALID;

CREATE TABLE IF NOT EXISTS public.club_months (
  month TEXT PRIMARY KEY CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foto imutável do ranking no instante em que a votação encerra. O mês de
-- votação é o mês anterior ao mês-alvo (ex.: outubro escolhe novembro).
CREATE TABLE IF NOT EXISTS public.ranking_snapshots (
  voting_month TEXT NOT NULL CHECK (voting_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  target_month TEXT NOT NULL CHECK (target_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position > 0),
  vote_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  voter_ids UUID[] NOT NULL DEFAULT '{}',
  completed_user_ids UUID[] NOT NULL DEFAULT '{}',
  playtime_points NUMERIC NOT NULL,
  rating_multiplier NUMERIC NOT NULL,
  total_points NUMERIC NOT NULL,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (voting_month, game_id),
  UNIQUE (voting_month, position)
);

CREATE TABLE IF NOT EXISTS public.game_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  club_month TEXT NOT NULL CHECK (club_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'started', 'finished')),
  rating SMALLINT CHECK (rating BETWEEN 1 AND 10),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, game_id, club_month)
);

CREATE TABLE IF NOT EXISTS public.club_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  club_month TEXT NOT NULL CHECK (club_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  parent_id UUID REFERENCES public.club_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(body)) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.club_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  club_month TEXT NOT NULL,
  emoji TEXT NOT NULL CHECK (CHAR_LENGTH(emoji) BETWEEN 1 AND 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS votes_vote_month_idx ON public.votes(vote_month);
CREATE INDEX IF NOT EXISTS ranking_snapshots_target_idx ON public.ranking_snapshots(target_month, position);
CREATE INDEX IF NOT EXISTS progress_month_game_idx ON public.game_progress(club_month, game_id);
CREATE INDEX IF NOT EXISTS comments_month_game_idx ON public.club_comments(club_month, game_id, created_at);
CREATE INDEX IF NOT EXISTS reactions_comment_idx ON public.comment_reactions(comment_id);

-- Consolida automaticamente todo vencedor cuja votação já encerrou.
-- vote_month é o mês em que o jogo será jogado. Portanto, votos para agosto
-- são feitos durante julho e ficam imutáveis a partir de 1º de agosto.
CREATE OR REPLACE FUNCTION public.finalize_closed_club_months()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH eligible_months AS (
    SELECT DISTINCT
      vote_month AS target_month,
      TO_CHAR(TO_DATE(vote_month || '-01', 'YYYY-MM-DD') - INTERVAL '1 month', 'YYYY-MM') AS voting_month,
      (TO_DATE(vote_month || '-01', 'YYYY-MM-DD')::TIMESTAMP AT TIME ZONE 'America/Fortaleza') AS cutoff
    FROM public.votes
    WHERE vote_month <= TO_CHAR(NOW() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM')
  ), vote_counts AS (
    SELECT
      em.voting_month,
      v.vote_month AS target_month,
      em.cutoff,
      v.game_id,
      COUNT(*)::INTEGER AS vote_count,
      ARRAY_AGG(DISTINCT v.user_id) AS voter_ids
    FROM public.votes v
    JOIN eligible_months em ON em.target_month = v.vote_month
    GROUP BY em.voting_month, v.vote_month, em.cutoff, v.game_id
  ), frozen_counts AS (
    SELECT
      vc.*,
      COALESCE(completed.completed_count, 0)::INTEGER AS completed_count,
      COALESCE(completed.user_ids, ARRAY[]::UUID[]) AS completed_user_ids
    FROM vote_counts vc
    LEFT JOIN LATERAL (
      SELECT
        COUNT(DISTINCT cg.user_id) AS completed_count,
        ARRAY_AGG(DISTINCT cg.user_id) AS user_ids
      FROM public.completed_games cg
      WHERE cg.game_id = vc.game_id AND cg.created_at < vc.cutoff
    ) completed ON TRUE
  ), scores AS (
    SELECT
      fc.voting_month,
      fc.target_month,
      fc.game_id,
      g.title,
      fc.vote_count,
      fc.completed_count,
      fc.voter_ids,
      fc.completed_user_ids,
      CASE
        WHEN g.duration_hours < 8 THEN 1
        WHEN g.duration_hours <= 15 THEN 3
        WHEN g.duration_hours <= 20 THEN 2
        ELSE 1
      END AS playtime_points,
      COALESCE(NULLIF(g.average_rating, 0), 50) / 100.0 AS rating_multiplier,
      (
        fc.vote_count * 2 *
        CASE
          WHEN g.duration_hours < 8 THEN 1
          WHEN g.duration_hours <= 15 THEN 3
          WHEN g.duration_hours <= 20 THEN 2
          ELSE 1
        END * COALESCE(NULLIF(g.average_rating, 0), 50) / 100.0
      ) / GREATEST(fc.completed_count * 2, 1) AS total_points
    FROM frozen_counts fc
    JOIN public.games g ON g.id = fc.game_id
  ), positioned AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY voting_month ORDER BY total_points DESC, title)::INTEGER AS position
    FROM scores
  )
  INSERT INTO public.ranking_snapshots (
    voting_month, target_month, game_id, position, vote_count, completed_count,
    voter_ids, completed_user_ids, playtime_points, rating_multiplier, total_points
  )
  SELECT
    voting_month, target_month, game_id, position, vote_count, completed_count,
    voter_ids, completed_user_ids, playtime_points, rating_multiplier, ROUND(total_points::NUMERIC, 1)
  FROM positioned
  ON CONFLICT (voting_month, game_id) DO NOTHING;

  INSERT INTO public.club_months (month, game_id)
  SELECT target_month, game_id
  FROM public.ranking_snapshots
  WHERE position = 1
  ON CONFLICT (month) DO UPDATE SET game_id = EXCLUDED.game_id;
END;
$$;

-- Congela primeiro os rankings já encerrados; só depois permite que uma
-- finalização atual altere completed_games.
CREATE OR REPLACE FUNCTION public.freeze_rankings_before_completion_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.finalize_closed_club_months();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS freeze_rankings_before_completed_games_change ON public.completed_games;
CREATE TRIGGER freeze_rankings_before_completed_games_change
BEFORE INSERT OR DELETE ON public.completed_games
FOR EACH STATEMENT EXECUTE FUNCTION public.freeze_rankings_before_completion_change();

CREATE OR REPLACE FUNCTION public.enforce_reaction_type_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE different_types INTEGER;
BEGIN
  SELECT COUNT(DISTINCT emoji) INTO different_types
  FROM public.comment_reactions
  WHERE comment_id = NEW.comment_id;
  IF NOT EXISTS (SELECT 1 FROM public.comment_reactions WHERE comment_id = NEW.comment_id AND emoji = NEW.emoji)
     AND different_types >= 10 THEN
    RAISE EXCEPTION 'Cada comentário aceita no máximo 10 emojis diferentes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS limit_comment_reaction_types ON public.comment_reactions;
CREATE TRIGGER limit_comment_reaction_types
BEFORE INSERT ON public.comment_reactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_reaction_type_limit();

ALTER TABLE public.club_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Meses visiveis para autenticados" ON public.club_months;
CREATE POLICY "Meses visiveis para autenticados" ON public.club_months FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Rankings historicos visiveis para autenticados" ON public.ranking_snapshots;
CREATE POLICY "Rankings historicos visiveis para autenticados" ON public.ranking_snapshots FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Progresso visivel para autenticados" ON public.game_progress;
CREATE POLICY "Progresso visivel para autenticados" ON public.game_progress FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Criar progresso atual proprio" ON public.game_progress;
CREATE POLICY "Criar progresso atual proprio" ON public.game_progress FOR INSERT WITH CHECK (
  auth.uid() = user_id AND club_month = TO_CHAR(NOW() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM')
);
DROP POLICY IF EXISTS "Atualizar progresso atual proprio" ON public.game_progress;
CREATE POLICY "Atualizar progresso atual proprio" ON public.game_progress FOR UPDATE USING (
  auth.uid() = user_id AND club_month = TO_CHAR(NOW() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM')
);

DROP POLICY IF EXISTS "Comentarios visiveis para autenticados" ON public.club_comments;
CREATE POLICY "Comentarios visiveis para autenticados" ON public.club_comments FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Criar comentario no mes atual" ON public.club_comments;
CREATE POLICY "Criar comentario no mes atual" ON public.club_comments FOR INSERT WITH CHECK (
  auth.uid() = user_id AND club_month = TO_CHAR(NOW() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM')
);
DROP POLICY IF EXISTS "Editar comentario atual proprio" ON public.club_comments;
CREATE POLICY "Editar comentario atual proprio" ON public.club_comments FOR UPDATE USING (
  auth.uid() = user_id AND club_month = TO_CHAR(NOW() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM')
);
DROP POLICY IF EXISTS "Excluir comentario atual proprio" ON public.club_comments;
CREATE POLICY "Excluir comentario atual proprio" ON public.club_comments FOR DELETE USING (
  auth.uid() = user_id AND club_month = TO_CHAR(NOW() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM')
);

DROP POLICY IF EXISTS "Reacoes visiveis para autenticados" ON public.comment_reactions;
CREATE POLICY "Reacoes visiveis para autenticados" ON public.comment_reactions FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Criar reacao no mes atual" ON public.comment_reactions;
CREATE POLICY "Criar reacao no mes atual" ON public.comment_reactions FOR INSERT WITH CHECK (
  auth.uid() = user_id AND club_month = TO_CHAR(NOW() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM')
);
DROP POLICY IF EXISTS "Excluir reacao atual propria" ON public.comment_reactions;
CREATE POLICY "Excluir reacao atual propria" ON public.comment_reactions FOR DELETE USING (
  auth.uid() = user_id AND club_month = TO_CHAR(NOW() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM')
);

-- Votos só podem mudar enquanto o mês-alvo ainda não começou.
DROP POLICY IF EXISTS "Permitir inserção de voto próprio" ON public.votes;
CREATE POLICY "Permitir inserção de voto próprio" ON public.votes FOR INSERT WITH CHECK (
  auth.uid() = user_id AND vote_month > TO_CHAR(NOW() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM')
);
DROP POLICY IF EXISTS "Permitir exclusão de voto próprio" ON public.votes;
CREATE POLICY "Permitir exclusão de voto próprio" ON public.votes FOR DELETE USING (
  auth.uid() = user_id AND vote_month > TO_CHAR(NOW() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM')
);

GRANT EXECUTE ON FUNCTION public.finalize_closed_club_months() TO authenticated;
