import { getTripStatus, getTripProgress, TRIP_STATUS_LABEL, type TripStatus } from '../tripStatus';

describe('trip status', () => {
  it('classifies on-going trips', () => {
    expect(getTripStatus({ startDate: '2025-01-10', endDate: '2025-01-20' }, '2025-01-15')).toBe('on-going');
    expect(getTripStatus({ startDate: '2025-01-10', endDate: '2025-01-20' }, '2025-01-10')).toBe('on-going');
    expect(getTripStatus({ startDate: '2025-01-10', endDate: '2025-01-20' }, '2025-01-20')).toBe('on-going');
  });

  it('classifies upcoming and passed trips', () => {
    expect(getTripStatus({ startDate: '2025-02-01', endDate: '2025-02-10' }, '2025-01-15')).toBe('upcoming');
    expect(getTripStatus({ startDate: '2025-01-01', endDate: '2025-01-10' }, '2025-01-15')).toBe('passed');
  });

  it('computes progress by elapsed time', () => {
    expect(getTripProgress({ startDate: '2025-01-10', endDate: '2025-01-20' }, '2025-01-10')).toBe(0);
    expect(getTripProgress({ startDate: '2025-01-10', endDate: '2025-01-20' }, '2025-01-15')).toBe(0.5);
    expect(getTripProgress({ startDate: '2025-01-10', endDate: '2025-01-20' }, '2025-01-20')).toBe(1);
    expect(getTripProgress({ startDate: '2025-01-10', endDate: '2025-01-20' }, '2025-01-05')).toBe(0);
    expect(getTripProgress({ startDate: '2025-01-10', endDate: '2025-01-20' }, '2025-01-25')).toBe(1);
  });

  it('labels statuses', () => {
    expect(TRIP_STATUS_LABEL['on-going']).toBe('On Going');
    expect(TRIP_STATUS_LABEL.upcoming).toBe('Upcoming');
    expect(TRIP_STATUS_LABEL.passed).toBe('Passed');
    const _typeCheck: TripStatus = 'on-going';
    void _typeCheck;
  });
});
