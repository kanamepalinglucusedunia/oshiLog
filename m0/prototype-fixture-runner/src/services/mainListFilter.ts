export function matchesEventMonthYear(eventDate: string, month: string, year: string): boolean {
  if (month === 'all' && year === 'all') return true;
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(eventDate);
  if (!match) return false;
  return (year === 'all' || match[1] === year) && (month === 'all' || match[2] === month);
}
