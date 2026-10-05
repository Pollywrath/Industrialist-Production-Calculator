export const GAME_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type GameMonth = (typeof GAME_MONTHS)[number];

export const DEFAULT_GAME_MONTH: GameMonth = 'January';

export function isGameMonth(value: unknown): value is GameMonth {
  return typeof value === 'string' && (GAME_MONTHS as readonly string[]).includes(value);
}
