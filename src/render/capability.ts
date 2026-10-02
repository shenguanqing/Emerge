/**
 * GPU 能力探测：记录 WebGPU 适配器与 WebGL2 渲染器信息。
 * 用最小结构探测，避免对 @webgpu/types 的类型耦合。
 */
import { t } from '../i18n';
export interface CapabilityReport {
  webgpu: { available: boolean; adapter: string | null };
  webgl2: { available: boolean; renderer: string | null };
  chosen: 'webgpu' | 'webgl2' | 'none';
  note: string;
}

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter(): Promise<unknown>;
  };
};

export async function probeCapabilities(): Promise<CapabilityReport> {
  const report: CapabilityReport = {
    webgpu: { available: false, adapter: null },
    webgl2: { available: false, renderer: null },
    chosen: 'none',
    note: '',
  };

  const gpu = (navigator as GpuNavigator).gpu;
  if (gpu) {
    try {
      const adapter = (await gpu.requestAdapter()) as
        | { info?: { vendor?: string; architecture?: string; description?: string } }
        | null;
      if (adapter) {
        report.webgpu.available = true;
        const info = adapter.info;
        report.webgpu.adapter = info
          ? [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') ||
            'WebGPU'
          : 'WebGPU';
      }
    } catch {
      report.webgpu.available = false;
    }
  }

  // WebGL2：离屏画布探测，读取真实 renderer 字符串，用完立即释放上下文。
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (gl) {
      report.webgl2.available = true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      report.webgl2.renderer = ext
        ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    report.webgl2.available = false;
  }

  if (report.webgl2.available) {
    report.chosen = 'webgl2';
    report.note = t('note.capabilityWebgl');
  } else if (report.webgpu.available) {
    report.note = t('note.capabilityWebgpu');
  } else {
    report.note = t('note.noBackend');
  }
  return report;
}
