import { create } from 'zustand';

interface ModalStore {
  openModal: string | null;
  modalData: Record<string, unknown> | null;
  open: (name: string, data?: Record<string, unknown>) => void;
  close: () => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  openModal: null,
  modalData: null,
  open: (name, data = {}) => set({ openModal: name, modalData: data }),
  close: () => set({ openModal: null, modalData: null }),
}));
