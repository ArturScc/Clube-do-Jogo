export const themes = [
  { id: 'original', name: 'Clube Neon', description: 'Violeta, grafite e brilho digital.', colors: ['#8b5cf6', '#d946ef', '#101014'] },
  { id: 'zelda', name: 'Zelda Deluxe', description: 'Ouro antigo, floresta e metal.', colors: ['#d6ad48', '#3f7652', '#101812'] },
  { id: 'aperture', name: 'Aperture Science', description: 'Cerâmica, azul e laranja Portal.', colors: ['#00a8e8', '#f58220', '#eef2f3'] },
  { id: 'nier', name: 'NieR: Automata', description: 'Bege quente, carvão e HUD técnico.', colors: ['#b8b29d', '#4b413d', '#d6d0b8'] },
  { id: 'crossing', name: 'Animal Crossing', description: 'Menta, creme e menus acolhedores.', colors: ['#5ac6b8', '#88c96b', '#fff4d6'] },
] as const;

export type ThemeId = (typeof themes)[number]['id'];
export const DEFAULT_THEME: ThemeId = 'original';
export const THEME_STORAGE_KEY = 'clube-do-jogo:theme';

export function isThemeId(value: string | null): value is ThemeId {
  return themes.some(theme => theme.id === value);
}
