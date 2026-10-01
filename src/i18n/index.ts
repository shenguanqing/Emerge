/**
 * 轻量 i18n：中文 / 英文双词表，模块级单例，无依赖。
 * localeMode = 'auto' 跟随系统语言；选择持久化在 localStorage（与界面主题同一模式）。
 * t(key, vars) 做 {name} 插值；缺 key 时回落中文，再回落 key 本身。
 */
import { computed, ref } from 'vue';

export type Locale = 'zh' | 'en';
export type LocaleMode = 'auto' | Locale;

const STORAGE_KEY = 'emerge.ui.locale';

function detectLocale(): Locale {
  const lang = (navigator.language || '').toLowerCase();
  return lang.startsWith('zh') ? 'zh' : 'en';
}

function readSavedMode(): LocaleMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en' || saved === 'auto') return saved;
  } catch { /* ignore */ }
  return 'auto';
}

export const localeMode = ref<LocaleMode>(readSavedMode());
export const locale = computed<Locale>(() =>
  localeMode.value === 'auto' ? detectLocale() : localeMode.value,
);

export function setLocaleMode(mode: LocaleMode): void {
  localeMode.value = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* ignore */ }
}

const zh: Record<string, string> = {
  'settings.title': '设置',
  'section.general': '通用',
  'theme.label': '界面主题',
  'theme.auto': '自动',
  'theme.light': '浅色',
  'theme.dark': '深色',
  'lang.label': '语言',
  'lang.auto': '自动',
  'settings.reset': '恢复默认',
  'section.appearance': '外观',
  'appearance.bodySize': '粒子团大小',
  'appearance.brightness': '亮度',
  'appearance.pointSize': '粒子点大小',
  'appearance.palette': '配色',
  'appearance.hue': '色相',
  'palette.custom': '自定义色相',
  'theme.gold': '金',
  'theme.terracotta': '陶土',
  'theme.sage': '苔绿',
  'theme.mist': '雾蓝',
  'theme.mauve': '藕紫',
  'section.behavior': '行为',
  'behavior.topmost': '置顶显示',
  'behavior.topmostDesc': '生命体保持在其它窗口之上',
  'behavior.clickthrough': '鼠标穿透',
  'behavior.clickthroughDesc': '开启后点击直达桌面；关闭后全屏透明主窗口接收点击',
  'behavior.note':
    '设置打开时，粒子层临时穿透且暂停鼠标响应；关闭设置后恢复此开关的选择。',
  'behavior.windowError': '窗口设置未生效：{e}',
  'section.position': '桌面位置',
  'position.desktop': '桌面',
  'position.hint': '拖动光点摆放，松手后固定停留；也可用方向键微调。',
  'section.growth': '成长',
  'growth.waiting': '等待生命体同步成长记录…',
  'growth.companion': '陪伴',
  'growth.days': '使用日',
  'growth.interaction': '温和互动',
  'growth.music': '有效音乐',
  'unit.minutes': '分钟',
  'unit.day': '天',
  'unit.days': '天',
  'growth.sub': '{m} 分钟陪伴 · {d} 个使用日',
  'stage.origin': '形成',
  'stage.awaken': '组织',
  'stage.conscious': '思考',
  'stage.emerge': '涌现',
  'stage.originDesc': '松散粒子云与微小能量核',
  'stage.awakenDesc': '内旋涡与不完整轨道',
  'stage.consciousDesc': '神经网络与能量脉冲',
  'stage.emergeDesc': '多层轨道、弧流与碎片',
  'section.paths': '怎么积累',
  'path.companion': '陪伴',
  'path.companionDesc': '窗口显示时累计，隐藏、关闭与休眠不计。仅靠陪伴也能成熟。',
  'path.interaction': '温和互动',
  'path.interactionDesc':
    '粒子附近的真实低速移动、轻点后的短暂回应。快速划过不计。每日前 20 分钟贡献较高。',
  'path.music': '音乐',
  'path.musicDesc': '连续有声两秒起计，静音不算。每日前 30 分钟贡献较高，之后递减。',
  'paths.note':
    '成长度由三条路径共同推进，只进不退。DNA 只影响成长速度，不限制最终上限。每日递减后仍会继续累计，只是变慢。',
  'section.time': '时间加速',
  'time.virtual': '虚拟时间',
  'time.scale': '时间倍率',
  'time.advance1': '+1 天',
  'time.interaction60': '+60 分钟互动',
  'time.absence3': '模拟离开 3 天',
  'time.reset': '重置生命',
  'time.resetConfirm': '确认重置生命？',
  'time.resetTitle': '清空成长记录，重新开始',
  'time.unlocked': '时间加速已解锁',
  'time.hint': '用于快速观察成长、昼夜与离线回归。',
  'time.lastScale': '时间倍率 ×{n}',
  'time.lastAdvance': '+{n} 天',
  'time.lastInteraction': '+{n} 分钟互动',
  'time.lastAbsence': '模拟离开 {n} 天',
  'time.lastReset': '生命已重置',
  'footer.hint': '关闭本窗口不会退出应用 · 托盘菜单仍可控制',
  'footer.title': '连点 5 次解锁时间加速',
  'aria.bodySizePct': '粒子团大小百分比',
  'aria.brightnessPct': '亮度百分比',
  'aria.pointSizePct': '粒子点大小百分比',
  'aria.hueDeg': '色相角度',
  'diag.backend': '后端',
  'diag.particles': '粒子',
  'diag.mood.calm': '平静',
  'diag.mood.curious': '好奇',
  'diag.mood.alert': '警觉',
  'diag.mood.scared': '受惊',
  'diag.mood.sleepy': '困倦',
  'tier.low': '画质低',
  'tier.medium': '画质中',
  'tier.high': '画质高',
  'tier.ultra': '画质极高',
  'note.webgpuFallback': 'WebGPU 初始化失败，尝试回退 WebGL2',
  'note.noBackend': 'WebGPU 与 WebGL2 均不可用，无法渲染',
  'note.windowRestore': '窗口设置恢复失败：{e}',
  'note.forceBackend': '强制后端 {id}；{adapter}',
  'note.initFailed': '初始化失败',
  'obs.title': '观察空间',
  'music.title': '音乐',
  'music.systemHint': '停止系统监听后才能选择文件音乐。',
  'music.off': '未播放',
  'music.file': '正在播放文件',
  'music.paused': '已暂停 / 等待播放',
  'music.starting': '系统声音连接中…',
  'music.system': '正在监听系统声音',
  'music.select': '选择音乐文件',
  'music.listen': '监听系统声音',
  'music.stopSystem': '停止监听',
  'music.pause': '暂停',
  'music.play': '播放',
  'music.stop': '停止',
  'obs.close': '关闭',
  'obs.ariaClose': '关闭观察空间',
  'obs.aria': '观察空间',
  'obs.days': '使用日',
  'obs.mood': '状态',
  'obs.energy': '能量',
  'obs.trust': '信任',
  'dna.symmetry': '对称',
  'dna.curiosity': '好奇',
  'dna.energy': '能量',
  'dna.growth': '成长',
  'dna.vortex': '旋涡',
  'obs.orbits': '轨道',
  'obs.neural': '神经',
  'obs.arc': '弧流',
  'obs.companionLine': '陪伴 {m} 分钟 · 使用日 {d}',
  'obs.reset': '复位视角',
  'obs.hint': '拖动旋转 · 滚轮缩放 · 方向键微调 · Esc 退出',
  'dbg.title': '时间加速调试',
  'dbg.virtual': '虚拟时间',
  'dbg.scale': '时间倍率',
  'dbg.advance1': '+1 天',
  'dbg.interaction60': '+60 分钟互动',
  'dbg.absence3': '模拟离开 3 天',
  'dbg.reset': '重置生命',
  'dbg.advanceDone': '+{n} 天 ✓',
  'dbg.interactionDone': '+{n} 分钟互动 ✓',
  'dbg.scaleDone': '时间倍率 ×{n} ✓',
  'trayLife': 'ID {id} · {days}{dayWord} · {stage} · 成长 {pct}%',
  'unit.growth': '成长',
};

const en: Record<string, string> = {
  'settings.title': 'Settings',
  'section.general': 'General',
  'theme.label': 'Theme',
  'theme.auto': 'Auto',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'lang.label': 'Language',
  'lang.auto': 'Auto',
  'settings.reset': 'Reset to Defaults',
  'section.appearance': 'Appearance',
  'appearance.bodySize': 'Cluster Size',
  'appearance.brightness': 'Brightness',
  'appearance.pointSize': 'Point Size',
  'appearance.palette': 'Palette',
  'appearance.hue': 'Hue',
  'palette.custom': 'Custom Hue',
  'theme.gold': 'Gold',
  'theme.terracotta': 'Terracotta',
  'theme.sage': 'Sage',
  'theme.mist': 'Mist',
  'theme.mauve': 'Mauve',
  'section.behavior': 'Behavior',
  'behavior.topmost': 'Stay on Top',
  'behavior.topmostDesc': 'Keeps the life form above other windows',
  'behavior.clickthrough': 'Click-through',
  'behavior.clickthroughDesc':
    'When on, clicks pass through to the desktop; when off, the transparent overlay window receives clicks',
  'behavior.note':
    'While settings is open the particle layer is temporarily click-through and pauses mouse responses; your choice is restored after it closes.',
  'behavior.windowError': 'Window settings failed to apply: {e}',
  'section.position': 'Desktop Position',
  'position.desktop': 'Desktop',
  'position.hint': 'Drag the marker to place it; it stays where released. Arrow keys fine-tune.',
  'section.growth': 'Growth',
  'growth.waiting': 'Waiting for the life form to sync its growth…',
  'growth.companion': 'Company',
  'growth.days': 'Days used',
  'growth.interaction': 'Gentle play',
  'growth.music': 'Music heard',
  'unit.minutes': 'min',
  'unit.day': 'day',
  'unit.days': 'days',
  'growth.sub': '{m} min of company · {d} days used',
  'stage.origin': 'Forming',
  'stage.awaken': 'Organizing',
  'stage.conscious': 'Thinking',
  'stage.emerge': 'Emerging',
  'stage.originDesc': 'Loose particle cloud and a tiny energy core',
  'stage.awakenDesc': 'Inner vortex and broken orbits',
  'stage.consciousDesc': 'Neural web and energy pulses',
  'stage.emergeDesc': 'Layered orbits, arc streams and fragments',
  'section.paths': 'How it grows',
  'path.companion': 'Company',
  'path.companionDesc':
    "Counts while the window is visible; hiding, closing and sleep don't count. Company alone is enough to mature.",
  'path.interaction': 'Gentle play',
  'path.interactionDesc':
    "Real slow movement near the particles and brief responses after a tap. Fast swipes don't count. The first 20 minutes each day count more.",
  'path.music': 'Music',
  'path.musicDesc':
    "Counts after two seconds of continuous sound; silence doesn't. The first 30 minutes each day count more, then taper.",
  'paths.note':
    'Growth advances along the three paths and never regresses. DNA only affects speed, not the final ceiling. The daily taper slows accumulation but never stops it.',
  'section.time': 'Time Acceleration',
  'time.virtual': 'Virtual time',
  'time.scale': 'Time scale',
  'time.advance1': '+1 day',
  'time.interaction60': '+60 min play',
  'time.absence3': 'Simulate 3 days away',
  'time.reset': 'Reset life',
  'time.resetConfirm': 'Reset for real?',
  'time.resetTitle': 'Clears all growth and starts over',
  'time.unlocked': 'Time acceleration unlocked',
  'time.hint': 'For quickly previewing growth, day/night and the offline return.',
  'time.lastScale': 'Time scale ×{n}',
  'time.lastAdvance': '+{n} day(s)',
  'time.lastInteraction': '+{n} min play',
  'time.lastAbsence': 'Simulated {n} days away',
  'time.lastReset': 'Life reset',
  'footer.hint': "Closing this window won't quit the app · the tray menu stays in control",
  'footer.title': 'Click 5 times to unlock time acceleration',
  'aria.bodySizePct': 'Cluster size percent',
  'aria.brightnessPct': 'Brightness percent',
  'aria.pointSizePct': 'Point size percent',
  'aria.hueDeg': 'Hue in degrees',
  'diag.backend': 'backend',
  'diag.particles': 'particles',
  'diag.mood.calm': 'calm',
  'diag.mood.curious': 'curious',
  'diag.mood.alert': 'alert',
  'diag.mood.scared': 'startled',
  'diag.mood.sleepy': 'sleepy',
  'tier.low': 'Low',
  'tier.medium': 'Medium',
  'tier.high': 'High',
  'tier.ultra': 'Ultra',
  'note.webgpuFallback': 'WebGPU failed to initialize, falling back to WebGL2',
  'note.noBackend': 'Neither WebGPU nor WebGL2 is available; rendering is disabled',
  'note.windowRestore': 'Failed to restore window settings: {e}',
  'note.forceBackend': 'Forced backend {id}; {adapter}',
  'note.initFailed': 'Initialization failed',
  'obs.title': 'Observatory',
  'music.title': 'Music',
  'music.systemHint': 'Stop system audio before choosing file music.',
  'music.off': 'No music playing',
  'music.file': 'Playing music file',
  'music.paused': 'Paused / waiting to play',
  'music.starting': 'Connecting system audio…',
  'music.system': 'Listening to system audio',
  'music.select': 'Choose music file',
  'music.listen': 'Listen to system audio',
  'music.stopSystem': 'Stop listening',
  'music.pause': 'Pause',
  'music.play': 'Play',
  'music.stop': 'Stop',
  'obs.close': 'Close',
  'obs.ariaClose': 'Close the observatory',
  'obs.aria': 'Observatory',
  'obs.days': 'Days used',
  'obs.mood': 'Mood',
  'obs.energy': 'Energy',
  'obs.trust': 'Trust',
  'dna.symmetry': 'Symmetry',
  'dna.curiosity': 'Curiosity',
  'dna.energy': 'Energy',
  'dna.growth': 'Growth',
  'dna.vortex': 'Vortex',
  'obs.orbits': 'Orbits',
  'obs.neural': 'Neural',
  'obs.arc': 'Arcs',
  'obs.companionLine': '{m} min of company · {d} days used',
  'obs.reset': 'Reset view',
  'obs.hint': 'Drag to rotate · scroll to zoom · arrows to nudge · Esc to exit',
  'dbg.title': 'Time acceleration debug',
  'dbg.virtual': 'Virtual time',
  'dbg.scale': 'Time scale',
  'dbg.advance1': '+1 day',
  'dbg.interaction60': '+60 min play',
  'dbg.absence3': 'Simulate 3 days away',
  'dbg.reset': 'Reset life',
  'dbg.advanceDone': '+{n} day(s) ✓',
  'dbg.interactionDone': '+{n} min play ✓',
  'dbg.scaleDone': 'Time scale ×{n} ✓',
  'trayLife': 'ID {id} · {days} {dayWord} · {stage} · growth {pct}%',
  'unit.growth': 'growth',
};

const messages: Record<Locale, Record<string, string>> = { zh, en };

/** 取当前语言文案；{name} 插值；缺 key 时回落中文，再回落 key。 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = messages[locale.value] ?? zh;
  let text = dict[key] ?? zh[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

const STAGE_LATIN: Record<string, string> = {
  origin: 'Origin',
  awaken: 'Awaken',
  conscious: 'Conscious',
  emerge: 'Emerge',
};

/** 四形态显示名：中文界面用中文词（形成/组织/思考/涌现），英文界面用 Origin 系列拉丁名。 */
export function stageDisplayName(id: string): string {
  const latin = STAGE_LATIN[id];
  if (!latin) return id;
  return locale.value === 'zh' ? t(`stage.${id}`) : latin;
}
