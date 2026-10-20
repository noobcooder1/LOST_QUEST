import { describe, expect, it } from 'vitest';
import { formatRegistrationTime, isTimestamp, todayInKorea } from './dateTime';

describe('Korean registration times and event dates', () => {
  it('shows the real UTC registration instant in Korea time with seconds', () => {
    expect(formatRegistrationTime('2026-10-10T11:27:53.949063Z')).toBe('2026. 10. 10 20:27:53');
    expect(formatRegistrationTime('2026-10-10T20:27:53.949063+09:00')).toBe('2026. 10. 10 20:27:53');
  });

  it('uses the Korean date at UTC day boundaries and displays midnight as 00', () => {
    expect(todayInKorea(new Date('2026-10-09T14:59:59Z'))).toBe('2026-10-09');
    expect(todayInKorea(new Date('2026-10-09T15:00:00Z'))).toBe('2026-10-10');
    expect(formatRegistrationTime('2026-10-09T15:00:00Z')).toBe('2026. 10. 10 00:00:00');
  });

  it('does not invent a registration instant from a missing time or event date', () => {
    for (const value of [undefined, '', 'not-a-date', '2026-09-16', '2026-10-10T20:27:53']) {
      expect(isTimestamp(value)).toBe(false);
      expect(formatRegistrationTime(value)).toBeNull();
    }
  });
});
