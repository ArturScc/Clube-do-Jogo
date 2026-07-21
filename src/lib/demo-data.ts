import type { ClubComment, Game, GameProgress, Profile, RankingItem } from './types';
import { monthKey, shiftMonth } from './utils';

export const demoProfiles: Profile[] = [
  { id: 'demo-user', name: 'Artur Lima', email: 'artur@clubedojogo.com', avatar_url: 'https://i.pravatar.cc/160?img=12', bio: 'RPGs, indies e histórias que ficam na cabeça.' },
  { id: 'bia', name: 'Marina Costa', avatar_url: 'https://i.pravatar.cc/160?img=47', bio: 'Sempre atrás do próximo indie favorito.' },
  { id: 'caio', name: 'Caio Nunes', avatar_url: 'https://i.pravatar.cc/160?img=11', bio: 'Metroidvanias e jogos difíceis.' },
  { id: 'luiza', name: 'Luiza Alves', avatar_url: 'https://i.pravatar.cc/160?img=32', bio: 'Narrativas e mundos abertos.' },
  { id: 'leo', name: 'Léo Rocha', avatar_url: 'https://i.pravatar.cc/160?img=15', bio: 'Só mais uma partida.' },
];

export const demoGames: Game[] = [
  {
    id: 'hades', igdb_id: 114795, title: 'Hades', duration_hours: 22, average_rating: 93, release_year: 2020,
    image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co39vc.jpg',
    description: 'Desafie o deus dos mortos enquanto batalha para sair do submundo neste roguelike de ação dos criadores de Bastion e Transistor.',
    screenshot_urls: [
      'https://images.ctfassets.net/5owu3y35gz1g/5LpElH2nmE7iS4v593VJvo/55f74bd209f45dc179c5279926cb2ea5/hades_09-dec-2019_05.jpg?q=90&w=1400',
      'https://images.ctfassets.net/5owu3y35gz1g/7ovABouyHlisllvi4AQzFx/3ffed5743fd8321198bc4e0d1058b56d/hades_09-dec-2019_02.jpg?q=90&w=1400',
      'https://images.ctfassets.net/5owu3y35gz1g/1StZVnaATlNYl4oaNNftOb/2853b2a421cfb09ab3b654f5d0b1c3ea/hades_09-dec-2019_03.jpg?q=90&w=1400',
      'https://images.ctfassets.net/5owu3y35gz1g/4dfH21dAS69Kg8OQyGZAXB/7be3e45d3bcc84c193837bd84d2923c3/Hades_Aug19_01.png?q=90&w=1400',
      'https://images.ctfassets.net/5owu3y35gz1g/jce84av2Stq3zFI4KGSlB/7e016dd8d9956468e2a681edbe5bb0ac/Hades_Aug2019_01.png?q=90&w=1400',
      'https://images.ctfassets.net/5owu3y35gz1g/1NCys84aPIPSU43tNTKBDx/40be68e3a3ff0678992eb25fcac14e81/Hades_Aug19_04.png?q=90&w=1400',
    ],
    trailer_url: 'https://www.youtube.com/watch?v=91t0ha9x0AE',
  },
  {
    id: 'hollow-knight', igdb_id: 113112, title: 'Hollow Knight', duration_hours: 27, average_rating: 91, release_year: 2017,
    image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co93cr.jpg',
    description: 'Explore cavernas sinuosas, cidades antigas e ermos mortais em um reino vasto e interligado, cheio de criaturas e segredos.',
    screenshot_urls: ['https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc6y2k.jpg'],
    trailer_url: 'https://www.youtube.com/watch?v=UAO2urG23S4',
  },
  {
    id: 'cocoon', title: 'Cocoon', duration_hours: 5, average_rating: 88, release_year: 2023,
    image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4rvv.jpg', description: 'Uma aventura de quebra-cabeças sobre mundos dentro de mundos, criada pelo designer de Limbo e Inside.',
    screenshot_urls: [], trailer_url: 'https://www.youtube.com/watch?v=ybLUe8aYV6A',
  },
  {
    id: 'outer-wilds', title: 'Outer Wilds', duration_hours: 17, average_rating: 92, release_year: 2019,
    image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg', description: 'Um mistério de mundo aberto sobre um sistema solar preso em um loop temporal infinito.',
    screenshot_urls: [], trailer_url: 'https://www.youtube.com/watch?v=d6LGnVCL1_A',
  },
  {
    id: 'celeste', title: 'Celeste', duration_hours: 8, average_rating: 91, release_year: 2018,
    image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co3byy.jpg', description: 'Ajude Madeline a enfrentar seus demônios interiores em sua jornada até o topo da Montanha Celeste.',
    screenshot_urls: [], trailer_url: 'https://www.youtube.com/watch?v=70d9irlxiB4',
  },
  {
    id: 'inscryption', title: 'Inscryption', duration_hours: 12, average_rating: 87, release_year: 2021,
    image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4h7v.jpg', description: 'Uma odisseia sombria baseada em cartas que mistura roguelike, puzzles e terror psicológico.',
    screenshot_urls: [], trailer_url: 'https://www.youtube.com/watch?v=RN5GSIWIN1k',
  },
  {
    id: 'tunic', title: 'Tunic', duration_hours: 13, average_rating: 85, release_year: 2022,
    image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co5p5b.jpg', description: 'Explore uma terra repleta de lendas perdidas, poderes ancestrais e monstros ferozes.',
    screenshot_urls: [], trailer_url: null,
  },
  {
    id: 'dredge', title: 'Dredge', duration_hours: 10, average_rating: 82, release_year: 2023,
    image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co6d4z.jpg', description: 'Pesque em um arquipélago remoto e descubra por que algumas coisas deveriam permanecer esquecidas.',
    screenshot_urls: [], trailer_url: null,
  },
  {
    id: 'sea-of-stars', title: 'Sea of Stars', duration_hours: 28, average_rating: 86, release_year: 2023,
    image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co6n21.jpg', description: 'Um RPG por turnos inspirado nos clássicos, com exploração, combate e uma história cheia de coração.',
    screenshot_urls: [], trailer_url: null,
  },
  {
    id: 'animal-well', title: 'Animal Well', duration_hours: 7, average_rating: 88, release_year: 2024,
    image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co8e0o.jpg', description: 'Explore um labirinto surreal e denso em segredos, iluminando velas e resolvendo mistérios.',
    screenshot_urls: [], trailer_url: null,
  },
  {
    id: 'balatro', title: 'Balatro', duration_hours: 14, average_rating: 90, release_year: 2024,
    image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co7vse.jpg', description: 'Um construtor de baralho hipnótico inspirado em pôquer, cheio de combos e possibilidades.',
    screenshot_urls: [], trailer_url: null,
  },
  {
    id: 'gris', title: 'GRIS', duration_hours: 4, average_rating: 84, release_year: 2018,
    image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1rb8.jpg', description: 'Uma experiência serena e evocativa sobre esperança, perda e um mundo que recupera suas cores.',
    screenshot_urls: [], trailer_url: null,
  },
];

export function demoRanking(): RankingItem[] {
  return demoGames.slice(1).map((game, index) => {
    const voterCount = Math.max(1, 5 - Math.floor(index / 3));
    const voters = index % 2 === 0 ? demoProfiles.slice(0, voterCount) : demoProfiles.slice(1, voterCount + 1);
    const completedBy = demoProfiles.slice(index % 3, index % 3 + (index % 2));
    const playtimePoints = game.duration_hours < 8 ? 1 : game.duration_hours <= 15 ? 3 : game.duration_hours <= 20 ? 2 : 1;
    const totalPoints = Math.round(((voters.length * 2 * playtimePoints * ((game.average_rating || 50) / 100)) / (completedBy.length ? completedBy.length * 2 : 1)) * 10) / 10;
    return { game, votesCount: voters.length, completedCount: completedBy.length, voters, completedBy, playtimePoints, ratingMultiplier: (game.average_rating || 50) / 100, totalPoints, votedByMe: voters.some(item => item.id === 'demo-user'), completedByMe: completedBy.some(item => item.id === 'demo-user'), inBacklog: demoGames.slice(1, 6).some(item => item.id === game.id) };
  }).sort((a, b) => b.totalPoints - a.totalPoints);
}

export const demoProgress: GameProgress[] = demoProfiles.map((profile, index) => ({
  id: `progress-${profile.id}`,
  user_id: profile.id,
  game_id: 'hades',
  club_month: monthKey(),
  status: index < 2 ? 'finished' : index < 4 ? 'started' : 'not_started',
  rating: index < 2 ? 9 - index : null,
  started_at: index < 4 ? new Date(Date.now() - (index + 4) * 86400000).toISOString() : null,
  finished_at: index < 2 ? new Date(Date.now() - (index + 1) * 86400000).toISOString() : null,
  profile,
}));

export const demoComments: ClubComment[] = [
  {
    id: 'comment-1', user_id: 'bia', game_id: 'hades', club_month: monthKey(), parent_id: null,
    body: 'O ritmo da progressão me pegou de surpresa. Mesmo depois de perder, sempre tem uma conversa nova esperando no salão.',
    created_at: new Date(Date.now() - 7200000).toISOString(), updated_at: new Date(Date.now() - 7200000).toISOString(), profile: demoProfiles[1],
    reactions: [{ emoji: '🔥', users: demoProfiles.slice(0, 3), reactedByMe: true }, { emoji: '💜', users: demoProfiles.slice(2, 4), reactedByMe: false }],
    replies: [{
      id: 'reply-1', user_id: 'caio', game_id: 'hades', club_month: monthKey(), parent_id: 'comment-1',
      body: 'Sim! O jogo transforma cada tentativa em parte da história, não só em repetição.',
      created_at: new Date(Date.now() - 3600000).toISOString(), updated_at: new Date(Date.now() - 3600000).toISOString(), profile: demoProfiles[2], reactions: [], replies: [],
    }],
  },
  {
    id: 'comment-2', user_id: 'luiza', game_id: 'hades', club_month: monthKey(), parent_id: null,
    body: 'A direção de arte é absurda. Cada personagem parece ter saído de uma graphic novel.',
    created_at: new Date(Date.now() - 1200000).toISOString(), updated_at: new Date(Date.now() - 1200000).toISOString(), profile: demoProfiles[3], reactions: [{ emoji: '😍', users: [demoProfiles[0]], reactedByMe: true }], replies: [],
  },
];

export const demoMonths = [monthKey(), shiftMonth(monthKey(), -1), shiftMonth(monthKey(), -2)];
