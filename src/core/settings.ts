/** 视觉/窗口设置：由设置面板写入，主窗口应用并持久化。 */

export interface ColorTheme {
  id: string;
  name: string;
  core: [number, number, number];
  body: [number, number, number];
  aura: [number, number, number];
}

/**
 * 默认配色：扁平纯色，无立体高亮。
 * 三层是同一色相的亮核 / 主体 / 深晕；设置面板色点只显示主体色。
 */
export const COLOR_THEMES: ColorTheme[] = [
  {
    id: 'gold',
    name: '金',
    core: [1.0, 0.95, 0.82],
    body: [0.88, 0.68, 0.32],
    aura: [0.58, 0.42, 0.18],
  },
  {
    id: 'terracotta',
    name: '陶土',
    core: [1.0, 0.93, 0.88],
    body: [0.85, 0.48, 0.35],
    aura: [0.55, 0.28, 0.2],
  },
  {
    id: 'sage',
    name: '苔绿',
    core: [0.92, 0.96, 0.9],
    body: [0.48, 0.64, 0.52],
    aura: [0.28, 0.4, 0.32],
  },
  {
    id: 'mist',
    name: '雾蓝',
    core: [0.9, 0.94, 0.98],
    body: [0.42, 0.55, 0.7],
    aura: [0.24, 0.34, 0.48],
  },
  {
    id: 'mauve',
    name: '藕紫',
    core: [0.95, 0.9, 0.94],
    body: [0.62, 0.45, 0.62],
    aura: [0.38, 0.26, 0.42],
  },
];

export interface VisualSettings {
  /** 粒子团大小倍率（乘在 bodyBase 上），面板范围 0.1–1.0。 */
  bodyScale: number;
  /** 配色主题 id。 */
  theme: string;
  /** 自定义主题的色相（度，0–360）；theme==='custom' 时生效。 */
  hue: number;
  /** 整体亮度倍率。 */
  brightness: number;
  /** 粒子点大小倍率。 */
  pointScale: number;
}

export interface WindowSettings {
  topmost: boolean;
  clickthrough: boolean;
  positionX: number;
  positionY: number;
}

export type AppSettings = VisualSettings & WindowSettings;

export const DEFAULT_SETTINGS: AppSettings = {
  bodyScale: 0.2,
  theme: 'gold',
  hue: 42,
  brightness: 1,
  pointScale: 1,
  topmost: true,
  clickthrough: true,
  positionX: 0.88,
  positionY: 0.84,
};

/** 旧主题 id 迁移，避免用户存档丢配色。 */
const THEME_ALIASES: Record<string, string> = {
  jarvis: 'gold',
  ice: 'mist',
  aurora: 'sage',
  rose: 'terracotta',
  violet: 'mauve',
  sand: 'gold',
  terracotta: 'terracotta',
};

export function migrateThemeId(id: unknown): string {
  if (typeof id !== 'string') return DEFAULT_SETTINGS.theme;
  if (id === 'custom' || COLOR_THEMES.some((t) => t.id === id)) return id;
  return THEME_ALIASES[id] ?? DEFAULT_SETTINGS.theme;
}

const clampNum = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;

const KEY = 'emerge.settings';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      bodyScale: clampNum(parsed.bodyScale, 0.1, 1, DEFAULT_SETTINGS.bodyScale),
      brightness: clampNum(parsed.brightness, 0.5, 1.35, DEFAULT_SETTINGS.brightness),
      pointScale: clampNum(parsed.pointScale, 0.4, 1.6, DEFAULT_SETTINGS.pointScale),
      hue: clampNum(parsed.hue, 0, 360, DEFAULT_SETTINGS.hue),
      theme: migrateThemeId(parsed.theme),
      positionX: normalizePosition(parsed.positionX, DEFAULT_SETTINGS.positionX),
      positionY: normalizePosition(parsed.positionY, DEFAULT_SETTINGS.positionY),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

function hueRotate(rgb: [number, number, number], deg: number): [number, number, number] {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const m = [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.14,
    0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072,
  ];
  const [r, g, b] = rgb;
  const out: [number, number, number] = [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
  return out.map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
}

/** 解析主题（含自定义色相）为三层颜色。 */
export function resolveColors(s: VisualSettings): {
  core: [number, number, number];
  body: [number, number, number];
  aura: [number, number, number];
} {
  if (s.theme === 'custom') {
    // 自定义：以金色为底，按色相旋转；hue 42° 对应金色原色。
    const base = COLOR_THEMES[0];
    return {
      core: hueRotate(base.core, s.hue - 42),
      body: hueRotate(base.body, s.hue - 42),
      aura: hueRotate(base.aura, s.hue - 42),
    };
  }
  const t = COLOR_THEMES.find((c) => c.id === s.theme) ?? COLOR_THEMES[0];
  return { core: t.core, body: t.body, aura: t.aura };
}


export function normalizePosition(value: unknown, fallback = 0.5): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0.05, Math.min(0.95, value)) : fallback;
}

/** 屏幕比例位置映射到相机 z=0 平面；与两种后端 50°、距离 7 一致。 */
export function desktopPosition(x: number, y: number, width: number, height: number): [number, number, number] {
  const halfH = Math.tan(25 * Math.PI / 180) * 7;
  return [(normalizePosition(x) * 2 - 1) * halfH * Math.max(width, 1) / Math.max(height, 1),
    (1 - normalizePosition(y) * 2) * halfH, 0];
}
