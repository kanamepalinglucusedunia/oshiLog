import {
  applyMembershipTransition,
  buildExplicitRepairPeriods,
  createInitialMembershipPeriods,
  deriveGlobalIdolStatus,
  moveMembershipBoundary,
  validateCurrentMembershipStart,
  validateMembershipPeriods,
  validateSameGroupEpisodeOverlap,
  type MembershipPeriodDraft,
  type MembershipTransitionResult,
} from '../membershipTimeline';

const period = (
  status: MembershipPeriodDraft['status'],
  startDate: string,
  endDate: string | null,
): MembershipPeriodDraft => ({ status, startDate, endDate });

describe('membership timeline', () => {
  it('creates an open Active period for a new membership', () => {
    expect(createInitialMembershipPeriods('2026-04-10')).toEqual([
      period('active', '2026-04-10', null),
    ]);
  });

  it('repairs a legacy open Hiatus only from explicitly stored dates', () => {
    expect(buildExplicitRepairPeriods({
      status: 'hiatus',
      startDate: '2026-01-01',
      endDate: null,
      hiatusStartDate: '2026-02-01',
      hiatusEndDate: null,
    })).toEqual([
      period('active', '2026-01-01', '2026-02-01'),
      period('hiatus', '2026-02-01', null),
    ]);
  });

  it('preserves an explicitly completed legacy Hiatus while repairing Active history', () => {
    expect(buildExplicitRepairPeriods({
      status: 'active',
      startDate: '2026-01-01',
      endDate: null,
      hiatusStartDate: '2026-02-01',
      hiatusEndDate: '2026-02-10',
    })).toEqual([
      period('active', '2026-01-01', '2026-02-01'),
      period('hiatus', '2026-02-01', '2026-02-10'),
      period('active', '2026-02-10', null),
    ]);
  });

  it('refuses to invent a missing Grad date during legacy repair', () => {
    expect(() => buildExplicitRepairPeriods({
      status: 'grad',
      startDate: '2026-01-01',
      endDate: null,
      hiatusStartDate: null,
      hiatusEndDate: null,
    })).toThrow(/Grad date/i);
  });

  it('starts and ends hiatus using a shared boundary owned by the newer status', () => {
    const started = applyMembershipTransition({
      periods: createInitialMembershipPeriods('2026-04-10'),
      currentStatus: 'active',
      nextStatus: 'hiatus',
      boundaryDate: '2026-04-25',
    });

    expect(started).toEqual({
      status: 'hiatus',
      endDate: null,
      periods: [
        period('active', '2026-04-10', '2026-04-25'),
        period('hiatus', '2026-04-25', null),
      ],
    });

    const ended = applyMembershipTransition({
      periods: started.periods,
      currentStatus: started.status,
      nextStatus: 'active',
      boundaryDate: '2026-05-05',
    });

    expect(ended).toEqual({
      status: 'active',
      endDate: null,
      periods: [
        period('active', '2026-04-10', '2026-04-25'),
        period('hiatus', '2026-04-25', '2026-05-05'),
        period('active', '2026-05-05', null),
      ],
    });
  });

  it('preserves every previous hiatus when a later cycle is completed', () => {
    let state: MembershipTransitionResult = {
      status: 'active' as const,
      endDate: null,
      periods: createInitialMembershipPeriods('2026-01-01'),
    };
    for (const [nextStatus, boundaryDate] of [
      ['hiatus', '2026-02-01'],
      ['active', '2026-02-10'],
      ['hiatus', '2026-03-01'],
      ['active', '2026-03-07'],
    ] as const) {
      state = applyMembershipTransition({
        periods: state.periods,
        currentStatus: state.status,
        nextStatus,
        boundaryDate,
      });
    }

    expect(state.periods).toEqual([
      period('active', '2026-01-01', '2026-02-01'),
      period('hiatus', '2026-02-01', '2026-02-10'),
      period('active', '2026-02-10', '2026-03-01'),
      period('hiatus', '2026-03-01', '2026-03-07'),
      period('active', '2026-03-07', null),
    ]);
  });

  it('graduates immediately by closing the latest period on an inclusive Grad date', () => {
    const graduated = applyMembershipTransition({
      periods: [period('active', '2026-04-10', null)],
      currentStatus: 'active',
      nextStatus: 'grad',
      boundaryDate: '2026-04-25',
    });

    expect(graduated).toEqual({
      status: 'grad',
      endDate: '2026-04-25',
      periods: [period('active', '2026-04-10', '2026-04-25')],
    });
  });

  it('rejects gaps, overlaps, repeated statuses, and a mismatched episode boundary', () => {
    expect(validateMembershipPeriods({
      startDate: '2026-04-10',
      endDate: null,
      status: 'active',
      periods: [
        period('active', '2026-04-10', '2026-04-24'),
        period('hiatus', '2026-04-25', null),
      ],
    }).ok).toBe(false);

    expect(validateMembershipPeriods({
      startDate: '2026-04-10',
      endDate: null,
      status: 'active',
      periods: [
        period('active', '2026-04-10', '2026-04-26'),
        period('hiatus', '2026-04-25', null),
      ],
    }).ok).toBe(false);

    expect(validateMembershipPeriods({
      startDate: '2026-04-10',
      endDate: null,
      status: 'active',
      periods: [
        period('active', '2026-04-10', '2026-04-25'),
        period('active', '2026-04-25', null),
      ],
    }).ok).toBe(false);

    expect(validateMembershipPeriods({
      startDate: '2026-04-09',
      endDate: null,
      status: 'active',
      periods: [period('active', '2026-04-10', null)],
    }).ok).toBe(false);
  });

  it('moves one shared boundary and updates both adjacent periods', () => {
    expect(moveMembershipBoundary([
      period('active', '2026-04-10', '2026-04-25'),
      period('hiatus', '2026-04-25', '2026-05-05'),
      period('active', '2026-05-05', null),
    ], 1, '2026-04-27')).toEqual([
      period('active', '2026-04-10', '2026-04-27'),
      period('hiatus', '2026-04-27', '2026-05-05'),
      period('active', '2026-05-05', null),
    ]);
  });

  it('rejects a future debut for a current membership', () => {
    expect(validateCurrentMembershipStart('2026-08-25', '2026-08-24')).toEqual({
      ok: false,
      error: 'Current membership debut date cannot be in the future',
    });
    expect(validateCurrentMembershipStart('2026-08-24', '2026-08-24').ok).toBe(true);
  });

  it('derives Active over Hiatus and uses Inactive when no current membership remains', () => {
    expect(deriveGlobalIdolStatus([{ status: 'hiatus' }, { status: 'active' }])).toBe('active');
    expect(deriveGlobalIdolStatus([{ status: 'grad' }, { status: 'hiatus' }])).toBe('hiatus');
    expect(deriveGlobalIdolStatus([{ status: 'grad' }])).toBe('inactive');
    expect(deriveGlobalIdolStatus([])).toBe('inactive');
  });

  it('rejects overlapping episodes only when they belong to the same group', () => {
    const base = {
      id: 'old',
      groupId: 'g1',
      startDate: '2026-01-01',
      endDate: '2026-04-25',
    };

    expect(validateSameGroupEpisodeOverlap({
      episode: { id: 'new', groupId: 'g1', startDate: '2026-04-25', endDate: null },
      siblings: [base],
    }).ok).toBe(false);
    expect(validateSameGroupEpisodeOverlap({
      episode: { id: 'new', groupId: 'g1', startDate: '2026-04-26', endDate: null },
      siblings: [base],
    }).ok).toBe(true);
    expect(validateSameGroupEpisodeOverlap({
      episode: { id: 'new', groupId: 'g2', startDate: '2026-01-01', endDate: null },
      siblings: [base],
    }).ok).toBe(true);
  });
});
