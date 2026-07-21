import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchGamesWithIGDB } from '@/lib/igdb';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.trim() === '') {
    return NextResponse.json({ error: 'Parâmetro de busca "q" é obrigatório.' }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    // 1. Verificar se o usuário está autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    // 2. Buscar no banco de dados primeiro (cache local)
    const { data: cachedGames, error: dbError } = await supabase
      .from('games')
      .select('*')
      .ilike('title', `%${query}%`)
      .limit(5);

    if (dbError) {
      console.error('Erro ao ler cache do banco:', dbError);
    }

    const hasFreshMetadata = cachedGames?.every(game =>
      game.average_rating !== null &&
      game.release_year !== null &&
      Array.isArray(game.screenshot_urls) &&
      game.screenshot_urls.length >= 3
    );

    // Se encontramos resultados locais suficientes e completos, retornamos do cache
    if (cachedGames && cachedGames.length >= 2 && hasFreshMetadata) {
      return NextResponse.json(cachedGames);
    }

    // 3. Buscar na IGDB
    const igdbResults = await searchGamesWithIGDB(query);

    // 4. Salvar os novos jogos retornados pela IGDB no Supabase (ignorando duplicados pelo título)
    const savedGames: Array<Record<string, unknown>> = [];
    for (const game of igdbResults) {
      const gamePayload = {
        igdb_id: game.id,
        title: game.title,
        duration_hours: game.duration_hours,
        average_rating: game.average_rating,
        release_year: game.release_year,
        image_url: game.image_url ?? 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80',
        description: game.description,
        screenshot_urls: game.screenshot_urls,
        trailer_url: game.trailer_url,
      };

      let { data: inserted, error: insertError } = await supabase
        .from('games')
        .insert(gamePayload)
        .select()
        .single();

      if (insertError && insertError.code === 'PGRST204') {
        const { average_rating, release_year, screenshot_urls, trailer_url, ...legacyPayload } = gamePayload;
        const retry = await supabase
          .from('games')
          .insert(legacyPayload)
          .select()
          .single();

        inserted = retry.data ? { ...retry.data, average_rating, release_year, screenshot_urls, trailer_url } : retry.data;
        insertError = retry.error;
      }

      if (!insertError && inserted) {
        savedGames.push(inserted);
      } else if (insertError && insertError.code === '23505') {
        // Jogo já existe no banco, buscar o existente
        const { data: existing } = await supabase
          .from('games')
          .select('*')
          .eq('title', game.title)
          .single();
        if (existing) {
          const metadataPatch = {
            average_rating: existing.average_rating ?? game.average_rating,
            release_year: existing.release_year ?? game.release_year,
            igdb_id: existing.igdb_id ?? game.id,
            screenshot_urls: existing.screenshot_urls?.length ? existing.screenshot_urls : game.screenshot_urls,
            trailer_url: existing.trailer_url ?? game.trailer_url,
          };
          const shouldUpdateMetadata =
            (existing.average_rating === null && game.average_rating !== null) ||
            (existing.release_year === null && game.release_year !== null) ||
            (existing.igdb_id === null && game.id) ||
            (!existing.screenshot_urls?.length && game.screenshot_urls.length > 0) ||
            (!existing.trailer_url && game.trailer_url);

          if (shouldUpdateMetadata) {
            const { data: updated, error: updateError } = await supabase
              .from('games')
              .update(metadataPatch)
              .eq('id', existing.id)
              .select()
              .single();

            savedGames.push(updateError || !updated ? { ...existing, ...metadataPatch } : updated);
          } else {
            savedGames.push({ ...existing, ...metadataPatch });
          }
        }
      } else if (insertError) {
        console.error('Erro ao inserir jogo IGDB:', insertError);
      }
    }

    const finalResults = savedGames.length > 0 ? savedGames : (cachedGames || []);
    return NextResponse.json(finalResults);
  } catch (error: unknown) {
    console.error('Erro na API de busca:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno do servidor.' }, { status: 500 });
  }
}
