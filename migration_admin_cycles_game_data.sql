-- Clube do Jogo: cargos, ciclos manuais e dados permanentes por jogo.
-- Execute depois de schema.sql e migration_monthly_club.sql.

-- ---------------------------------------------------------------------------
-- 1. Cargos administrativos
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'member' FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_default_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_default_role_after_profile ON public.profiles;
CREATE TRIGGER create_default_role_after_profile
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.create_default_user_role();

CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = check_user_id AND role = 'admin'
  );
$$;

CREATE TABLE IF NOT EXISTS public.role_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  previous_role TEXT NOT NULL CHECK (previous_role IN ('member', 'admin')),
  new_role TEXT NOT NULL CHECK (new_role IN ('member', 'admin')),
  changed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id UUID, new_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_role TEXT;
  admin_count INTEGER;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar cargos';
  END IF;
  IF new_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'Cargo inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;
  SELECT role INTO previous_role
  FROM public.user_roles
  WHERE user_id = target_user_id
  FOR UPDATE;
  previous_role := COALESCE(previous_role, 'member');

  IF previous_role = new_role THEN
    RETURN;
  END IF;

  IF previous_role = 'admin' AND new_role = 'member' THEN
    SELECT COUNT(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'O sistema precisa manter pelo menos um administrador';
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role, updated_at, updated_by)
  VALUES (target_user_id, new_role, NOW(), auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role, updated_at = NOW(), updated_by = auth.uid();

  INSERT INTO public.role_events (target_user_id, previous_role, new_role, changed_by)
  VALUES (target_user_id, previous_role, new_role, auth.uid());
END;
$$;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cargos visiveis para autenticados" ON public.user_roles;
CREATE POLICY "Cargos visiveis para autenticados" ON public.user_roles
FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Historico de cargos visivel para admins" ON public.role_events;
CREATE POLICY "Historico de cargos visivel para admins" ON public.role_events
FOR SELECT USING (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.role_events FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.role_events TO authenticated;
REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Ciclos mensais controlados pelo encontro, não pelo calendário
-- ---------------------------------------------------------------------------

ALTER TABLE public.club_months ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'closed';
ALTER TABLE public.club_months ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.club_months ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.club_months ADD COLUMN IF NOT EXISTS selected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.club_months ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.club_months ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.club_months DROP CONSTRAINT IF EXISTS club_months_status_check;
ALTER TABLE public.club_months ADD CONSTRAINT club_months_status_check CHECK (status IN ('active', 'closed'));

UPDATE public.club_months
SET status = 'closed',
    started_at = COALESCE(started_at, created_at),
    closed_at = COALESCE(closed_at, finalized_at)
WHERE status IS DISTINCT FROM 'closed' OR started_at IS NULL OR closed_at IS NULL;

WITH latest AS (
  SELECT month FROM public.club_months ORDER BY month DESC LIMIT 1
)
UPDATE public.club_months cm
SET status = 'active', closed_at = NULL
FROM latest
WHERE cm.month = latest.month;

CREATE UNIQUE INDEX IF NOT EXISTS club_months_one_active_idx
ON public.club_months ((status)) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.club_cycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_month TEXT NOT NULL CHECK (cycle_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  action TEXT NOT NULL CHECK (action IN ('created', 'game_changed', 'closed')),
  previous_game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  performed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.club_cycle_events ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ;
ALTER TABLE public.club_cycle_events ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.club_cycle_events ADD COLUMN IF NOT EXISTS redo_invalidated_at TIMESTAMPTZ;

-- Criada antes das funções de encerramento para que o estado das anotações
-- possa ser fotografado na mesma transação que fecha o ciclo.
CREATE TABLE IF NOT EXISTS public.game_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(body) <= 10000),
  image_data_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (CHAR_LENGTH(TRIM(body)) > 0 OR image_data_url IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.cycle_progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_month TEXT NOT NULL REFERENCES public.club_months(month) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'started', 'finished')),
  rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 10),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_month, game_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.cycle_note_snapshots (
  cycle_month TEXT NOT NULL REFERENCES public.club_months(month) ON DELETE CASCADE,
  note_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  image_data_url TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cycle_month, note_id)
);

CREATE INDEX IF NOT EXISTS cycle_progress_snapshots_lookup_idx
ON public.cycle_progress_snapshots(cycle_month, game_id);
CREATE INDEX IF NOT EXISTS cycle_note_snapshots_lookup_idx
ON public.cycle_note_snapshots(user_id, cycle_month, game_id, created_at);

CREATE OR REPLACE FUNCTION public.freeze_cycle_game_state(snapshot_cycle TEXT, snapshot_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.cycle_progress_snapshots (
    cycle_month, game_id, user_id, status, rating, started_at, finished_at
  )
  SELECT
    snapshot_cycle,
    snapshot_game_id,
    profile.id,
    COALESCE(progress.status, 'not_started'),
    progress.rating,
    progress.started_at,
    progress.finished_at
  FROM public.profiles profile
  LEFT JOIN public.game_progress progress
    ON progress.user_id = profile.id AND progress.game_id = snapshot_game_id
  ON CONFLICT (cycle_month, game_id, user_id) DO NOTHING;

  INSERT INTO public.cycle_note_snapshots (
    cycle_month, note_id, user_id, game_id, body, image_data_url, created_at, updated_at
  )
  SELECT
    snapshot_cycle, note.id, note.user_id, note.game_id, note.body,
    note.image_data_url, note.created_at, note.updated_at
  FROM public.game_notes note
  WHERE note.game_id = snapshot_game_id
  ON CONFLICT (cycle_month, note_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.freeze_cycle_ranking(voting_cycle TEXT, target_cycle TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH vote_counts AS (
    SELECT
      v.game_id,
      COUNT(*)::INTEGER AS vote_count,
      ARRAY_AGG(DISTINCT v.user_id) AS voter_ids
    FROM public.votes v
    WHERE v.vote_month = target_cycle
    GROUP BY v.game_id
  ), frozen_counts AS (
    SELECT
      vc.*,
      COALESCE(progress.completed_count, 0)::INTEGER AS completed_count,
      COALESCE(progress.user_ids, ARRAY[]::UUID[]) AS completed_user_ids
    FROM vote_counts vc
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS completed_count, ARRAY_AGG(gp.user_id) AS user_ids
      FROM public.game_progress gp
      WHERE gp.game_id = vc.game_id AND gp.status = 'finished'
    ) progress ON TRUE
  ), scores AS (
    SELECT
      fc.*,
      g.title,
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
    SELECT *, ROW_NUMBER() OVER (ORDER BY total_points DESC, title)::INTEGER AS position
    FROM scores
  )
  INSERT INTO public.ranking_snapshots (
    voting_month, target_month, game_id, position, vote_count, completed_count,
    voter_ids, completed_user_ids, playtime_points, rating_multiplier, total_points
  )
  SELECT
    voting_cycle, target_cycle, game_id, position, vote_count, completed_count,
    voter_ids, completed_user_ids, playtime_points, rating_multiplier,
    ROUND(total_points::NUMERIC, 1)
  FROM positioned
  ON CONFLICT (voting_month, game_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_club_game(selected_game_id UUID, mode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_cycle public.club_months%ROWTYPE;
  next_cycle TEXT;
  previous_game UUID;
  action_event_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem definir o jogo do mês';
  END IF;
  IF mode NOT IN ('current', 'next') THEN
    RAISE EXCEPTION 'Ação de ciclo inválida';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.games WHERE id = selected_game_id) THEN
    RAISE EXCEPTION 'Jogo não encontrado';
  END IF;

  -- Qualquer decisão manual inicia uma nova linha do tempo e invalida redos
  -- pendentes de decisões que haviam sido desfeitas.
  UPDATE public.club_cycle_events
  SET redo_invalidated_at = NOW()
  WHERE reverted_at IS NOT NULL AND redo_invalidated_at IS NULL;

  LOCK TABLE public.club_months IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO active_cycle
  FROM public.club_months
  WHERE status = 'active'
  FOR UPDATE;

  IF mode = 'current' THEN
    IF active_cycle.month IS NULL THEN
      next_cycle := TO_CHAR(NOW() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM');
      IF EXISTS (SELECT 1 FROM public.club_months WHERE month = next_cycle) THEN
        RAISE EXCEPTION 'O ciclo de % já foi encerrado e não pode ser reaberto', next_cycle;
      END IF;
      INSERT INTO public.club_months (
        month, game_id, status, started_at, finalized_at, selected_by, updated_by
      ) VALUES (
        next_cycle, selected_game_id, 'active', NOW(), NOW(), auth.uid(), auth.uid()
      );
      INSERT INTO public.club_cycle_events (cycle_month, action, game_id, performed_by)
      VALUES (next_cycle, 'created', selected_game_id, auth.uid())
      RETURNING id INTO action_event_id;
      RETURN jsonb_build_object('month', next_cycle, 'game_id', selected_game_id, 'status', 'active', 'undo_event_id', action_event_id);
    END IF;

    previous_game := active_cycle.game_id;
    IF previous_game = selected_game_id THEN
      RETURN jsonb_build_object('month', active_cycle.month, 'game_id', selected_game_id, 'status', 'active');
    END IF;
    UPDATE public.club_months
    SET game_id = selected_game_id, updated_at = NOW(), updated_by = auth.uid(), selected_by = auth.uid()
    WHERE month = active_cycle.month;
    INSERT INTO public.club_cycle_events (
      cycle_month, action, previous_game_id, game_id, performed_by
    ) VALUES (
      active_cycle.month, 'game_changed', previous_game, selected_game_id, auth.uid()
    ) RETURNING id INTO action_event_id;
    RETURN jsonb_build_object('month', active_cycle.month, 'game_id', selected_game_id, 'status', 'active', 'undo_event_id', action_event_id);
  END IF;

  IF active_cycle.month IS NULL THEN
    next_cycle := TO_CHAR((NOW() AT TIME ZONE 'America/Fortaleza') + INTERVAL '1 month', 'YYYY-MM');
    IF EXISTS (SELECT 1 FROM public.club_months WHERE month = next_cycle) THEN
      RAISE EXCEPTION 'O ciclo de % já existe e não pode ser recriado', next_cycle;
    END IF;
    INSERT INTO public.club_months (
      month, game_id, status, started_at, finalized_at, selected_by, updated_by
    ) VALUES (
      next_cycle, selected_game_id, 'active', NOW(), NOW(), auth.uid(), auth.uid()
    );
    INSERT INTO public.club_cycle_events (cycle_month, action, game_id, performed_by)
    VALUES (next_cycle, 'created', selected_game_id, auth.uid())
    RETURNING id INTO action_event_id;
    RETURN jsonb_build_object('month', next_cycle, 'game_id', selected_game_id, 'status', 'active', 'undo_event_id', action_event_id);
  END IF;

  next_cycle := TO_CHAR(
    TO_DATE(active_cycle.month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month',
    'YYYY-MM'
  );
  IF EXISTS (SELECT 1 FROM public.club_months WHERE month = next_cycle) THEN
    RAISE EXCEPTION 'O ciclo de % já existe e não pode ser recriado', next_cycle;
  END IF;

  PERFORM public.freeze_cycle_game_state(active_cycle.month, active_cycle.game_id);
  PERFORM public.freeze_cycle_ranking(active_cycle.month, next_cycle);
  UPDATE public.club_months
  SET status = 'closed', closed_at = NOW(), updated_at = NOW(), updated_by = auth.uid()
  WHERE month = active_cycle.month;
  INSERT INTO public.club_cycle_events (
    cycle_month, action, previous_game_id, game_id, performed_by
  ) VALUES (
    active_cycle.month, 'closed', active_cycle.game_id, active_cycle.game_id, auth.uid()
  );

  INSERT INTO public.club_months (
    month, game_id, status, started_at, finalized_at, selected_by, updated_by
  ) VALUES (
    next_cycle, selected_game_id, 'active', NOW(), NOW(), auth.uid(), auth.uid()
  );
  INSERT INTO public.club_cycle_events (cycle_month, action, game_id, performed_by)
  VALUES (next_cycle, 'created', selected_game_id, auth.uid())
  RETURNING id INTO action_event_id;

  RETURN jsonb_build_object('month', next_cycle, 'game_id', selected_game_id, 'status', 'active', 'undo_event_id', action_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_club_game_undo_preview(change_event_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN NOT public.is_admin(auth.uid()) THEN
    (SELECT jsonb_build_object('error', 'unauthorized'))
  ELSE jsonb_build_object(
    'event_id', event.id,
    'cycle_month', event.cycle_month,
    'action', event.action,
    'comments', (SELECT COUNT(*) FROM public.club_comments WHERE club_month = event.cycle_month),
    'reactions', (SELECT COUNT(*) FROM public.comment_reactions WHERE club_month = event.cycle_month),
    'votes', (SELECT COUNT(*) FROM public.votes WHERE vote_month = TO_CHAR(TO_DATE(event.cycle_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month', 'YYYY-MM')),
    'ranking_rows', (SELECT COUNT(*) FROM public.ranking_snapshots WHERE voting_month = TO_CHAR(TO_DATE(event.cycle_month || '-01', 'YYYY-MM-DD') - INTERVAL '1 month', 'YYYY-MM')),
    'progress_snapshots', (SELECT COUNT(*) FROM public.cycle_progress_snapshots WHERE cycle_month = TO_CHAR(TO_DATE(event.cycle_month || '-01', 'YYYY-MM-DD') - INTERVAL '1 month', 'YYYY-MM')),
    'note_snapshots', (SELECT COUNT(*) FROM public.cycle_note_snapshots WHERE cycle_month = TO_CHAR(TO_DATE(event.cycle_month || '-01', 'YYYY-MM-DD') - INTERVAL '1 month', 'YYYY-MM'))
  ) END
  FROM public.club_cycle_events event
  WHERE event.id = change_event_id AND event.reverted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.undo_club_game_change(change_event_id UUID, force_delete BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  change_event public.club_cycle_events%ROWTYPE;
  previous_cycle TEXT;
  current_cycle public.club_months%ROWTYPE;
  previous_undo_event_id UUID;
  activity_count INTEGER;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Apenas administradores podem reverter decisões de ciclo'; END IF;

  LOCK TABLE public.club_months IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO change_event FROM public.club_cycle_events WHERE id = change_event_id FOR UPDATE;
  IF change_event.id IS NULL OR change_event.reverted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta decisão não está mais disponível para reversão';
  END IF;

  SELECT * INTO current_cycle FROM public.club_months WHERE month = change_event.cycle_month FOR UPDATE;
  IF current_cycle.month IS NULL OR current_cycle.status <> 'active' OR current_cycle.game_id <> change_event.game_id THEN
    RAISE EXCEPTION 'O ciclo já mudou depois desta decisão e não pode ser revertido com segurança';
  END IF;

  IF change_event.action = 'game_changed' THEN
    UPDATE public.club_months
    SET game_id = change_event.previous_game_id, updated_at = NOW(), updated_by = auth.uid()
    WHERE month = change_event.cycle_month;
    UPDATE public.club_cycle_events SET reverted_at = NOW(), reverted_by = auth.uid() WHERE id = change_event.id;
    SELECT id INTO previous_undo_event_id FROM public.club_cycle_events
    WHERE cycle_month = change_event.cycle_month AND action IN ('created', 'game_changed') AND reverted_at IS NULL
    ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('month', change_event.cycle_month, 'status', 'active', 'redo_event_id', change_event.id, 'redo_expires_at', NOW() + INTERVAL '5 minutes', 'previous_undo_event_id', previous_undo_event_id);
  END IF;

  IF change_event.action <> 'created' THEN
    RAISE EXCEPTION 'Este tipo de decisão não pode ser revertido';
  END IF;

  SELECT
    (SELECT COUNT(*) FROM public.club_comments WHERE club_month = change_event.cycle_month) +
    (SELECT COUNT(*) FROM public.comment_reactions WHERE club_month = change_event.cycle_month) +
    (SELECT COUNT(*) FROM public.votes WHERE vote_month = TO_CHAR(TO_DATE(change_event.cycle_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month', 'YYYY-MM'))
  INTO activity_count;
  IF activity_count > 0 AND NOT force_delete THEN
    RAISE EXCEPTION 'A reversão removerá atividade do ciclo; confirme a exclusão para continuar';
  END IF;

  previous_cycle := TO_CHAR(TO_DATE(change_event.cycle_month || '-01', 'YYYY-MM-DD') - INTERVAL '1 month', 'YYYY-MM');
  IF EXISTS (SELECT 1 FROM public.club_months WHERE month = previous_cycle AND status = 'closed') THEN
    DELETE FROM public.ranking_snapshots WHERE voting_month = previous_cycle;
    DELETE FROM public.cycle_progress_snapshots WHERE cycle_month = previous_cycle;
    DELETE FROM public.cycle_note_snapshots WHERE cycle_month = previous_cycle;
    DELETE FROM public.votes WHERE vote_month = TO_CHAR(TO_DATE(change_event.cycle_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month', 'YYYY-MM');
    DELETE FROM public.club_comments WHERE club_month = change_event.cycle_month;
    DELETE FROM public.club_months WHERE month = change_event.cycle_month;
    UPDATE public.club_months
    SET status = 'active', closed_at = NULL, updated_at = NOW(), updated_by = auth.uid()
    WHERE month = previous_cycle;
    UPDATE public.club_cycle_events
    SET reverted_at = NOW(), reverted_by = auth.uid()
    WHERE (id = change_event.id OR (cycle_month = previous_cycle AND action = 'closed' AND reverted_at IS NULL));
    SELECT id INTO previous_undo_event_id FROM public.club_cycle_events
    WHERE cycle_month = previous_cycle AND action IN ('created', 'game_changed') AND reverted_at IS NULL
    ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('month', previous_cycle, 'status', 'active', 'redo_event_id', change_event.id, 'redo_expires_at', NOW() + INTERVAL '5 minutes', 'previous_undo_event_id', previous_undo_event_id);
  END IF;

  DELETE FROM public.votes WHERE vote_month = TO_CHAR(TO_DATE(change_event.cycle_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month', 'YYYY-MM');
  DELETE FROM public.club_comments WHERE club_month = change_event.cycle_month;
  DELETE FROM public.club_months WHERE month = change_event.cycle_month;
  UPDATE public.club_cycle_events SET reverted_at = NOW(), reverted_by = auth.uid() WHERE id = change_event.id;
  RETURN jsonb_build_object('status', 'removed', 'redo_event_id', change_event.id, 'redo_expires_at', NOW() + INTERVAL '5 minutes');
END;
$$;

CREATE OR REPLACE FUNCTION public.redo_club_game_change(change_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  change_event public.club_cycle_events%ROWTYPE;
  previous_cycle TEXT;
  mode_to_apply TEXT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Apenas administradores podem refazer decisões de ciclo'; END IF;
  SELECT * INTO change_event FROM public.club_cycle_events WHERE id = change_event_id FOR UPDATE;
  IF change_event.id IS NULL OR change_event.reverted_at IS NULL OR change_event.redo_invalidated_at IS NOT NULL OR change_event.reverted_at + INTERVAL '5 minutes' < NOW() THEN
    RAISE EXCEPTION 'O prazo para refazer esta decisão expirou';
  END IF;
  previous_cycle := TO_CHAR(TO_DATE(change_event.cycle_month || '-01', 'YYYY-MM-DD') - INTERVAL '1 month', 'YYYY-MM');
  IF change_event.action = 'created' AND EXISTS (SELECT 1 FROM public.club_months WHERE month = previous_cycle AND status = 'active') THEN
    mode_to_apply := 'next';
  ELSE
    mode_to_apply := 'current';
  END IF;
  RETURN public.set_club_game(change_event.game_id, mode_to_apply);
END;
$$;

-- Desativa a antiga virada automática por data sem quebrar clientes antigos.
CREATE OR REPLACE FUNCTION public.finalize_closed_club_months()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;

ALTER TABLE public.club_cycle_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Eventos de ciclo visiveis para autenticados" ON public.club_cycle_events;
CREATE POLICY "Eventos de ciclo visiveis para autenticados" ON public.club_cycle_events
FOR SELECT USING (auth.role() = 'authenticated');
REVOKE INSERT, UPDATE, DELETE ON public.club_months FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.club_cycle_events FROM authenticated;
GRANT SELECT ON public.club_cycle_events TO authenticated;
REVOKE ALL ON FUNCTION public.set_club_game(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_club_game_undo_preview(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_club_game_change(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redo_club_game_change(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.freeze_cycle_ranking(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.freeze_cycle_game_state(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_club_game(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_club_game_undo_preview(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_club_game_change(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redo_club_game_change(UUID) TO authenticated;

-- Votos pertencem à eleição do ciclo seguinte ao ciclo ativo.
DROP POLICY IF EXISTS "Permitir inserção de voto próprio" ON public.votes;
CREATE POLICY "Permitir inserção de voto próprio" ON public.votes
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND vote_month = (
    SELECT TO_CHAR(TO_DATE(month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month', 'YYYY-MM')
    FROM public.club_months WHERE status = 'active'
  )
);
DROP POLICY IF EXISTS "Permitir exclusão de voto próprio" ON public.votes;
CREATE POLICY "Permitir exclusão de voto próprio" ON public.votes
FOR DELETE USING (
  auth.uid() = user_id
  AND vote_month = (
    SELECT TO_CHAR(TO_DATE(month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month', 'YYYY-MM')
    FROM public.club_months WHERE status = 'active'
  )
);

-- ---------------------------------------------------------------------------
-- 3. Progresso permanente por usuário + jogo
-- ---------------------------------------------------------------------------

-- As políticas mensais dependem da coluna antiga e precisam sair antes dela.
DROP POLICY IF EXISTS "Criar progresso atual proprio" ON public.game_progress;
DROP POLICY IF EXISTS "Atualizar progresso atual proprio" ON public.game_progress;
DROP POLICY IF EXISTS "Excluir progresso proprio" ON public.game_progress;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id, game_id
    ORDER BY
      CASE status WHEN 'finished' THEN 3 WHEN 'started' THEN 2 ELSE 1 END DESC,
      updated_at DESC,
      id
  ) AS row_number
  FROM public.game_progress
)
DELETE FROM public.game_progress progress
USING ranked
WHERE progress.id = ranked.id AND ranked.row_number > 1;

ALTER TABLE public.game_progress DROP CONSTRAINT IF EXISTS game_progress_user_id_game_id_club_month_key;
ALTER TABLE public.game_progress DROP COLUMN IF EXISTS club_month;
CREATE UNIQUE INDEX IF NOT EXISTS game_progress_user_game_idx
ON public.game_progress(user_id, game_id);

INSERT INTO public.game_progress (
  user_id, game_id, status, started_at, finished_at, updated_at
)
SELECT user_id, game_id, 'finished', created_at, created_at, NOW()
FROM public.completed_games
ON CONFLICT (user_id, game_id) DO UPDATE
SET status = 'finished',
    started_at = COALESCE(public.game_progress.started_at, EXCLUDED.started_at),
    finished_at = COALESCE(public.game_progress.finished_at, EXCLUDED.finished_at),
    updated_at = NOW();

CREATE POLICY "Criar progresso proprio" ON public.game_progress
FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Atualizar progresso proprio" ON public.game_progress
FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Excluir progresso proprio" ON public.game_progress
FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Anotações privadas permanentes por jogo e sincronizadas
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS game_notes_user_game_idx
ON public.game_notes(user_id, game_id, created_at);

ALTER TABLE public.game_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ler anotacoes proprias" ON public.game_notes;
CREATE POLICY "Ler anotacoes proprias" ON public.game_notes
FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Criar anotacoes proprias" ON public.game_notes;
CREATE POLICY "Criar anotacoes proprias" ON public.game_notes
FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Atualizar anotacoes proprias" ON public.game_notes;
CREATE POLICY "Atualizar anotacoes proprias" ON public.game_notes
FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Excluir anotacoes proprias" ON public.game_notes;
CREATE POLICY "Excluir anotacoes proprias" ON public.game_notes
FOR DELETE USING (auth.uid() = user_id);
REVOKE ALL ON public.game_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_notes TO authenticated;

ALTER TABLE public.cycle_progress_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycle_note_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Snapshots de progresso visiveis para autenticados" ON public.cycle_progress_snapshots;
CREATE POLICY "Snapshots de progresso visiveis para autenticados" ON public.cycle_progress_snapshots
FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Snapshots de anotacoes visiveis ao autor" ON public.cycle_note_snapshots;
CREATE POLICY "Snapshots de anotacoes visiveis ao autor" ON public.cycle_note_snapshots
FOR SELECT USING (auth.uid() = user_id);

REVOKE ALL ON public.cycle_progress_snapshots FROM anon;
REVOKE ALL ON public.cycle_note_snapshots FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cycle_progress_snapshots FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cycle_note_snapshots FROM authenticated;
GRANT SELECT ON public.cycle_progress_snapshots TO authenticated;
GRANT SELECT ON public.cycle_note_snapshots TO authenticated;

-- Os ciclos encerrados antes desta migration não possuem um estado histórico
-- recuperável. Este backfill guarda o melhor estado disponível no momento da
-- atualização; os próximos encerramentos serão fotografados de forma exata.
DO $$
DECLARE
  closed_cycle RECORD;
BEGIN
  FOR closed_cycle IN
    SELECT month, game_id FROM public.club_months WHERE status = 'closed'
  LOOP
    PERFORM public.freeze_cycle_game_state(closed_cycle.month, closed_cycle.game_id);
  END LOOP;
END;
$$;

-- Comentários públicos continuam ligados ao ciclo, mas o ciclo ativo substitui
-- a comparação antiga com o mês do relógio.
DROP POLICY IF EXISTS "Criar comentario no mes atual" ON public.club_comments;
CREATE POLICY "Criar comentario no ciclo ativo" ON public.club_comments
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND club_month = (SELECT month FROM public.club_months WHERE status = 'active')
  AND game_id = (SELECT game_id FROM public.club_months WHERE status = 'active')
);
DROP POLICY IF EXISTS "Editar comentario atual proprio" ON public.club_comments;
CREATE POLICY "Editar comentario proprio do ciclo ativo" ON public.club_comments
FOR UPDATE USING (
  auth.uid() = user_id
  AND club_month = (SELECT month FROM public.club_months WHERE status = 'active')
);
DROP POLICY IF EXISTS "Excluir comentario atual proprio" ON public.club_comments;
CREATE POLICY "Excluir comentario proprio do ciclo ativo" ON public.club_comments
FOR DELETE USING (
  auth.uid() = user_id
  AND club_month = (SELECT month FROM public.club_months WHERE status = 'active')
);

DROP POLICY IF EXISTS "Criar reacao no mes atual" ON public.comment_reactions;
CREATE POLICY "Criar reacao no ciclo ativo" ON public.comment_reactions
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND club_month = (SELECT month FROM public.club_months WHERE status = 'active')
);
DROP POLICY IF EXISTS "Excluir reacao atual propria" ON public.comment_reactions;
CREATE POLICY "Excluir reacao propria do ciclo ativo" ON public.comment_reactions
FOR DELETE USING (
  auth.uid() = user_id
  AND club_month = (SELECT month FROM public.club_months WHERE status = 'active')
);

-- A migration não cria senhas nem grava credenciais no repositório. Depois de
-- criar o usuário geral em Authentication > Users, promova-o no SQL Editor:
--
-- INSERT INTO public.user_roles (user_id, role)
-- SELECT id, 'admin' FROM auth.users WHERE email = 'EMAIL_DO_ADMIN'
-- ON CONFLICT (user_id) DO UPDATE SET role = 'admin', updated_at = NOW();
