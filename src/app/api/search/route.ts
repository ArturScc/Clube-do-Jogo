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

    // Se encontramos resultados locais suficientes, retornamos do cache
    if (cachedGames && cachedGames.length >= 2) {
      return NextResponse.json(cachedGames);
    }

    // 3. Buscar na IGDB
    const igdbResults = await searchGamesWithIGDB(query);

    // 4. Salvar os novos jogos retornados pela IGDB no Supabase (ignorando duplicados pelo título)
    const savedGames: any[] = [];
    for (const game of igdbResults) {
      const { data: inserted, error: insertError } = await supabase
        .from('games')
        .insert({
          title: game.title,
          duration_hours: game.duration_hours,
          image_url: game.image_url ?? 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80',
          description: game.description,
        })
        .select()
        .single();

      if (!insertError && inserted) {
        savedGames.push(inserted);
      } else if (insertError && insertError.code === '23505') {
        // Jogo já existe no banco, buscar o existente
        const { data: existing } = await supabase
          .from('games')
          .select('*')
          .eq('title', game.title)
          .single();
        if (existing) savedGames.push(existing);
      } else if (insertError) {
        console.error('Erro ao inserir jogo IGDB:', insertError);
      }
    }

    const finalResults = savedGames.length > 0 ? savedGames : (cachedGames || []);
    return NextResponse.json(finalResults);
  } catch (error: any) {
    console.error('Erro na API de busca:', error);
    return NextResponse.json({ error: error.message || 'Erro interno do servidor.' }, { status: 500 });
  }
}
