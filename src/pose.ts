import * as THREE from 'three';
import type { Dancer } from './dancer';

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();

export interface PoseCtx {
  dancer: Dancer;
}

/** parent world quat of a bone (uses last frame's matrices — fine for damping). */
function parentWorldQ(b: THREE.Bone, out: THREE.Quaternion): THREE.Quaternion {
  if (b.parent) b.parent.getWorldQuaternion(out);
  else out.identity();
  return out;
}

/**
 * Local quaternion that aims the bone's length-axis along a world direction.
 * Returns null if bone/axis unknown.
 */
export function aimBoneQ(ctx: PoseCtx, name: string, dirWorld: THREE.Vector3, roll = 0): THREE.Quaternion | null {
  const b = ctx.dancer.bone(name);
  const axis = ctx.dancer.lenAxis.get(name);
  if (!b || !axis) return null;
  const dir = _v.copy(dirWorld).normalize().clone();
  const q = new THREE.Quaternion().setFromUnitVectors(axis, dir);
  if (roll !== 0) {
    _q2.setFromAxisAngle(dir, roll);
    q.premultiply(_q2);
  }
  const pq = parentWorldQ(b, new THREE.Quaternion()).invert();
  return pq.multiply(q);
}

/**
 * Two-bone IK in world space. Returns local quats for root & mid bones.
 */
export function solveIKQ(
  ctx: PoseCtx,
  rootName: string, midName: string, endName: string,
  targetWorld: THREE.Vector3, bendHintWorld: THREE.Vector3,
): { root: THREE.Quaternion; mid: THREE.Quaternion } | null {
  const { dancer } = ctx;
  const root = dancer.bone(rootName);
  const mid = dancer.bone(midName);
  const end = dancer.bone(endName);
  const axisR = dancer.lenAxis.get(rootName);
  const axisM = dancer.lenAxis.get(midName);
  if (!root || !mid || !end || !axisR || !axisM) return null;

  const pR = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
  const pM0 = new THREE.Vector3().setFromMatrixPosition(mid.matrixWorld);
  const pE0 = new THREE.Vector3().setFromMatrixPosition(end.matrixWorld);
  const a = pM0.distanceTo(pR);
  const bLen = pE0.distanceTo(pM0);
  if (a < 1e-6 || bLen < 1e-6) return null;

  const T = targetWorld.clone();
  const d = THREE.MathUtils.clamp(T.distanceTo(pR), Math.abs(a - bLen) + 1e-4, a + bLen - 1e-4);
  const dirT = T.sub(pR).normalize();

  const hint = bendHintWorld.clone().normalize();
  const n = new THREE.Vector3().crossVectors(dirT, hint);
  if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
  n.normalize();
  const bendDir = new THREE.Vector3().crossVectors(n, dirT).normalize();
  if (bendDir.dot(hint) < 0) bendDir.negate();

  const cosA = THREE.MathUtils.clamp((a * a + d * d - bLen * bLen) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const dirM = dirT.clone().multiplyScalar(cosA).add(bendDir.clone().multiplyScalar(sinA)).normalize();

  const qRootW = new THREE.Quaternion().setFromUnitVectors(axisR, dirM);
  // mid: need M's new world pos to aim at T
  const pM1 = pR.clone().add(dirM.clone().multiplyScalar(a));
  const dirE = T.clone().sub(pM1).normalize();
  const qMidW = new THREE.Quaternion().setFromUnitVectors(axisM, dirE);

  const pqR = parentWorldQ(root, new THREE.Quaternion()).invert();
  const pqM = parentWorldQ(mid, new THREE.Quaternion()).invert();
  return { root: pqR.multiply(qRootW), mid: pqM.multiply(qMidW) };
}

/** Local quat for head look-at with clamp. */
export function lookAtQ(
  ctx: PoseCtx, boneName: string, targetWorld: THREE.Vector3, maxAngle: number,
): THREE.Quaternion | null {
  const b = ctx.dancer.bone(boneName);
  if (!b) return null;
  const pos = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
  const m = new THREE.Matrix4().lookAt(pos, targetWorld, new THREE.Vector3(0, 1, 0));
  const desired = new THREE.Quaternion().setFromRotationMatrix(m);
  const cur = new THREE.Quaternion();
  b.getWorldQuaternion(cur);
  const angle = cur.angleTo(desired);
  const t = angle > 1e-4 ? Math.min(1, maxAngle / angle) : 0;
  const wq = cur.slerp(desired, t).clone();
  const pq = parentWorldQ(b, new THREE.Quaternion()).invert();
  return pq.multiply(wq);
}

/** Local quat from Euler (radians) in bone local space. */
export function eulerQ(x: number, y: number, z: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
}

/** NaN guard for verification. */
export function quatIsValid(q: THREE.Quaternion): boolean {
  return Number.isFinite(q.x + q.y + q.z + q.w) && Math.abs(q.length() - 1) < 1e-3;
}
