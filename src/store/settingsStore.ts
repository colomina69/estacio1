import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_SETTINGS } from '@/config/defaults';
import type { Settings } from '@/types/weather';

/** Parche de ajustes: `influx` y `thresholds` admiten campos parciales y se fusionan. */
export type SettingsPatch = Partial<Omit<Settings, 'influx' | 'thresholds'>> & {
  influx?: Partial<Settings['influx']>;
  thresholds?: Partial<Settings['thresholds']>;
};

export interface SettingsState extends Settings {
  update: (patch: SettingsPatch) => void;
  reset: () => void;
}

/**
 * Ajustes no sensibles (persisten en AsyncStorage).
 * Las credenciales (password, token de InfluxDB) NO están aquí: viven en SecureStore (ver src/store/secrets.ts).
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: patch =>
        set(s => {
          const { influx, thresholds, ...rest } = patch;
          return {
            ...s,
            ...rest,
            influx: influx ? { ...s.influx, ...influx } : s.influx,
            thresholds: thresholds ? { ...s.thresholds, ...thresholds } : s.thresholds,
          };
        }),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'estacion-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => {
        const { update: _u, reset: _r, ...data } = state;
        return data;
      },
    }
  )
);
