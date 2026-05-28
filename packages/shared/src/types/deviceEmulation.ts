export interface DevicePreset {
  id: string;
  name: string;
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
}

export interface DeviceEmulationParams {
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
  /** Color CSS del fondo visible fuera del viewport emulado (p.ej. '#1a1a1a'). */
  backgroundColor: string;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  { id: 'iphone-se',        name: 'iPhone SE',           width: 375,  height: 667,  dpr: 2,     mobile: true },
  { id: 'iphone-12',        name: 'iPhone 12/13/14',     width: 390,  height: 844,  dpr: 3,     mobile: true },
  { id: 'iphone-14-pm',     name: 'iPhone 14 Pro Max',   width: 430,  height: 932,  dpr: 3,     mobile: true },
  { id: 'pixel-7',          name: 'Pixel 7',             width: 412,  height: 915,  dpr: 2.625, mobile: true },
  { id: 'galaxy-s21',       name: 'Galaxy S21',          width: 360,  height: 800,  dpr: 3,     mobile: true },
  { id: 'ipad-mini',        name: 'iPad Mini',           width: 768,  height: 1024, dpr: 2,     mobile: true },
  { id: 'ipad-air',         name: 'iPad Air',            width: 820,  height: 1180, dpr: 2,     mobile: true },
  { id: 'ipad-pro',         name: 'iPad Pro 12.9"',      width: 1024, height: 1366, dpr: 2,     mobile: true },
];
