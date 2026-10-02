import * as THREE from 'three';

function makeBillTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7CFF6b';
  g.fillRect(0, 0, 64, 32);
  g.strokeStyle = '#2a7a24';
  g.lineWidth = 3;
  g.strokeRect(2, 2, 60, 28);
  g.fillStyle = '#2a7a24';
  g.font = 'bold 18px sans-serif';
  g.textAlign = 'center';
  g.fillText('$', 32, 23);
  const t = new THREE.CanvasTexture(c);
  return t;
}

interface Bill {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

/** Tip economy: balance, strip thresholds, fluttering dollar bills. */
export class Tips {
  balance = 0;      // spendable now (resets? no — balance IS lifetime here; keep simple)
  lifetime = 0;
  bills: Bill[] = [];
  private group = new THREE.Group();
  private tex: THREE.Texture | null = null;
  private geo: THREE.PlaneGeometry | null = null;
  onThreshold: ((id: string) => void) | null = null;
  private fired = new Set<string>();

  /** strip thresholds in lifetime $ */
  thresholds = [
    { id: 'tease', at: 25 },
    { id: 'bra', at: 60 },
    { id: 'spats', at: 120 },
    { id: 'finale', at: 200 },
  ];

  init(scene: THREE.Scene) {
    scene.add(this.group);
    this.tex = makeBillTexture();
    this.geo = new THREE.PlaneGeometry(0.09, 0.045);
  }

  throw(amount: number, from?: THREE.Vector3) {
    this.balance += amount;
    this.lifetime += amount;
    const n = amount >= 50 ? 26 : amount >= 20 ? 10 : amount >= 5 ? 5 : 2;
    for (let i = 0; i < n; i++) this.spawnBill(from);
    for (const th of this.thresholds) {
      if (this.lifetime >= th.at && !this.fired.has(th.id)) {
        this.fired.add(th.id);
        this.onThreshold?.(th.id);
      }
    }
  }

  stripProgress(): number {
    const max = this.thresholds[this.thresholds.length - 1].at;
    return Math.min(1, this.lifetime / max);
  }

  private spawnBill(from?: THREE.Vector3) {
    if (!this.tex || !this.geo) return;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, side: THREE.DoubleSide, transparent: true });
    const m = new THREE.Mesh(this.geo, mat);
    const ox = (Math.random() - 0.5) * 1.2;
    const oz = (Math.random() - 0.5) * 1.2;
    m.position.set((from?.x ?? 0) + ox, 2.6 + Math.random() * 0.8, (from?.z ?? 0) + oz);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.group.add(m);
    this.bills.push({
      mesh: m,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.25, -0.35 - Math.random() * 0.3, (Math.random() - 0.5) * 0.25),
      spin: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4),
      life: 6,
    });
  }

  update(dt: number) {
    for (let i = this.bills.length - 1; i >= 0; i--) {
      const b = this.bills[i];
      b.life -= dt;
      if (b.mesh.position.y > 0.26) {
        b.mesh.position.addScaledVector(b.vel, dt);
        // flutter
        b.mesh.position.x += Math.sin(b.life * 7 + i) * dt * 0.35;
        b.mesh.rotation.x += b.spin.x * dt;
        b.mesh.rotation.y += b.spin.y * dt;
        b.mesh.rotation.z += b.spin.z * dt;
      } else {
        b.mesh.position.y = 0.245;
        b.mesh.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.2;
      }
      if (b.life < 1.5) {
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, b.life / 1.5);
      }
      if (b.life <= 0) {
        this.group.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        this.bills.splice(i, 1);
      }
    }
  }

  /** sparkle burst at a world position (strip removal) */
  burst(pos: THREE.Vector3, color = 0xffd7e6) {
    const geo = new THREE.BufferGeometry();
    const n = 60;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.035, transparent: true, opacity: 1 });
    const pts = new THREE.Points(geo, mat);
    this.group.add(pts);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
      const s = 1 + Math.random() * 2;
      vel[i * 3] = Math.cos(a) * Math.cos(e) * s;
      vel[i * 3 + 1] = Math.abs(Math.sin(e)) * s + 0.8;
      vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
    }
    let life = 1.1;
    const tick = (dt: number) => {
      life -= dt;
      const arr = (pts.geometry.getAttribute('position') as THREE.BufferAttribute);
      for (let i = 0; i < n; i++) {
        arr.setXYZ(i, arr.getX(i) + vel[i * 3] * dt, arr.getY(i) + vel[i * 3 + 1] * dt, arr.getZ(i) + vel[i * 3 + 2] * dt);
      }
      arr.needsUpdate = true;
      mat.opacity = Math.max(0, life);
      if (life <= 0) {
        this.group.remove(pts);
        geo.dispose(); mat.dispose();
        this.updaters.delete(tick);
      }
    };
    this.updaters.add(tick);
  }

  private updaters = new Set<(dt: number) => void>();
  updateFx(dt: number) {
    this.updaters.forEach((u) => u(dt));
  }
}
