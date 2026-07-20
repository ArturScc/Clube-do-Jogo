export interface IGDBGameResult {
  id: number;
  title: string;
  duration_hours: number;
  image_url: string | null;
  description: string;
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
      fields name, summary, cover.image_id, game_type;
      where version_parent = null & cover != null;
      limit 5;
    `,
  });

  if (!gamesRes.ok) {
    const err = await gamesRes.text();
    throw new Error(`Erro na busca IGDB: ${err}`);
  }

  const games: any[] = await gamesRes.json();
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
          const ttbData: any[] = await ttbRes.json();
          if (ttbData && ttbData.length > 0) {
            // "normally" é o tempo médio de jogo (em segundos), converter para horas
            const seconds = ttbData[0].normally ?? ttbData[0].hastily ?? ttbData[0].completely;
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

      return {
        id: game.id,
        title: game.name,
        duration_hours: durationHours,
        image_url: imageUrl,
        description: game.summary ?? 'Sem descrição disponível.',
      };
    })
  );

  return results;
}
