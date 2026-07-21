import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGameByIGDBId } from '@/lib/igdb';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const { data: game, error } = await supabase.from('games').select('*').eq('id', id).maybeSingle();
  if (error || !game) return NextResponse.json({ error: 'Jogo não encontrado.' }, { status: 404 });
  if (!game.igdb_id) return NextResponse.json(game);

  try {
    const metadata = await getGameByIGDBId(game.igdb_id);
    if (!metadata) return NextResponse.json(game);
    const patch = {
      description: metadata.description || game.description,
      image_url: metadata.image_url || game.image_url,
      screenshot_urls: metadata.screenshot_urls,
      trailer_url: metadata.trailer_url,
      genres: metadata.genres,
      platforms: metadata.platforms,
      average_rating: metadata.average_rating ?? game.average_rating,
      release_year: metadata.release_year ?? game.release_year,
      duration_hours: metadata.duration_hours || game.duration_hours,
    };
    const { data: updated, error: updateError } = await supabase.from('games').update(patch).eq('id', id).select().single();
    if (updateError) throw updateError;
    return NextResponse.json(updated);
  } catch (value) {
    console.error('Erro ao enriquecer mídia do jogo:', value);
    return NextResponse.json(game);
  }
}
