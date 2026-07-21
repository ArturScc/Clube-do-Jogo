-- Habilitar UUID-OSSP se necessário
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Jogos (Games) - Atua como cache global de jogos buscados
CREATE TABLE IF NOT EXISTS public.games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igdb_id INTEGER UNIQUE,
    title TEXT UNIQUE NOT NULL,
    duration_hours NUMERIC NOT NULL,
    average_rating NUMERIC DEFAULT NULL,
    release_year INTEGER DEFAULT NULL,
    image_url TEXT,
    description TEXT,
    winner_month TEXT DEFAULT NULL, -- Ex: '2026-06' se o jogo foi o vencedor daquele mês
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Tabela de Backlogs - Jogos que os membros adicionaram aos seus backlogs pessoais
CREATE TABLE IF NOT EXISTS public.backlogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, game_id)
);

CREATE TABLE IF NOT EXISTS public.completed_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, game_id)
);

-- 3. Tabela de Votos - Votos do mês
CREATE TABLE IF NOT EXISTS public.votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    vote_month TEXT NOT NULL, -- Formato 'YYYY-MM', ex: '2026-07'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, game_id, vote_month) -- Permite votar em vários jogos, mas apenas 1 vez por jogo
);

-- 4. Habilitar RLS (Row Level Security) em todas as tabelas
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completed_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- 5. Criar Políticas RLS

-- Tabela GAMES: Qualquer usuário autenticado pode ler e criar novos jogos
CREATE POLICY "Permitir leitura de jogos para usuários autenticados" ON public.games
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir inserção de jogos para usuários autenticados" ON public.games
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Permitir update de jogos para usuários autenticados" ON public.games
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Tabela BACKLOGS: Leitura livre para autenticados (para gerar o backlog geral), mas apenas o próprio usuário pode criar/deletar
CREATE POLICY "Permitir leitura de backlogs para autenticados" ON public.backlogs
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir inserção de backlog próprio" ON public.backlogs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir exclusão de backlog próprio" ON public.backlogs
    FOR DELETE USING (auth.uid() = user_id);

-- Tabela VOTES: Leitura livre para autenticados (para gerar o ranking), mas apenas o próprio usuário pode inserir ou deletar seu voto
CREATE POLICY "Permitir leitura de jogos finalizados para autenticados" ON public.completed_games
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir insercao de jogo finalizado proprio" ON public.completed_games
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir exclusao de jogo finalizado proprio" ON public.completed_games
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Permitir leitura de votos para autenticados" ON public.votes
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir inserção de voto próprio" ON public.votes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir exclusão de voto próprio" ON public.votes
    FOR DELETE USING (auth.uid() = user_id);

-- 6. Criar perfil público na criação do usuário no Supabase Auth (opcional, mas extremamente recomendado)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT,
    avatar_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de perfis para autenticados" ON public.profiles
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir atualização do próprio perfil" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Função e Trigger automática para criar perfil ao registrar no Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, avatar_url)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Membro'),
        new.email,
        new.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
