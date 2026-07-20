'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Trophy, 
  Gamepad2, 
  Plus, 
  Search, 
  LogOut, 
  Sparkles, 
  Clock, 
  ThumbsUp, 
  Loader2,
  Trash2,
  Share2
} from 'lucide-react';

interface Game {
  id: string;
  title: string;
  duration_hours: number;
  image_url: string;
  description: string;
}

interface RankingItem {
  game: Game;
  votesCount: number;
  playtimePoints: number;
  totalPoints: number;
  votedByMe: boolean;
}

export default function Home() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ranking' | 'backlog'>('ranking');
  
  // Auth states
  const [authMethod, setAuthMethod] = useState<'google' | 'email'>('google');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authErrorMsg, setAuthErrorMsg] = useState('');
  const [authLoadingState, setAuthLoadingState] = useState(false);
  
  // Backlog state
  const [backlog, setBacklog] = useState<Game[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Game[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Ranking state
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);

  // Current Month helper (e.g. "2026-07")
  const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const getMonthName = () => {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return months[new Date().getMonth()];
  };

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }

      // Escutar mudanças de autenticação
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setUser(session.user);
          fetchProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      });

      return () => subscription.unsubscribe();
    };

    checkUser();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (!error && data) {
        setProfile(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Carregar dados quando aba ativa muda ou o usuário autentica
  useEffect(() => {
    if (user) {
      if (activeTab === 'ranking') {
        fetchRanking();
      } else if (activeTab === 'backlog') {
        fetchBacklog();
      }
    }
  }, [user, activeTab]);

  const handleLogin = async () => {
    setAuthErrorMsg('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setAuthErrorMsg(err.message || 'Erro ao iniciar Google Login.');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setAuthErrorMsg('Preencha todos os campos.');
      return;
    }
    setAuthLoadingState(true);
    setAuthErrorMsg('');
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: email.split('@')[0],
            }
          }
        });
        if (error) throw error;
        alert('Cadastro realizado com sucesso! Caso tenha ativado confirmação de e-mail, verifique sua caixa de entrada.');
      }
    } catch (err: any) {
      setAuthErrorMsg(err.message || 'Erro de autenticação.');
    } finally {
      setAuthLoadingState(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  // Regras de pontuação de duração de jogo
  const getPlaytimePoints = (hours: number): number => {
    if (hours < 8) return 1;
    if (hours >= 8 && hours <= 12) return 3;
    if (hours > 12 && hours <= 20) return 2;
    return 1; // > 20h
  };

  // Buscar Ranking do Mês Atual
  const fetchRanking = async () => {
    setRankingLoading(true);
    try {
      const month = getCurrentMonth();
      
      // Buscar todos os votos do mês corrente
      const { data: votes, error: votesError } = await supabase
        .from('votes')
        .select('game_id, user_id')
        .eq('vote_month', month);

      if (votesError) throw votesError;

      // Buscar todos os jogos relacionados aos votos
      const gameIds = Array.from(new Set(votes?.map(v => v.game_id) || []));
      
      if (gameIds.length === 0) {
        setRanking([]);
        return;
      }

      const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .in('id', gameIds);

      if (gamesError) throw gamesError;

      // Calcular ranking
      const rankingItems: RankingItem[] = games.map((game: Game) => {
        const gameVotes = votes?.filter(v => v.game_id === game.id) || [];
        const votesCount = gameVotes.length;
        const playtimePoints = getPlaytimePoints(game.duration_hours);
        const totalPoints = votesCount * 2 * playtimePoints;
        const votedByMe = gameVotes.some(v => v.user_id === user.id);

        return {
          game,
          votesCount,
          playtimePoints,
          totalPoints,
          votedByMe,
        };
      });

      // Ordenar decrescente por pontos (e por título em caso de empate)
      rankingItems.sort((a, b) => b.totalPoints - a.totalPoints || a.game.title.localeCompare(b.game.title));

      // Limitar aos top 10
      setRanking(rankingItems.slice(0, 10));
    } catch (error) {
      console.error('Erro ao carregar ranking:', error);
    } finally {
      setRankingLoading(false);
    }
  };

  // Buscar Backlog Pessoal
  const fetchBacklog = async () => {
    try {
      const { data, error } = await supabase
        .from('backlogs')
        .select('game_id, games (*)')
        .eq('user_id', user.id);

      if (error) throw error;
      
      const gameList = data?.map(item => item.games) as unknown as Game[];
      setBacklog(gameList || []);
    } catch (error) {
      console.error('Erro ao carregar backlog:', error);
    }
  };

  // Pesquisar Jogos usando a API do Grok
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      
      if (res.ok) {
        setSearchResults(data);
      } else {
        alert(data.error || 'Erro ao pesquisar jogos.');
      }
    } catch (error) {
      console.error('Erro na pesquisa:', error);
      alert('Erro de conexão ao pesquisar.');
    } finally {
      setSearching(false);
    }
  };

  // Adicionar jogo ao backlog pessoal
  const addToBacklog = async (game: Game) => {
    try {
      const { error } = await supabase
        .from('backlogs')
        .insert({
          user_id: user.id,
          game_id: game.id
        });

      if (error) {
        if (error.code === '23505') {
          alert('Este jogo já está no seu backlog!');
        } else {
          throw error;
        }
      } else {
        // Atualizar lista local
        setBacklog(prev => [...prev, game]);
        alert('Jogo adicionado ao backlog com sucesso!');
        setShowSearchModal(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Erro ao adicionar ao backlog:', error);
    }
  };

  // Remover jogo do backlog pessoal
  const removeFromBacklog = async (gameId: string) => {
    if (!confirm('Deseja remover este jogo do seu backlog?')) return;

    try {
      const { error } = await supabase
        .from('backlogs')
        .delete()
        .eq('user_id', user.id)
        .eq('game_id', gameId);

      if (error) throw error;

      setBacklog(prev => prev.filter(g => g.id !== gameId));
    } catch (error) {
      console.error('Erro ao remover do backlog:', error);
    }
  };

  // Votar / Remover Voto de um Jogo
  const toggleVote = async (gameId: string, currentlyVoted: boolean) => {
    const month = getCurrentMonth();
    try {
      if (currentlyVoted) {
        // Remover voto
        const { error } = await supabase
          .from('votes')
          .delete()
          .eq('user_id', user.id)
          .eq('game_id', gameId)
          .eq('vote_month', month);

        if (error) throw error;
      } else {
        // Adicionar voto (a constraint impede voto duplicado no mesmo jogo no mês)
        const { error } = await supabase
          .from('votes')
          .insert({
            user_id: user.id,
            game_id: gameId,
            vote_month: month
          });

        if (error) throw error;
      }

      // Atualizar ranking
      fetchRanking();
    } catch (error) {
      console.error('Erro ao computar voto:', error);
      alert('Erro ao processar o seu voto.');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-neutral-950 text-neutral-50 p-6">
        <Loader2 className="w-10 h-10 animate-spin text-violet-500 mb-2" />
        <span className="text-sm text-neutral-400 font-medium">Carregando Clube do Jogo...</span>
      </div>
    );
  }

  // Tela de Login / Autenticação
  if (!user) {
    return (
      <div className="flex-1 flex flex-col justify-between bg-neutral-950 text-neutral-50 px-6 py-12 relative overflow-hidden select-none">
        {/* Efeitos visuais de fundo */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[40%] bg-violet-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[40%] bg-emerald-600/10 rounded-full blur-[120px]" />

        {/* Top Header */}
        <div className="flex flex-col items-center text-center mt-12 z-10">
          <div className="w-16 h-16 bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/20 mb-4 animate-pulse">
            <Gamepad2 className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-fuchsia-400 to-emerald-400 bg-clip-text text-transparent">
            Clube do Jogo
          </h1>
          <p className="text-sm text-neutral-400 mt-2 max-w-xs">
            Escolha, vote e acompanhe o próximo desafio gamer do nosso clube.
          </p>
        </div>

        {/* Card de Login Glassmorphism */}
        <div className="my-auto bg-neutral-900/40 border border-neutral-800/80 rounded-3xl p-8 backdrop-blur-xl z-10 shadow-2xl">
          <h2 className="text-xl font-bold text-center mb-6">
            {authMethod === 'google' 
              ? 'Boas-vindas, Jogador!' 
              : authMode === 'login' ? 'Entrar com E-mail' : 'Criar Nova Conta'}
          </h2>
          
          {authErrorMsg && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-800/30 text-red-300 text-xs rounded-xl text-center">
              {authErrorMsg}
            </div>
          )}

          {authMethod === 'google' ? (
            <div className="flex flex-col gap-4">
              <button 
                onClick={handleLogin}
                className="w-full flex items-center justify-center gap-3 bg-white text-neutral-950 font-bold py-3.5 px-6 rounded-2xl transition hover:bg-neutral-100 active:scale-[0.98] shadow-md shadow-white/5"
              >
                {/* Google Icon SVG */}
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.74 5.74 0 0 1-2.49 3.77v3.12h3.99c2.34-2.16 3.69-5.32 3.69-8.74z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.99-3.12c-1.12.75-2.54 1.19-3.97 1.19-3.05 0-5.63-2.06-6.55-4.83H1.31v3.22A12.01 12.01 0 0 0 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.45 14.33a7.14 7.14 0 0 1 0-4.66V6.45H1.31a12.01 12.01 0 0 0 0 11.1l4.14-3.22z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.96 1.19 15.24 0 12 0 7.33 0 3.31 2.67 1.31 6.45l4.14 3.22c.92-2.77 3.5-4.83 6.55-4.83z"
                  />
                </svg>
                Entrar com o Google
              </button>

              <div className="relative my-2 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-800"></div></div>
                <span className="relative bg-neutral-950 px-3 text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Ou se preferir</span>
              </div>

              <button 
                onClick={() => {
                  setAuthMethod('email');
                  setAuthErrorMsg('');
                }}
                className="w-full bg-neutral-900 border border-neutral-800 text-neutral-300 font-bold py-3.5 px-6 rounded-2xl transition hover:bg-neutral-850 active:scale-[0.98] text-sm"
              >
                Entrar com E-mail e Senha
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1.5 tracking-wider">E-mail</label>
                <input 
                  type="email" 
                  required
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-violet-500 transition text-neutral-200"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1.5 tracking-wider">Senha</label>
                <input 
                  type="password" 
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-violet-500 transition text-neutral-200"
                />
              </div>

              <button 
                type="submit"
                disabled={authLoadingState}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 px-6 rounded-2xl transition active:scale-[0.98] disabled:opacity-50 text-sm flex items-center justify-center gap-2"
              >
                {authLoadingState ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : authMode === 'login' ? (
                  'Entrar'
                ) : (
                  'Cadastrar e Entrar'
                )}
              </button>

              <div className="flex flex-col gap-3 text-center mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === 'login' ? 'signup' : 'login');
                    setAuthErrorMsg('');
                  }}
                  className="text-xs text-violet-400 hover:underline font-medium"
                >
                  {authMode === 'login' 
                    ? 'Não tem uma conta? Cadastre-se' 
                    : 'Já tem uma conta? Faça Login'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('google');
                    setAuthErrorMsg('');
                  }}
                  className="text-xs text-neutral-400 hover:text-white transition"
                >
                  ← Voltar para o Google Login
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 flex flex-col gap-3 text-xs text-neutral-500 text-center leading-relaxed">
            <p>Usamos autenticação para evitar spam e garantir um voto justo por membro.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-neutral-600 mt-6 z-10">
          Clube do Jogo © {new Date().getFullYear()} • Mobile First & Vercel
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-50 max-w-md mx-auto w-full min-h-screen relative shadow-2xl border-x border-neutral-900 pb-24">
      {/* Background glow */}
      <div className="absolute top-[-5%] right-[-5%] w-[40%] h-[30%] bg-violet-600/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Main App Header */}
      <header className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-neutral-900/60 sticky top-0 bg-neutral-950/80 backdrop-blur-md z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-xl flex items-center justify-center">
            <Gamepad2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight leading-tight">Clube do Jogo</h1>
            <p className="text-[10px] text-neutral-400 font-medium">Votação de {getMonthName()}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {profile?.avatar_url && (
            <img 
              src={profile.avatar_url} 
              alt={profile.name} 
              className="w-7 h-7 rounded-full border border-neutral-800"
              title={profile.name}
            />
          )}
          <button 
            onClick={handleLogout}
            className="p-2 text-neutral-400 hover:text-red-400 transition rounded-lg hover:bg-neutral-900"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-5 overflow-y-auto">
        
        {/* ABA 1: RANKING */}
        {activeTab === 'ranking' && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            {/* Ranking list */}
            <div>
              <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="font-extrabold text-base flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  Top 10 Jogos Votados
                </h3>
                <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                  Mês: {getCurrentMonth()}
                </span>
              </div>

              {rankingLoading ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-2" />
                  <span className="text-xs text-neutral-400">Calculando votos...</span>
                </div>
              ) : ranking.length === 0 ? (
                <div className="py-12 border border-dashed border-neutral-800 rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-neutral-900/10">
                  <Gamepad2 className="w-8 h-8 text-neutral-700 mb-2.5" />
                  <span className="text-sm font-bold text-neutral-400">Nenhum voto computado ainda</span>
                  <p className="text-xs text-neutral-500 mt-1 max-w-xs">
                    Vá para a aba "Meu Backlog" e vote em algum jogo para começar a contagem!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {ranking.map((item, idx) => {
                    const isWinner = idx === 0;
                    return (
                      <div 
                        key={item.game.id}
                        className={`group relative flex gap-3.5 bg-neutral-900/40 border rounded-2xl p-3.5 transition duration-300 hover:border-violet-500/40 hover:bg-neutral-900/80 ${
                          isWinner ? 'border-amber-500/30 ring-1 ring-amber-500/10' : 'border-neutral-900'
                        }`}
                      >
                        {/* Medal badge or index */}
                        <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black z-10 shadow-md ${
                          idx === 0 ? 'bg-amber-500 text-neutral-950' : 
                          idx === 1 ? 'bg-neutral-300 text-neutral-950' :
                          idx === 2 ? 'bg-amber-800 text-neutral-50' : 'bg-neutral-800 text-neutral-400'
                        }`}>
                          {idx + 1}
                        </div>

                        {/* Game image wrapper */}
                        <div className="w-16 h-20 rounded-lg overflow-hidden bg-neutral-800 flex-shrink-0 border border-neutral-800/80 relative">
                          <img 
                            src={item.game.image_url} 
                            alt={item.game.title}
                            className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
                          />
                        </div>

                        {/* Game details */}
                        <div className="flex-1 flex flex-col justify-between min-w-0">
                          <div>
                            <h4 className="font-extrabold text-sm truncate pr-2" title={item.game.title}>
                              {item.game.title}
                            </h4>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {item.game.duration_hours}h
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-900/60">
                            {/* Score Display */}
                            <div className="text-xs">
                              <strong className="text-emerald-400 font-extrabold text-sm">{item.totalPoints}</strong>
                              <span className="text-neutral-500 font-medium text-[10px] ml-1">pts ({item.votesCount} {item.votesCount === 1 ? 'voto' : 'votos'})</span>
                            </div>

                            {/* Vote Action */}
                            <button
                              onClick={() => toggleVote(item.game.id, item.votedByMe)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition active:scale-95 ${
                                item.votedByMe 
                                  ? 'bg-violet-600 text-white hover:bg-violet-700' 
                                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
                              }`}
                            >
                              <ThumbsUp className={`w-3 h-3 ${item.votedByMe ? 'fill-current' : ''}`} />
                              {item.votedByMe ? 'Votado' : 'Votar'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA 2: MEU BACKLOG */}
        {activeTab === 'backlog' && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            {/* Header + Add Game Button */}
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="font-extrabold text-base">Meu Backlog</h3>
                <p className="text-xs text-neutral-500">Adicione jogos e vote neles para a rodada.</p>
              </div>
              <button 
                onClick={() => setShowSearchModal(true)}
                className="flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold py-2 px-3.5 rounded-xl text-xs shadow-md shadow-violet-500/10 transition active:scale-95 hover:brightness-110"
              >
                <Plus className="w-4 h-4" />
                Buscar Jogo
              </button>
            </div>

            {/* Backlog List */}
            {backlog.length === 0 ? (
              <div className="py-16 border border-dashed border-neutral-800 rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-neutral-900/10">
                <Gamepad2 className="w-8 h-8 text-neutral-700 mb-2.5" />
                <span className="text-sm font-bold text-neutral-400">Backlog Vazio</span>
                <p className="text-xs text-neutral-500 mt-1 max-w-xs">
                  Você ainda não tem jogos no seu backlog. Clique em "Buscar Jogo" para adicionar e votar!
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {backlog.map((game) => {
                  // Verificar se o usuário já votou nesse jogo este mês
                  // Para ter essa informação atualizada, podemos puxar do banco ou verificar se está no ranking
                  const isVoted = ranking.some(item => item.game.id === game.id && item.votedByMe);
                  
                  return (
                    <div 
                      key={game.id}
                      className="group flex gap-3.5 bg-neutral-900/30 border border-neutral-900 rounded-2xl p-3.5 transition duration-300 hover:border-neutral-800 hover:bg-neutral-900/60"
                    >
                      <div className="w-14 h-18 rounded-lg overflow-hidden bg-neutral-800 flex-shrink-0 border border-neutral-800/80">
                        <img 
                          src={game.image_url} 
                          alt={game.title}
                          className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
                        />
                      </div>

                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 pr-2">
                            <h4 className="font-extrabold text-sm truncate" title={game.title}>
                              {game.title}
                            </h4>
                            <span className="inline-flex items-center gap-1 text-[10px] text-neutral-400 mt-1">
                              <Clock className="w-2.5 h-2.5" />
                              {game.duration_hours}h de duração
                            </span>
                          </div>
                          <button
                            onClick={() => removeFromBacklog(game.id)}
                            className="text-neutral-600 hover:text-red-400 p-1 transition rounded-lg hover:bg-neutral-900"
                            title="Remover do Backlog"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-900/60">
                          <span className="text-[10px] text-neutral-500 font-medium">
                            Multiplicador: x{getPlaytimePoints(game.duration_hours)}
                          </span>

                          <button
                            onClick={() => toggleVote(game.id, isVoted)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-extrabold transition active:scale-95 ${
                              isVoted 
                                ? 'bg-violet-600 text-white hover:bg-violet-700' 
                                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
                            }`}
                          >
                            <ThumbsUp className={`w-3 h-3 ${isVoted ? 'fill-current' : ''}`} />
                            {isVoted ? 'Votado' : 'Votar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* SEARCH / ADD MODAL */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          {/* Modal Container */}
          <div className="bg-neutral-900 border-t sm:border border-neutral-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md flex flex-col max-h-[85vh] sm:max-h-[75vh] overflow-hidden shadow-2xl relative">
            
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-neutral-800/80 flex items-center justify-between">
              <h3 className="font-extrabold text-base">Buscar Jogo com Grok AI</h3>
              <button 
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="text-xs font-bold text-neutral-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-neutral-800 transition"
              >
                Fechar
              </button>
            </div>

            {/* Search Input Form */}
            <form onSubmit={handleSearch} className="p-4 border-b border-neutral-800/60 bg-neutral-900/90 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input 
                  type="text"
                  placeholder="Ex: Hollow Knight, Elden Ring..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800/80 rounded-xl py-2.5 pl-10 pr-4 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-violet-500 transition"
                  disabled={searching}
                  autoFocus
                />
              </div>
              <button 
                type="submit"
                disabled={searching}
                className="bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm px-4 rounded-xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
              </button>
            </form>

            {/* Search Results List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
              {searching ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-2.5" />
                  <span className="text-xs text-neutral-400 font-medium">Buscando na inteligência artificial...</span>
                  <p className="text-[10px] text-neutral-500 mt-1 max-w-xs">Isso pode levar alguns segundos enquanto o Grok analisa.</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-12 text-center text-neutral-500 text-xs">
                  {searchQuery ? 'Nenhum jogo encontrado para esta busca.' : 'Digite o nome de um jogo acima para pesquisar.'}
                </div>
              ) : (
                searchResults.map((game) => (
                  <div 
                    key={game.id || game.title}
                    className="flex gap-3 bg-neutral-950 border border-neutral-800/60 rounded-xl p-3 hover:border-neutral-700 transition"
                  >
                    <div className="w-12 h-16 rounded-md overflow-hidden bg-neutral-800 flex-shrink-0 border border-neutral-800/80">
                      <img 
                        src={game.image_url} 
                        alt={game.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <h4 className="font-extrabold text-xs text-neutral-200 truncate">{game.title}</h4>
                        <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 mt-0.5">
                          <Clock className="w-3 h-3 text-neutral-500" />
                          <span>{game.duration_hours}h estimadas</span>
                        </div>
                        <p className="text-[10px] text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
                          {game.description}
                        </p>
                      </div>
                      
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => addToBacklog(game)}
                          className="flex items-center gap-1 bg-violet-600/20 text-violet-300 border border-violet-500/20 font-bold text-[10px] py-1 px-2.5 rounded-lg hover:bg-violet-600 hover:text-white transition active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Adicionar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tab Bar (Sticky Bottom) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-neutral-950/95 border-t border-neutral-900 backdrop-blur-md flex items-center justify-around py-3 px-6 z-40">
        <button
          onClick={() => setActiveTab('ranking')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            activeTab === 'ranking' ? 'text-violet-500 font-extrabold' : 'text-neutral-500 font-medium hover:text-neutral-300'
          }`}
        >
          <Trophy className="w-5 h-5" />
          <span className="text-[10px]">Ranking</span>
        </button>

        <button
          onClick={() => setActiveTab('backlog')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            activeTab === 'backlog' ? 'text-violet-500 font-extrabold' : 'text-neutral-500 font-medium hover:text-neutral-300'
          }`}
        >
          <Gamepad2 className="w-5 h-5" />
          <span className="text-[10px]">Backlog</span>
        </button>
      </nav>
    </div>
  );
}
