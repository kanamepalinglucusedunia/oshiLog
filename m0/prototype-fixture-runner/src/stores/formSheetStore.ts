import { create } from 'zustand';

export type OpenFormKind = 'idol' | 'group' | 'trip' | 'venue' | null;

interface FormSheetState {
  openForm: OpenFormKind;
  /** Opens the given add-form as a bottom sheet over the active tab (no navigation). */
  requestOpenForm: (kind: Exclude<OpenFormKind, null>) => void;
  closeOpenForm: () => void;
}

export const useFormSheetStore = create<FormSheetState>((set) => ({
  openForm: null,
  requestOpenForm: (kind) => set({ openForm: kind }),
  closeOpenForm: () => set({ openForm: null }),
}));
