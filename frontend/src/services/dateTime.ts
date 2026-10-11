/** Item event dates and registration instants are different; all site times use Korea's zone. */
export const SITE_TIME_ZONE = 'Asia/Seoul';

const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: SITE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: SITE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function parts(format: Intl.DateTimeFormat, date: Date) {
  return Object.fromEntries(format.formatToParts(date).map(({ type, value }) => [type, value]));
}

/** A date-input value based on Korea's calendar, including near UTC midnight. */
export function todayInKorea(now = new Date()): string {
  const { year, month, day } = parts(dateFormat, now);
  return `${year}-${month}-${day}`;
}

/** Require an explicit zone so a server instant cannot become a browser-local wall time. */
export function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

/** Unknown registration times (e.g. police data) stay unknown, rather than using the event date. */
export function formatRegistrationTime(value: string | undefined): string | null {
  if (!isTimestamp(value)) return null;
  const { year, month, day, hour, minute, second } = parts(timeFormat, new Date(value));
  return `${year}. ${month}. ${day} ${hour}:${minute}:${second}`;
}
