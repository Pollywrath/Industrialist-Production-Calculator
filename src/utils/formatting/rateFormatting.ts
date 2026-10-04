import type { RateMode } from '../../types/ui';

export function getRateSuffix(rateMode: RateMode): string {
  switch (rateMode) {
    case 'second':
      return '/s';
    case 'minute':
      return '/m';
    case 'hour':
      return '/h';
    case 'raw':
    default:
      return '';
  }
}
