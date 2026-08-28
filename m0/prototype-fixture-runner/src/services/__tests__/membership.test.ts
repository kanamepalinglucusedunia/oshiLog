import {
  isMembershipActiveOn,
  buildMembershipPickerOptions,
  resolveIdolDisplayName,
  pickDisplayMembership,
} from '../membership';

const membership = (id: string, startDate: string, endDate: string | null) => ({
  id,
  groupId: `group-${id}`,
  startDate,
  endDate,
});

describe('isMembershipActiveOn', () => {
  it('is active on the debut date (inclusive boundary)', () => {
    expect(isMembershipActiveOn(membership('a', '2025-04-01', '2026-03-31'), '2025-04-01')).toBe(true);
  });

  it('is active on the graduation date (inclusive boundary)', () => {
    expect(isMembershipActiveOn(membership('a', '2025-04-01', '2026-03-31'), '2026-03-31')).toBe(true);
  });

  it('is inactive the day after graduation', () => {
    expect(isMembershipActiveOn(membership('a', '2025-04-01', '2026-03-31'), '2026-04-01')).toBe(false);
  });

  it('is inactive the day before debut', () => {
    expect(isMembershipActiveOn(membership('a', '2025-04-01', '2026-03-31'), '2025-03-31')).toBe(false);
  });

  it('open-ended membership stays active forever', () => {
    expect(isMembershipActiveOn(membership('a', '2025-04-01', null), '2099-12-31')).toBe(true);
  });
});

describe('buildMembershipPickerOptions', () => {
  it('emits one option per membership active on the date', () => {
    const options = buildMembershipPickerOptions(
      {
        idolId: 'i1',
        idolName: 'Hinata',
        memberships: [
          { id: 'm1', groupId: 'g1', startDate: '2020-01-01', endDate: '2022-12-31', groupName: 'Group A' },
          { id: 'm2', groupId: 'g2', startDate: '2023-01-01', endDate: null, groupName: 'Group B', name: 'Kohana' },
        ],
      },
      '2024-05-01',
    );
    expect(options).toHaveLength(1);
    expect(options[0].groupMembershipId).toBe('m2');
    expect(options[0].label).toBe('Kohana · Group B');
  });

  it('labels with the global name when the membership has no per-group name', () => {
    const options = buildMembershipPickerOptions(
      {
        idolId: 'i1',
        idolName: 'Hinata',
        memberships: [{ id: 'm1', groupId: 'g1', startDate: '2020-01-01', endDate: null, groupName: 'Group A' }],
      },
      '2024-05-01',
    );
    expect(options[0].label).toBe('Hinata · Group A');
  });

  it('emits two options when overlapping memberships are active', () => {
    const options = buildMembershipPickerOptions(
      {
        idolId: 'i1',
        idolName: 'Hinata',
        memberships: [
          { id: 'm1', groupId: 'g1', startDate: '2020-01-01', endDate: null, groupName: 'Group A', name: 'Kohana' },
          { id: 'm2', groupId: 'g2', startDate: '2023-01-01', endDate: null, groupName: 'Group B', name: 'Ichika' },
        ],
      },
      '2024-05-01',
    );
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.groupMembershipId).sort()).toEqual(['m1', 'm2']);
    expect(options.map((o) => o.label).sort()).toEqual(['Ichika · Group B', 'Kohana · Group A']);
  });

  it('returns a Solo option when no membership is active', () => {
    const options = buildMembershipPickerOptions(
      {
        idolId: 'i1',
        idolName: 'Hinata',
        memberships: [{ id: 'm1', groupId: 'g1', startDate: '2020-01-01', endDate: '2021-12-31', groupName: 'Group A' }],
      },
      '2024-05-01',
    );
    expect(options).toHaveLength(1);
    expect(options[0].groupMembershipId).toBeNull();
    expect(options[0].label).toBe('Hinata (Solo)');
  });

  it('labels option with idol name only when group name is missing', () => {
    const options = buildMembershipPickerOptions(
      {
        idolId: 'i1',
        idolName: 'Hinata',
        memberships: [{ id: 'm1', groupId: 'g1', startDate: '2020-01-01', endDate: null, groupName: null, name: 'Kohana' }],
      },
      '2024-05-01',
    );
    expect(options[0].label).toBe('Kohana');
  });

  it('returns Solo for an idol with no memberships at all', () => {
    const options = buildMembershipPickerOptions({ idolId: 'i1', idolName: 'Hinata', memberships: [] }, '2024-05-01');
    expect(options).toHaveLength(1);
    expect(options[0].groupMembershipId).toBeNull();
  });
});

describe('resolveIdolDisplayName (ladder)', () => {
  const base = (id: string, startDate: string, endDate: string | null, name: string | null, isMain = false) => ({
    id,
    startDate,
    endDate,
    name,
    isMain,
  });

  it('uses the global name when no membership is active', () => {
    const ms = [base('m1', '2020-01-01', '2021-12-31', 'Kohana')];
    expect(resolveIdolDisplayName('Hinata', ms, '2024-05-01')).toBe('Hinata');
  });

  it('uses the membership name when exactly one is active', () => {
    const ms = [base('m1', '2020-01-01', null, 'Kohana')];
    expect(resolveIdolDisplayName('Hinata', ms, '2024-05-01')).toBe('Kohana');
  });

  it('falls back to the global name when the single active membership has no name', () => {
    const ms = [base('m1', '2020-01-01', null, null)];
    expect(resolveIdolDisplayName('Hinata', ms, '2024-05-01')).toBe('Hinata');
  });

  it('uses the Main membership name when several overlap', () => {
    const ms = [
      base('m1', '2020-01-01', null, 'Kohana', true),
      base('m2', '2023-01-01', null, 'Ichika', false),
    ];
    expect(resolveIdolDisplayName('Hinata', ms, '2024-05-01')).toBe('Kohana');
  });

  it('falls back to the global name when several overlap without a Main', () => {
    const ms = [
      base('m1', '2020-01-01', null, 'Kohana', false),
      base('m2', '2023-01-01', null, 'Ichika', false),
    ];
    expect(resolveIdolDisplayName('Hinata', ms, '2024-05-01')).toBe('Hinata');
  });

  it('pickDisplayMembership returns null when several overlap without a Main', () => {
    const ms = [
      { ...base('m1', '2020-01-01', null, 'Kohana', false), groupName: 'A' },
      { ...base('m2', '2023-01-01', null, 'Ichika', false), groupName: 'B' },
    ];
    expect(pickDisplayMembership(ms, '2024-05-01')).toBeNull();
  });

  it('pickDisplayMembership picks the single active membership with its group name', () => {
    const ms = [{ ...base('m1', '2020-01-01', null, 'Kohana', false), groupName: 'AQA' }];
    const picked = pickDisplayMembership(ms, '2024-05-01');
    expect(picked?.name).toBe('Kohana');
    expect(picked?.groupName).toBe('AQA');
  });

  it('hides a Grad membership from current identity immediately even before its inclusive Grad date', () => {
    const grad = {
      ...base('m1', '2020-01-01', '2026-08-25', 'Kohana', true),
      status: 'grad' as const,
      groupName: 'AQA',
    };

    expect(pickDisplayMembership([grad], '2026-08-24')).toBeNull();
    expect(buildMembershipPickerOptions({
      idolId: 'i1',
      idolName: 'Hinata',
      memberships: [{
        id: grad.id,
        groupId: 'g1',
        startDate: grad.startDate,
        endDate: grad.endDate,
        name: grad.name,
        groupName: grad.groupName,
      }],
    }, '2026-08-25')[0].groupMembershipId).toBe('m1');
  });
});
