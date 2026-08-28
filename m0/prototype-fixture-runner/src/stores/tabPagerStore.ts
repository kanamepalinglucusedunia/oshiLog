import { create } from 'zustand';

interface TabPagerState {
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
}

/** Global focused tab index shared by all pager pages. */
export const useTabPagerStore = create<TabPagerState>((set) => ({
  focusedIndex: 0,
  setFocusedIndex: (focusedIndex) => set({ focusedIndex }),
}));
