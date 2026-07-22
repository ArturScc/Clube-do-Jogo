import type { SupabaseClient } from '@supabase/supabase-js';
import { demoGames, demoProfiles, demoRanking } from './demo-data';
import type { Game, Profile, ProfileWithGames, RankingItem, UserPlatform } from './types';
import { shiftMonth } from './utils';

const DEFAULT_RATING = 50;

function playtimePoints(hours: number) {
  if (hours < 8) return 1;
  if (hours <= 15) return 3;
  if (hours <= 20) return 2;
  return 1;
}

function fallbackProfile(id: string): Profile {
  return { id, name: 'Membro', avatar_url: null };
}

export async function fetchRankingData(supabase: SupabaseClient, votingMonth: string, userId: string, isDemo: boolean, historical = false): Promise<RankingItem[]> {
  if (isDemo) return demoRanking();
  const voteMonth = shiftMonth(votingMonth, 1);

  if (historical) {
    const { data: snapshots, error: snapshotError } = await supabase
      .from('ranking_snapshots')
      .select('*, games (*)')
      .eq('voting_month', votingMonth)
      .order('position');
    if (snapshotError) throw snapshotError;
    const snapshotRows = (snapshots || []) as unknown as Array<{
      game_id: string;
      vote_count: number;
      completed_count: number;
      voter_ids: string[];
      completed_user_ids: string[];
      playtime_points: number;
      rating_multiplier: number;
      total_points: number;
      games: Game;
    }>;
    const participantIds = Array.from(new Set(snapshotRows.flatMap(row => [...row.voter_ids, ...row.completed_user_ids])));
    let profiles: Profile[] = [];
    if (participantIds.length) {
      const response = await supabase.from('profiles').select('id, name, avatar_url').in('id', participantIds);
      if (response.error) throw response.error;
      profiles = response.data as Profile[];
    }
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    const gameIds = snapshotRows.map(row => row.game_id);
    const { data: backlog } = gameIds.length
      ? await supabase.from('backlogs').select('game_id').eq('user_id', userId).in('game_id', gameIds)
      : { data: [] as Array<{ game_id: string }> };
    const backlogIds = new Set((backlog || []).map(item => item.game_id));
    return snapshotRows.map(row => ({
      game: row.games,
      votesCount: row.vote_count,
      completedCount: row.completed_count,
      voters: row.voter_ids.map(id => profileMap.get(id) || fallbackProfile(id)),
      completedBy: row.completed_user_ids.map(id => profileMap.get(id) || fallbackProfile(id)),
      playtimePoints: Number(row.playtime_points),
      ratingMultiplier: Number(row.rating_multiplier),
      totalPoints: Number(row.total_points),
      votedByMe: row.voter_ids.includes(userId),
      completedByMe: row.completed_user_ids.includes(userId),
      inBacklog: backlogIds.has(row.game_id),
    }));
  }

  const { data: votes, error: votesError } = await supabase.from('votes').select('game_id, user_id').eq('vote_month', voteMonth);
  if (votesError) throw votesError;
  const gameIds = Array.from(new Set(votes?.map(vote => vote.game_id) || []));
  if (!gameIds.length) return [];
  const [{ data: completed, error: completedError }, { data: games, error: gamesError }, { data: backlog, error: backlogError }] = await Promise.all([
    supabase.from('game_progress').select('game_id, user_id').eq('status', 'finished').in('game_id', gameIds),
    supabase.from('games').select('*').in('id', gameIds),
    supabase.from('backlogs').select('game_id').eq('user_id', userId).in('game_id', gameIds),
  ]);
  if (completedError) throw completedError;
  if (gamesError) throw gamesError;
  if (backlogError) throw backlogError;
  const backlogIds = new Set((backlog || []).map(item => item.game_id));
  const participantIds = Array.from(new Set([...(votes || []).map(vote => vote.user_id), ...(completed || []).map(item => item.user_id)]));
  let profiles: Profile[] = [];
  if (participantIds.length) {
    const response = await supabase.from('profiles').select('id, name, avatar_url').in('id', participantIds);
    if (response.error) throw response.error;
    profiles = response.data as Profile[];
  }
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
  return ((games || []) as Game[]).map(game => {
    const gameVotes = (votes || []).filter(vote => vote.game_id === game.id);
    const gameCompleted = (completed || []).filter(item => item.game_id === game.id);
    const durationPoints = playtimePoints(Number(game.duration_hours));
    const ratingMultiplier = Number(game.average_rating || DEFAULT_RATING) / 100;
    const penalty = gameCompleted.length ? gameCompleted.length * 2 : 1;
    const totalPoints = Math.round(((gameVotes.length * 2 * durationPoints * ratingMultiplier) / penalty) * 10) / 10;
    return {
      game,
      votesCount: gameVotes.length,
      completedCount: gameCompleted.length,
      voters: gameVotes.map(vote => profileMap.get(vote.user_id) || fallbackProfile(vote.user_id)),
      completedBy: gameCompleted.map(item => profileMap.get(item.user_id) || fallbackProfile(item.user_id)),
      playtimePoints: durationPoints,
      ratingMultiplier,
      totalPoints,
      votedByMe: gameVotes.some(vote => vote.user_id === userId),
      completedByMe: gameCompleted.some(item => item.user_id === userId),
      inBacklog: backlogIds.has(game.id),
    };
  }).sort((a, b) => b.totalPoints - a.totalPoints || a.game.title.localeCompare(b.game.title, 'pt-BR'));
}

export async function fetchGame(supabase: SupabaseClient, gameId: string, isDemo: boolean): Promise<Game | null> {
  if (isDemo) return demoGames.find(game => game.id === gameId) || demoGames[0];
  const { data, error } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle();
  if (error) throw error;
  return data as Game | null;
}

export async function fetchGameOfMonth(supabase: SupabaseClient, month: string, isDemo: boolean): Promise<Game | null> {
  if (isDemo) return demoGames[0];
  const { data, error } = await supabase.from('club_months').select('game_id, games (*)').eq('month', month).maybeSingle();
  if (error) throw error;
  if (!data?.games) return null;
  return data.games as unknown as Game;
}

export async function fetchUserPlatforms(supabase: SupabaseClient, userId: string, isDemo: boolean): Promise<UserPlatform[]> {
  if (isDemo) return [
    { igdb_platform_id: 130, name: 'Nintendo Switch', abbreviation: 'Switch' },
    { igdb_platform_id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' },
  ];
  const { data, error } = await supabase
    .from('user_platforms')
    .select('id, user_id, igdb_platform_id, name, abbreviation, logo_url')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return (data || []) as UserPlatform[];
}

export async function fetchProfileWithGames(supabase: SupabaseClient, profileId: string, isDemo: boolean, voteMonth?: string): Promise<ProfileWithGames> {
  if (isDemo) {
    const ranking = demoRanking();
    return {
      profile: demoProfiles.find(profile => profile.id === profileId) || demoProfiles[0],
      backlog: demoGames.slice(1, 6),
      completed: demoGames.slice(6, 10),
      votedGameIds: ranking.filter(item => item.votedByMe).map(item => item.game.id),
      rankingGameIds: ranking.map(item => item.game.id),
      platforms: await fetchUserPlatforms(supabase, profileId, true),
    };
  }
  const [{ data: profile, error: profileError }, { data: backlog, error: backlogError }, { data: completed, error: completedError }, votesResponse, platforms] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    supabase.from('backlogs').select('games (*)').eq('user_id', profileId).order('created_at', { ascending: false }),
    supabase.from('game_progress').select('games (*)').eq('user_id', profileId).eq('status', 'finished').order('updated_at', { ascending: false }),
    voteMonth ? supabase.from('votes').select('game_id, user_id').eq('vote_month', voteMonth) : Promise.resolve({ data: [], error: null }),
    fetchUserPlatforms(supabase, profileId, false),
  ]);
  if (profileError) throw profileError;
  if (backlogError) throw backlogError;
  if (completedError) throw completedError;
  if (votesResponse.error) throw votesResponse.error;
  const votes = votesResponse.data || [];
  return {
    profile: profile as Profile | null,
    backlog: (backlog || []).map(item => item.games) as unknown as Game[],
    completed: (completed || []).map(item => item.games) as unknown as Game[],
    votedGameIds: votes.filter(item => item.user_id === profileId).map(item => item.game_id),
    rankingGameIds: Array.from(new Set(votes.map(item => item.game_id))),
    platforms,
  };
}
