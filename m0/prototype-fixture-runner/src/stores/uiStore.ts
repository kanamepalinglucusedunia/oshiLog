import { create } from 'zustand';

type IdolSegment = 'idol' | 'group';

interface UiState {
  idolSegment: IdolSegment;
  setIdolSegment: (segment: IdolSegment) => void;
  /** Bumped by write flows (e.g. idol saved) so list screens can reload. */
  dataVersion: number;
  bumpDataVersion: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  idolSegment: 'idol',
  setIdolSegment: (idolSegment) => set({ idolSegment }),
  dataVersion: 0,
  bumpDataVersion: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
}));

/** Makes the observable database version an explicit input to memoized synchronous reads. */
export function readDataAtVersion<T>(dataVersion: number, read: () => T): T {
  void dataVersion;
  return read();
}
