import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Clube do Jogo',
    short_name: 'Clube do Jogo',
    description: 'Vote, jogue e compartilhe cada mês com o Clube do Jogo.',
    start_url: '/jogo-do-mes',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#08080a',
    theme_color: '#08080a',
    categories: ['entertainment', 'social', 'games'],
    icons: [
      { src: '/icons/club-do-jogo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/club-do-jogo-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/club-do-jogo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/club-do-jogo-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
