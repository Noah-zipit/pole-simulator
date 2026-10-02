/// <reference types="vite/client" />
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Dancer } from './dancer';
import { DanceMachine, type DanceState } from './dance';
import type { PoseCtx } from './pose';
import { Club } from './club';
import { Tips } from './tips';
import { AudioEngine } from './audio';

const $ = (id: string) => document.getElementById(id)!;

const OUTFITS = [
  { id: 'rose', name: 'Rose', color: 0xff5c8a, price: 0 },
  { id: 'crimson', name: 'Crimson', color: 0xc40f3c, price: 150 },
  { id: 'midnight', name: 'Midnight', color: 0x2a2a44, price: 300 },
  { id: 'gold', name: 'Gold', color: 0xd4af37, price: 500 },
];

class Game {
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera!: THREE.PerspectiveCamera;
  controls!: OrbitControls;
  dancer = new Dancer();
  dance = new DanceMachine();
  club = new Club();
  tips = new Tips();
  audio = new AudioEngine();
  ctx: PoseCtx = { dancer: this.dancer };
  clock = new THREE.Clock();
  autoCam = false;
  camGoal: { pos: THREE.Vector3; tgt: THREE.Vector3 } | null = null;
  transition = 0; // >0 while blending after a state change
  lastState: DanceState = 'idle';
  bought = new Set<string>(['rose']);
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  downPos: { x: number; y: number } | null = null;

  async boot() {
    const app = $('app');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    const pr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.5 : 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    app.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 60);
    this.camera.position.set(0, 1.35, 3.4);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.7;
    this.controls.maxDistance = 9;
    this.controls.maxPolarAngle = Math.PI * 0.55;

    this.club.build(this.scene);
    this.tips.init(this.scene);
    this.tips.onThreshold = (id) => this.stripEvent(id);

    await this.dancer.load();
    this.scene.add(this.dancer.group);
    this.dance.init(this.dancer);
    this.dance.setState('idle', true);
    this.dance.setCameraWorld(this.dancer, this.camera.position);

    this.bindUI();
    window.addEventListener('resize', () => this.resize());

    $('loading').classList.add('hidden');
    if (localStorage.getItem('pole-18') === '1') this.enter();
    else $('gate').classList.remove('hidden');

    this.renderer.setAnimationLoop(() => this.frame());
  }

  enter() {
    $('gate').classList.add('hidden');
    for (const id of ['hud', 'controls', 'cams']) $(id).classList.remove('hidden');
    localStorage.setItem('pole-18', '1');
  }

  private toast(msg: string) {
    const t = $('toast');
    t.textContent = msg;
    t.style.opacity = '1';
    window.clearTimeout((t as any)._tm);
    (t as any)._tm = window.setTimeout(() => (t.style.opacity = '0'), 2600);
  }

  private bindUI() {
    $('gate-yes').onclick = () => { this.audio.unlock(); this.enter(); };
    $('gate-no').onclick = () => { $('gate').innerHTML = '<h1>POLE</h1><p>Come back when you are 18.</p>'; };

    document.querySelectorAll<HTMLButtonElement>('#move-row .chip').forEach((b) => {
      b.onclick = () => {
        this.audio.unlock();
        const s = b.dataset.move as DanceState;
        this.dance.setState(s, false);
        this.transition = 0.6;
        document.querySelectorAll('#move-row .chip').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        this.audio.pop();
      };
    });

    document.querySelectorAll<HTMLButtonElement>('[data-tip]').forEach((b) => {
      b.onclick = () => {
        this.audio.unlock();
        const amt = Number(b.dataset.tip);
        this.tips.throw(amt);
        this.dance.energy = Math.min(1, this.dance.energy + amt / 60);
        if (amt >= 50) this.audio.rain(); else this.audio.coin();
        this.updateHud();
      };
    });

    // tap stage = throw $1 at that spot
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { this.downPos = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', (e) => {
      if (!this.downPos) return;
      const dx = e.clientX - this.downPos.x, dy = e.clientY - this.downPos.y;
      this.downPos = null;
      if (dx * dx + dy * dy > 36) return; // was a drag
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.scene.children, true)[0];
      if (hit) {
        this.audio.unlock();
        this.tips.throw(1, hit.point);
        this.dance.energy = Math.min(1, this.dance.energy + 0.05);
        this.audio.coin();
        this.updateHud();
      }
    });

    document.querySelectorAll<HTMLButtonElement>('#cams .chip').forEach((b) => {
      b.onclick = () => {
        const p = b.dataset.cam;
        const tgt = new THREE.Vector3(0, 1.0, 0);
        const pos =
          p === 'front' ? new THREE.Vector3(0, 1.35, 3.4) :
          p === 'side' ? new THREE.Vector3(3.4, 1.35, 0) :
          p === 'top' ? new THREE.Vector3(0, 5.2, 1.1) :
          new THREE.Vector3(0.4, 1.45, 1.5);
        this.camGoal = { pos, tgt };
        this.autoCam = false;
        $('btn-autocam').classList.remove('active');
      };
    });

    $('btn-autocam').onclick = () => {
      this.autoCam = !this.autoCam;
      $('btn-autocam').classList.toggle('active', this.autoCam);
    };
    $('btn-mute').onclick = () => {
      const m = this.audio.toggleMute();
      $('btn-mute').textContent = m ? 'MUTED' : 'SOUND ON';
    };
    if (this.audio.muted) $('btn-mute').textContent = 'MUTED';

    $('btn-wardrobe').onclick = () => this.renderWardrobe(true);
    $('wardrobe-close').onclick = () => this.renderWardrobe(false);
    $('btn-credits').onclick = () => $('credits').classList.remove('hidden');
    $('credits-close').onclick = () => $('credits').classList.add('hidden');
  }

  private renderWardrobe(show: boolean) {
    $('wardrobe').classList.toggle('hidden', !show);
    if (!show) return;
    const list = $('outfit-list');
    list.innerHTML = '';
    for (const o of OUTFITS) {
      const row = document.createElement('div');
      row.className = 'opt';
      const owned = this.bought.has(o.id);
      row.innerHTML = `<span>${o.name}</span>`;
      const btn = document.createElement('button');
      btn.className = 'chip gold';
      btn.textContent = owned ? 'WEAR' : `$${o.price}`;
      btn.onclick = () => {
        if (!owned) {
          if (this.tips.lifetime < o.price) { this.toast('Not enough lifetime tips'); return; }
          this.bought.add(o.id);
        }
        this.dancer.setOutfitColor(o.color);
        this.dancer.restoreClothing();
        this.audio.pop();
        this.toast(`${o.name} outfit on`);
        this.renderWardrobe(true);
      };
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  private stripEvent(id: string) {
    const msgs: Record<string, string> = {
      tease: 'She likes that… keep tipping',
      bra: 'She drops her top!',
      spats: 'The bottoms come off!',
      finale: 'Full nude — she is all yours tonight',
    };
    this.toast(msgs[id] || '');
    this.audio.cheer();
    this.dance.setState('tease', false);
    this.transition = 0.6;
    const delay = id === 'tease' ? 1200 : 2600;
    window.setTimeout(() => {
      if (id === 'bra') this.dancer.removeLayer('bra');
      if (id === 'spats') this.dancer.removeLayer('spats');
      const p = new THREE.Vector3();
      this.dancer.bone('Upper_Chest')?.getWorldPosition(p);
      this.tips.burst(p, 0xffd7e6);
      if (id !== 'tease') {
        document.querySelectorAll('#move-row .chip').forEach((x) => x.classList.remove('active'));
        this.dance.setState('spin', true); // resume auto show
        this.transition = 0.6;
      } else {
        this.dance.setState('idle', true);
        this.transition = 0.6;
      }
      this.updateHud();
    }, delay);
  }

  private updateHud() {
    $('tips-now').textContent = `$${this.tips.lifetime}`;
    $('tips-life').textContent = `lifetime $${this.tips.lifetime}`;
    $('strip-fill').style.width = `${this.tips.stripProgress() * 100}%`;
  }

  private resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private applyPose(dt: number) {
    const blending = this.transition > 0;
    if (blending) this.transition -= dt;
    const k = blending ? 1 - Math.exp(-9 * dt) : 1;
    // hips root
    const hips = this.dancer.bone('Hips');
    if (hips) {
      if (k >= 1) {
        hips.position.copy(this.dance.hipsPos);
        hips.quaternion.copy(this.dance.hipsQuat);
      } else {
        hips.position.lerp(this.dance.hipsPos, k);
        hips.quaternion.slerp(this.dance.hipsQuat, k);
      }
    }
    for (const [name, target] of this.dance.targets) {
      const b = this.dancer.bone(name);
      if (!b || name === 'Hips') continue;
      if (k >= 1) b.quaternion.copy(target);
      else b.quaternion.slerp(target, k);
    }
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    this.dance.setCameraWorld(this.dancer, this.camera.position);
    this.dance.update(dt, this.ctx);
    this.applyPose(dt);
    this.dancer.group.updateMatrixWorld(true);

    this.club.update(dt, t);
    this.tips.update(dt);
    this.tips.updateFx(dt);
    this.dance.energy = Math.max(0.35, this.dance.energy - dt * 0.05);

    if (this.camGoal) {
      this.camera.position.lerp(this.camGoal.pos, 1 - Math.exp(-5 * dt));
      this.controls.target.lerp(this.camGoal.tgt, 1 - Math.exp(-5 * dt));
      if (this.camera.position.distanceTo(this.camGoal.pos) < 0.03) this.camGoal = null;
    } else if (this.autoCam) {
      const a = t * 0.25;
      const r = this.camera.position.distanceTo(this.controls.target);
      this.camera.position.set(
        this.controls.target.x + Math.cos(a) * r,
        this.camera.position.y,
        this.controls.target.z + Math.sin(a) * r,
      );
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

new Game().boot();
