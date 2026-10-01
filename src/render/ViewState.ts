/**
 * 观察相机：球坐标环绕 target + 推拉，供 Observatory 与渲染后端共用。
 * 默认与 PointerSystem 的 fov 50°、距离 7 一致；target 默认原点，
 * 桌面摆位后应指向粒子团核心，旋转缩放才不会把主体甩走。
 */

export type Vec3 = [number, number, number];

export interface OrbitCamera {
  /** 方位角（弧度），0 = 正前方 +Z。 */
  azimuth: number;
  /** 仰角（弧度），0 = 水平面。 */
  elevation: number;
  /** 相机到 target 的距离。 */
  distance: number;
  /** 环绕中心（粒子团核心）。 */
  target: Vec3;
}

export const DEFAULT_CAMERA: OrbitCamera = {
  azimuth: 0,
  elevation: 0,
  distance: 7,
  target: [0, 0, 0],
};

export const FOV_Y = (50 * Math.PI) / 180;
export const MIN_DIST = 2.2;
export const MAX_DIST = 16;
export const MIN_ELEV = -1.2;
export const MAX_ELEV = 1.2;

export function clampCamera(cam: OrbitCamera): OrbitCamera {
  return {
    azimuth: cam.azimuth,
    elevation: Math.min(MAX_ELEV, Math.max(MIN_ELEV, cam.elevation)),
    distance: Math.min(MAX_DIST, Math.max(MIN_DIST, cam.distance)),
    target: [...cam.target] as Vec3,
  };
}

/** 球坐标 → 相机位置（看向 target）。 */
export function cameraPosition(cam: OrbitCamera): Vec3 {
  const c = Math.cos(cam.elevation);
  const [tx, ty, tz] = cam.target;
  return [
    tx + cam.distance * c * Math.sin(cam.azimuth),
    ty + cam.distance * Math.sin(cam.elevation),
    tz + cam.distance * c * Math.cos(cam.azimuth),
  ];
}

/** 列主序 lookAt target 的视图矩阵（与 WebGPU uniform 一致）。 */
export function viewMatrix(cam: OrbitCamera): Float32Array {
  const [ex, ey, ez] = cameraPosition(cam);
  const [tx, ty, tz] = cam.target;
  // z 轴：从 target 指向相机（OpenGL lookAt 惯例）。
  let zx = ex - tx;
  let zy = ey - ty;
  let zz = ez - tz;
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  // x = normalize(cross(up, z))，up=(0,1,0)
  let xx = zz;
  let xy = 0;
  let xz = -zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  // y = cross(z, x)
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
  m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
  m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
  m[12] = -(xx * ex + xy * ey + xz * ez);
  m[13] = -(yx * ex + yy * ey + yz * ez);
  m[14] = -(zx * ex + zy * ey + zz * ez);
  m[15] = 1;
  return m;
}

/** CSS 像素 → 过 target、面向相机的平面上的世界坐标（供指针力场使用）。 */
export function cssToWorldOnViewPlane(
  cam: OrbitCamera,
  cssX: number,
  cssY: number,
  viewportW: number,
  viewportH: number,
): Vec3 {
  const aspect = viewportW / Math.max(viewportH, 1);
  const nx = (cssX / viewportW) * 2 - 1;
  const ny = -((cssY / viewportH) * 2 - 1);
  const [ex, ey, ez] = cameraPosition(cam);
  const [tx, ty, tz] = cam.target;
  let fx = tx - ex;
  let fy = ty - ey;
  let fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = normalize(cross(forward, up))，up=(0,1,0) → (-fz, 0, fx)
  let rx = -fz;
  let ry = 0;
  let rxf = fx;
  const rl = Math.hypot(rx, ry, rxf) || 1;
  rx /= rl;
  ry /= rl;
  rxf /= rl;
  // up' = cross(right, forward)
  const ux = ry * fz - rxf * fy;
  const uy = rxf * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  const tan = Math.tan(FOV_Y / 2);
  const dx = fx + rx * nx * tan * aspect + ux * ny * tan;
  const dy = fy + ry * nx * tan * aspect + uy * ny * tan;
  const dz = fz + rxf * nx * tan * aspect + uz * ny * tan;
  // 过 target、法线=forward 的平面：dot(eye + t·d - target, f) = 0
  const denom = dx * fx + dy * fy + dz * fz;
  const t = denom !== 0
    ? -((ex - tx) * fx + (ey - ty) * fy + (ez - tz) * fz) / denom
    : 0;
  return [ex + dx * t, ey + dy * t, ez + dz * t];
}

/** 世界坐标 → CSS 像素（沿视线投影；双击命中粒子团等 UI 判定用）。 */
export function worldToCssOnViewPlane(
  cam: OrbitCamera,
  world: Vec3,
  viewportW: number,
  viewportH: number,
): { x: number; y: number; worldPerPx: number } {
  const [ex, ey, ez] = cameraPosition(cam);
  const [tx, ty, tz] = cam.target;
  let fx = tx - ex;
  let fy = ty - ey;
  let fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = normalize(cross(forward, up))，up=(0,1,0) → (-fz, 0, fx)
  let rx = -fz;
  let ry = 0;
  let rz = fx;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  rz /= rl;
  // up' = cross(right, forward)
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  const dx = world[0] - ex;
  const dy = world[1] - ey;
  const dz = world[2] - ez;
  const depth = Math.max(dx * fx + dy * fy + dz * fz, 0.1);
  const px = dx * rx + dz * rz;
  const py = dx * ux + dy * uy + dz * uz;
  const worldPerPx = (2 * Math.tan(FOV_Y / 2) * depth) / Math.max(viewportH, 1);
  return {
    x: viewportW / 2 + px / worldPerPx,
    y: viewportH / 2 - py / worldPerPx,
    worldPerPx,
  };
}
