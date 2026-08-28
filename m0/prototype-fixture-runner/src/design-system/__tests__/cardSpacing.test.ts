import { CARD_STACK_GAP, MAIN_IDOL_GROUP_CARD_STACK_GAP } from '@/design-system/theme';

describe('vertical card spacing', () => {
  it('uses 16px globally with an 8px exception for the main Idol/Group tab', () => {
    expect(CARD_STACK_GAP).toBe(16);
    expect(MAIN_IDOL_GROUP_CARD_STACK_GAP).toBe(8);
  });
});
