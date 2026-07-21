export interface IGDBGameResult {
  id: number;
  title: string;
  duration_hours: number;
  average_rating: number | null;
  release_year: number | null;
  image_url: string | null;
  description: string;
  screenshot_urls: string[];
  trailer_url: string | null;
  genres: string[];
  platforms: string[];
}

interface IGDBGame {
  id: number;
  name: string;
  summary?: string;
  cover?: {
    image_id?: string;
  };
  first_release_date?: number;
  total_rating?: number;
  rating?: number;
  aggregated_rating?: number;
  screenshots?: Array<{ image_id?: string }>;
  videos?: Array<{ video_id?: string }>;
  genres?: Array<{ name?: string }>;
  platforms?: Array<{ name?: string }>;
}

// Cache do token de acesso em memória para evitar requisições repetidas
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getTwitchToken(): Promise<string> {
  // Retornar do cache se ainda válido (com 5 min de margem)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300_000) {
    return cachedToken.token;
  }

  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('IGDB_CLIENT_ID e IGDB_CLIENT_SECRET não configurados no servidor.');
  }

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: 'POST' }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao obter token do Twitch: ${err}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

export async function searchGamesWithIGDB(query: string): Promise<IGDBGameResult[]> {
  const clientId = process.env.IGDB_CLIENT_ID;
  if (!clientId) throw new Error('IGDB_CLIENT_ID não configurado.');

  const token = await getTwitchToken();

  // 1. Buscar jogos pelo nome com campos relevantes (incluindo cover para a imagem)
  const gamesRes = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: `
      search "${query}";
      fields name, summary, cover.image_id, screenshots.image_id, videos.video_id, genres.name, platforms.name, game_type, first_release_date, total_rating, rating, aggregated_rating;
      where version_parent = null & cover != null;
      limit 5;
    `,
  });

  if (!gamesRes.ok) {
    const err = await gamesRes.text();
    throw new Error(`Erro na busca IGDB: ${err}`);
  }

  const games: IGDBGame[] = await gamesRes.json();
  if (!games || games.length === 0) return [];

  // 2. Para cada jogo, buscar o tempo de jogo no endpoint game_time_to_beats
  const results: IGDBGameResult[] = await Promise.all(
    games.map(async (game) => {
      let durationHours = 10; // Valor padrão: 10h

      try {
        const ttbRes = await fetch('https://api.igdb.com/v4/game_time_to_beats', {
          method: 'POST',
          headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'text/plain',
          },
          body: `fields normally, hastily, completely; where game_id = ${game.id}; limit 1;`,
        });

        if (ttbRes.ok) {
          const ttbData: Array<{ hastily?: number; normally?: number; completely?: number }> = await ttbRes.json();
          if (ttbData && ttbData.length > 0) {
            // "hastily" = história principal (Main Story), converter de segundos para horas
            const seconds = ttbData[0].hastily ?? ttbData[0].normally ?? ttbData[0].completely;
            if (seconds) {
              durationHours = Math.round((seconds / 3600) * 10) / 10;
            }
          }
        }
      } catch {
        // Se falhar, mantém o valor padrão
      }

      // Montar URL de imagem da cover via Twitch Images CDN
      const imageUrl = game.cover?.image_id
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
        : null;
      const averageRating = game.total_rating ?? game.rating ?? game.aggregated_rating ?? null;
      const releaseYear = game.first_release_date
        ? new Date(game.first_release_date * 1000).getFullYear()
        : null;
      const screenshotUrls = (game.screenshots || []).slice(0, 6).flatMap(screenshot => screenshot.image_id
        ? [`https://images.igdb.com/igdb/image/upload/t_screenshot_big/${screenshot.image_id}.jpg`]
        : []);
      const trailerUrl = game.videos?.[0]?.video_id ? `https://www.youtube.com/watch?v=${game.videos[0].video_id}` : null;
      const genres = Array.from(new Set((game.genres || []).flatMap(genre => genre.name ? [genre.name] : [])));
      const platforms = Array.from(new Set((game.platforms || []).flatMap(platform => platform.name ? [platform.name] : [])));

      return {
        id: game.id,
        title: game.name,
        duration_hours: durationHours,
        average_rating: averageRating === null ? null : Math.round(averageRating),
        release_year: releaseYear,
        image_url: imageUrl,
        description: game.summary ?? 'Sem descrição disponível.',
        screenshot_urls: screenshotUrls,
        trailer_url: trailerUrl,
        genres,
        platforms,
      };
    })
  );

  return results;
}

export async function getGameByIGDBId(igdbId: number): Promise<IGDBGameResult | null> {
  const clientId = process.env.IGDB_CLIENT_ID;
  if (!clientId) throw new Error('IGDB_CLIENT_ID não configurado.');

  const token = await getTwitchToken();

  const gameRes = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: `
      fields name, summary, cover.image_id, screenshots.image_id, videos.video_id, genres.name, platforms.name, first_release_date, total_rating, rating, aggregated_rating;
      where id = ${igdbId};
      limit 1;
    `,
  });

  if (!gameRes.ok) {
    const err = await gameRes.text();
    throw new Error(`Erro na busca IGDB por ID: ${err}`);
  }

  const games: IGDBGame[] = await gameRes.json();
  if (!games || games.length === 0) return null;

  const game = games[0];
  let durationHours = 10;

  try {
    const ttbRes = await fetch('https://api.igdb.com/v4/game_time_to_beats', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: `fields normally, hastily, completely; where game_id = ${game.id}; limit 1;`,
    });

    if (ttbRes.ok) {
      const ttbData: Array<{ hastily?: number; normally?: number; completely?: number }> = await ttbRes.json();
      const seconds = ttbData[0]?.hastily ?? ttbData[0]?.normally ?? ttbData[0]?.completely;
      if (seconds) {
        durationHours = Math.round((seconds / 3600) * 10) / 10;
      }
    }
  } catch {
    // Se falhar, mantem o valor padrao
  }

  const imageUrl = game.cover?.image_id
    ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
    : null;
  const averageRating = game.total_rating ?? game.rating ?? game.aggregated_rating ?? null;
  const releaseYear = game.first_release_date
    ? new Date(game.first_release_date * 1000).getFullYear()
    : null;
  const screenshotUrls = (game.screenshots || []).slice(0, 6).flatMap(screenshot => screenshot.image_id
    ? [`https://images.igdb.com/igdb/image/upload/t_screenshot_big/${screenshot.image_id}.jpg`]
    : []);
  const trailerUrl = game.videos?.[0]?.video_id ? `https://www.youtube.com/watch?v=${game.videos[0].video_id}` : null;
  const genres = Array.from(new Set((game.genres || []).flatMap(genre => genre.name ? [genre.name] : [])));
  const platforms = Array.from(new Set((game.platforms || []).flatMap(platform => platform.name ? [platform.name] : [])));

  return {
    id: game.id,
    title: game.name,
    duration_hours: durationHours,
    average_rating: averageRating === null ? null : Math.round(averageRating),
    release_year: releaseYear,
    image_url: imageUrl,
    description: game.summary ?? 'Sem descrição disponível.',
    screenshot_urls: screenshotUrls,
    trailer_url: trailerUrl,
    genres,
    platforms,
  };
}
