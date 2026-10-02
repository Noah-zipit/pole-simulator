import * as THREE from 'three';
import type { Dancer } from './dancer';
import { aimBoneQ, solveIKQ, lookAtQ, eulerQ, type PoseCtx } from './pose';

export type DanceState = 'idle' | 'spin' | 'climb' | 'invert' | 'floor' | 'tease';

/**
 * Procedural pole-dance state machine. Model space = centimeters, faces +Z,
 * pole along Y at origin. Root motion is baked into the Hips bone
 * (position + quaternion), everything else is FK/IK in model space.
 */
export class DanceMachine {
  state: DanceState = 'idle';
  stateTime = 0;
  autoMode = true;
  energy = 0.4;
  private autoTimer = 0;
  private autoOrder: DanceState[] = ['idle', 'spin', 'climb', 'spin', 'invert', 'floor', 'idle', 'climb'];
  private autoIdx = 0;

  targets = new Map<string, THREE.Quaternion>();
  hipsPos = new THREE.Vector3();
  hipsQuat = new THREE.Quaternion();
  private restHipsPos = new THREE.Vector3();
  private restHipsQuat = new THREE.Quaternion();

  init(dancer: Dancer) {
    const hips = dancer.bone('Hips');
    if (hips) {
      this.restHipsPos.copy(hips.position);
      this.restHipsQuat.copy(hips.quaternion);
    }
  }

  setState(s: DanceState, auto = false) {
    if (this.state !== s) {
      this.state = s;
      this.stateTime = 0;
      this.autoMode = auto;
      this.autoTimer = 0;
    }
  }

  /** camera target in world space for look-at */
  private camWorld = new THREE.Vector3(0, 1.5, 4);

  setCameraWorld(_dancer: Dancer, camWorld: THREE.Vector3) {
    this.camWorld.copy(camWorld);
  }

  update(dt: number, ctx: PoseCtx) {
    this.stateTime += dt;
    if (this.autoMode) {
      this.autoTimer += dt;
      const dur = this.state === 'idle' ? 7 : 9;
      if (this.autoTimer > dur) {
        this.autoTimer = 0;
        this.autoIdx = (this.autoIdx + 1) % this.autoOrder.length;
        this.state = this.autoOrder[this.autoIdx];
        this.stateTime = 0;
      }
    }
    this.targets.clear();
    const t = this.stateTime;
    const E = this.energy;
    switch (this.state) {
      case 'idle': this.poseIdle(t, ctx, E); break;
      case 'spin': this.poseSpin(t, ctx, E); break;
      case 'climb': this.poseClimb(t, ctx, E); break;
      case 'invert': this.poseInvert(t, ctx, E); break;
      case 'floor': this.poseFloor(t, ctx, E); break;
      case 'tease': this.poseTease(t, ctx, E); break;
    }
    const br = Math.sin(t * 2.2) * 0.03;
    this.blend('Chest', eulerQ(br, 0, 0));
    const d = ctx.dancer;
    d.setMorph('eyeBlinkLeft', blink(t));
    d.setMorph('eyeBlinkRight', blink(t + 0.05));
    d.setMorph('mouthSmileLeft', 0.45 + E * 0.3);
    d.setMorph('mouthSmileRight', 0.45 + E * 0.3);
  }

  /** hips root transform: pos in cm (absolute), yaw/pitch/roll radians */
  private root(px: number, py: number, pz: number, yaw: number, pitch: number, roll = 0) {
    this.hipsPos.set(px, py, pz);
    this.hipsQuat.setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
  }

  private set(name: string, q: THREE.Quaternion | null) {
    if (q) this.targets.set(name, q);
  }
  private blend(name: string, q: THREE.Quaternion | null) {
    if (!q) return;
    const cur = this.targets.get(name);
    this.targets.set(name, cur ? cur.multiply(q) : q.clone());
  }
  private wave(t: number, f: number, a: number, p = 0) {
    return Math.sin(t * f + p) * a;
  }
  private restHips() {
    this.hipsPos.copy(this.restHipsPos);
    this.hipsQuat.copy(this.restHipsQuat);
  }

  // ---------------- poses ----------------

  private poseIdle(t: number, ctx: PoseCtx, E: number) {
    this.restHips();
    const sway = this.wave(t, 1.4, 0.06);
    // shift weight: offset hips x slightly
    this.hipsPos.x += sway * 30;
    this.set('Hips', eulerQ(0, sway * 0.6, sway));
    this.set('Spine', eulerQ(this.wave(t, 1.4, 0.05, 0.4), 0, sway * 0.8));
    this.set('Chest', eulerQ(this.wave(t, 1.4, 0.04, 0.8), sway * 0.4, 0));
    this.gripPole(ctx, 'R', 105);
    this.set('Upper_ArmL', aimBoneQ(ctx, 'Upper_ArmL', new THREE.Vector3(0.5, -0.85, 0.25).normalize()));
    this.set('ElbowL', aimBoneQ(ctx, 'ElbowL', new THREE.Vector3(0.35, -0.9, 0.35).normalize()));
    this.set('Upper_LegR', eulerQ(this.wave(t, 1.4, 0.05), 0, 0.06));
    this.set('Upper_LegL', eulerQ(-this.wave(t, 1.4, 0.05), 0, -0.09));
    this.set('KneeR', eulerQ(0.08, 0, 0));
    this.set('KneeL', eulerQ(0.16, 0, 0));
    this.lookCam(ctx, 'Head', 0.5);
    this.secondary(t, ctx, sway, E);
  }

  private poseSpin(t: number, ctx: PoseCtx, E: number) {
    const speed = 2.6 + E * 1.6;
    const ang = t * speed;
    const r = 34;
    const px = Math.cos(ang) * r, pz = Math.sin(ang) * r;
    // hips at rest height; yaw faces tangent, pitch leans out
    this.root(px, this.restHipsPos.y, pz, -ang + Math.PI / 2, -0.28);
    this.set('Hips', eulerQ(-0.18, 0, 0));
    this.set('Spine', eulerQ(-0.22, 0, this.wave(t, speed, 0.06)));
    this.set('Chest', eulerQ(-0.25, 0, 0));
    this.gripPole(ctx, 'R', 155);
    this.set('Upper_ArmL', aimBoneQ(ctx, 'Upper_ArmL', new THREE.Vector3(-0.85, 0.25, 0.2).normalize()));
    this.set('ElbowL', aimBoneQ(ctx, 'ElbowL', new THREE.Vector3(-0.7, -0.35, 0.3).normalize()));
    const kick = this.wave(t, speed, 0.12);
    this.set('Upper_LegR', eulerQ(-0.5 + kick, 0, 0.15));
    this.set('Upper_LegL', eulerQ(-0.35 - kick, 0, -0.2));
    this.set('KneeR', eulerQ(0.25, 0, 0));
    this.set('KneeL', eulerQ(0.45, 0, 0));
    this.set('FootR', eulerQ(0.5, 0, 0));
    this.set('FootL', eulerQ(0.6, 0, 0));
    this.lookCam(ctx, 'Head', 0.35);
    this.secondary(t, ctx, 0.3, E);
  }

  private poseClimb(t: number, ctx: PoseCtx, E: number) {
    const cycle = (t % 4) / 4;
    const h = this.restHipsPos.y + cycle * 70; // rises ~70cm
    this.root(14, h, 4, Math.PI + this.wave(t, 1.2, 0.15), 0.12);
    const phase = Math.sin(t * 3.2) > 0;
    this.gripPole(ctx, 'R', 135 + (phase ? 25 : -10));
    this.gripPole(ctx, 'L', 135 + (phase ? -10 : 25));
    this.set('Upper_LegR', eulerQ(-1.15, 0, 0.35));
    this.set('KneeR', eulerQ(1.9, 0, 0));
    this.set('Upper_LegL', eulerQ(-0.9, 0, -0.3));
    this.set('KneeL', eulerQ(1.7, 0, 0));
    this.set('Hips', eulerQ(0.25, 0, 0));
    this.set('Spine', eulerQ(-0.12 + this.wave(t, 3.2, 0.05), 0, 0));
    this.lookCam(ctx, 'Head', 0.4);
    this.secondary(t, ctx, 0.1, E);
  }

  private poseInvert(t: number, ctx: PoseCtx, E: number) {
    this.root(10, 135, 0, this.wave(t, 0.8, 0.3), Math.PI - 0.25);
    this.set('Upper_LegR', eulerQ(-0.4, 0, 1.15));
    this.set('KneeR', eulerQ(0.5, 0, 0));
    this.set('Upper_LegL', eulerQ(-0.4, 0, -1.15));
    this.set('KneeL', eulerQ(0.5, 0, 0));
    this.set('FootR', eulerQ(0.4, 0, 0));
    this.set('FootL', eulerQ(0.4, 0, 0));
    this.set('Upper_ArmR', aimBoneQ(ctx, 'Upper_ArmR', new THREE.Vector3(0.7, -0.5, 0.4).normalize()));
    this.set('Upper_ArmL', aimBoneQ(ctx, 'Upper_ArmL', new THREE.Vector3(-0.7, -0.5, 0.4).normalize()));
    this.set('ElbowR', aimBoneQ(ctx, 'ElbowR', new THREE.Vector3(0.4, -0.85, 0.5).normalize()));
    this.set('ElbowL', aimBoneQ(ctx, 'ElbowL', new THREE.Vector3(-0.4, -0.85, 0.5).normalize()));
    this.set('Hips', eulerQ(0.3, 0, 0));
    this.set('Spine', eulerQ(0.35, 0, 0));
    this.lookCam(ctx, 'Head', 0.5);
    this.secondary(t, ctx, 0.15, E);
  }

  private poseFloor(t: number, ctx: PoseCtx, E: number) {
    this.root(55, 28, 35, -1.1 + this.wave(t, 0.7, 0.25), Math.PI / 2 - 0.15);
    const w1 = this.wave(t, 2.4, 0.18);
    const w2 = this.wave(t, 2.4, 0.22, 0.9);
    this.set('Hips', eulerQ(w1 * 0.5, 0, w1));
    this.set('Spine', eulerQ(w1, 0, w2 * 0.5));
    this.set('Chest', eulerQ(w2, 0, w1 * 0.4));
    this.set('Upper_ArmR', aimBoneQ(ctx, 'Upper_ArmR', new THREE.Vector3(0.9, -0.25, 0.2).normalize()));
    this.set('ElbowR', eulerQ(0.2, 0, 0));
    this.set('Upper_ArmL', aimBoneQ(ctx, 'Upper_ArmL', new THREE.Vector3(-0.3, -0.8, 0.5).normalize()));
    this.set('ElbowL', eulerQ(0.9, 0, 0));
    this.set('Upper_LegR', eulerQ(0.55, 0, 0.1));
    this.set('KneeR', eulerQ(0.15, 0, 0));
    this.set('Upper_LegL', eulerQ(-0.5, 0, -0.25));
    this.set('KneeL', eulerQ(1.1, 0, 0));
    this.lookCam(ctx, 'Head', 0.6);
    this.secondary(t, ctx, w1, E);
  }

  private poseTease(t: number, ctx: PoseCtx, E: number) {
    this.restHips();
    const turn = Math.min(t / 2.5, 1) * Math.PI;
    this.hipsQuat.setFromEuler(new THREE.Euler(0, turn, 0, 'YXZ'));
    const s = Math.sin(t * 3) * 0.1;
    this.set('Hips', eulerQ(0, 0, s));
    this.set('Spine', eulerQ(-0.1, 0, s * 0.7));
    this.set('Upper_ArmR', aimBoneQ(ctx, 'Upper_ArmR', new THREE.Vector3(0.35, -0.9, 0.15).normalize()));
    this.set('Upper_ArmL', aimBoneQ(ctx, 'Upper_ArmL', new THREE.Vector3(-0.35, -0.9, 0.15).normalize()));
    this.set('ElbowR', eulerQ(0.35, 0, 0));
    this.set('ElbowL', eulerQ(0.35, 0, 0));
    this.set('Upper_LegR', eulerQ(0, 0, 0.12));
    this.set('Upper_LegL', eulerQ(0, 0, -0.12));
    this.lookCam(ctx, 'Head', 0.9);
    ctx.dancer.setMorph('mouthSmileLeft', 0.85);
    ctx.dancer.setMorph('mouthSmileRight', 0.85);
    this.secondary(t, ctx, s, E);
  }

  // ---------- helpers ----------

  private gripPole(ctx: PoseCtx, side: 'R' | 'L', heightCm: number) {
    const S = side;
    const target = new THREE.Vector3(S === 'R' ? 3 : -3, heightCm, 2);
    const ik = solveIKQ(ctx, `Upper_Arm${S}`, `Elbow${S}`, `Hand${S}`, target,
      new THREE.Vector3(0, 0, S === 'R' ? -1 : 1));
    if (ik) {
      this.set(`Upper_Arm${S}`, ik.root);
      this.set(`Elbow${S}`, ik.mid);
    }
  }

  private lookCam(ctx: PoseCtx, bone: string, w: number) {
    this.set(bone, lookAtQ(ctx, bone, this.camWorld, 0.6 * w + 0.1));
  }

  private secondary(t: number, ctx: PoseCtx, amt: number, E: number) {
    this.set('Hair_Root', eulerQ(this.wave(t, 1.8, 0.08 + Math.abs(amt) * 0.2), this.wave(t, 1.3, 0.06), 0));
    const b = this.wave(t, 2.2, 0.02 + E * 0.03);
    this.set('BreastL', eulerQ(b, 0, 0));
    this.set('BreastR', eulerQ(b, 0, 0));
  }
}

function blink(t: number): number {
  const c = t % 3.7;
  return c < 0.12 ? Math.sin((c / 0.12) * Math.PI) : 0;
}
