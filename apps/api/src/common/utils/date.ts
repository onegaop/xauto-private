import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

export const nowInTimezone = (timezoneName: string): dayjs.Dayjs => dayjs().tz(timezoneName);

export const dayKey = (date: dayjs.Dayjs): string => date.format('YYYY-MM-DD');

export const weekKey = (date: dayjs.Dayjs): string => `${date.isoWeekYear()}-W${String(date.isoWeek()).padStart(2, '0')}`;

export const dayRange = (date: dayjs.Dayjs): { start: Date; end: Date } => {
  const start = date.startOf('day');
  const end = date.endOf('day');
  return { start: start.toDate(), end: end.toDate() };
};

export const weekRange = (date: dayjs.Dayjs): { start: Date; end: Date } => {
  const start = date.startOf('isoWeek');
  const end = date.endOf('isoWeek');
  return { start: start.toDate(), end: end.toDate() };
};
