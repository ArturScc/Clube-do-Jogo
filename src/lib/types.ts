export interface Profile {
  id: string;
  name: string | null;
  email?: string | null;
  avatar_url: string | null;
  bio?: string | null;
  created_at?: string | null;
}

export interface Game {
  id: string;
  igdb_id?: number | null;
  title: string;
  duration_hours: number;
  average_rating?: number | null;
  release_year?: number | null;
  image_url: string;
  description: string;
  screenshot_urls?: string[] | null;
  trailer_url?: string | null;
}

export interface RankingItem {
  game: Game;
  votesCount: number;
  completedCount: number;
  voters: Profile[];
  completedBy: Profile[];
  playtimePoints: number;
  ratingMultiplier: number;
  totalPoints: number;
  votedByMe: boolean;
  completedByMe: boolean;
  inBacklog: boolean;
}

export interface ProfileWithGames {
  profile: Profile | null;
  backlog: Game[];
  completed: Game[];
  votedGameIds: string[];
  rankingGameIds: string[];
}

export type ProgressStatus = 'not_started' | 'started' | 'finished';

export interface GameProgress {
  id: string;
  user_id: string;
  game_id: string;
  club_month: string;
  status: ProgressStatus;
  rating: number | null;
  started_at: string | null;
  finished_at: string | null;
  profile?: Profile;
}

export interface CommentReaction {
  emoji: string;
  users: Profile[];
  reactedByMe: boolean;
}

export interface ClubComment {
  id: string;
  user_id: string;
  game_id: string;
  club_month: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  reactions: CommentReaction[];
  replies: ClubComment[];
}

export interface LocalNote {
  id: string;
  userId: string;
  gameId: string;
  clubMonth: string;
  body: string;
  imageDataUrl?: string;
  createdAt: string;
  updatedAt: string;
}
