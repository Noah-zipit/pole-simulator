import * as THREE from 'three';

/** Neon nightclub: chrome pole, podium, moving spots, beams, haze, audience. */
export class Club {
  group = new THREE.Group();
  private spots: THREE.SpotLight[] = [];
  private beamMats: THREE.MeshBasicMaterial[] = [];
  private ledMat!: THREE.MeshStandardMaterial;
  private time = 0;

  build(scene: THREE.Scene) {
    scene.add(this.group);
    scene.fog = new THREE.FogExp2(0x07060c, 0.055);
    scene.background = new THREE.Color(0x07060c);

    // floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(14, 48),
      new THREE.MeshStandardMaterial({ color: 0x0b0a12, roughness: 0.35, metalness: 0.6 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // podium
    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.25, 0.22, 48),
      new THREE.MeshStandardMaterial({ color: 0x14121c, roughness: 0.3, metalness: 0.7 }),
    );
    podium.position.y = 0.11;
    podium.receiveShadow = true;
    podium.castShadow = true;
    this.group.add(podium);

    // LED ring around podium
    this.ledMat = new THREE.MeshStandardMaterial({
      color: 0x111111, emissive: 0xff2d78, emissiveIntensity: 2.2,
    });
    const led = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.03, 12, 64), this.ledMat);
    led.rotation.x = Math.PI / 2;
    led.position.y = 0.225;
    this.group.add(led);

    // chrome pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 2.7, 24),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 1.0 }),
    );
    pole.position.y = 0.22 + 1.35;
    pole.castShadow = true;
    this.group.add(pole);
    // pole base plate
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.25, metalness: 1 }),
    );
    base.position.y = 0.24;
    this.group.add(base);

    // back wall with neon sign bars
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d0b14, roughness: 0.9 });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 7), wallMat);
    wall.position.set(0, 3.5, -7);
    this.group.add(wall);
    for (let i = 0; i < 7; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 2.2 + (i % 3) * 0.7, 0.08),
        new THREE.MeshStandardMaterial({
          color: 0x111111,
          emissive: i % 2 ? 0x22d3ee : 0xff2d78,
          emissiveIntensity: 2.5,
        }),
      );
      bar.position.set(-6 + i * 2, 2.6, -6.9);
      this.group.add(bar);
    }

    // moving spotlights
    const mkSpot = (color: number, x: number) => {
      const s = new THREE.SpotLight(color, 60, 20, 0.5, 0.45, 1.2);
      s.position.set(x, 5.2, 2.5);
      s.castShadow = true;
      s.shadow.mapSize.set(1024, 1024);
      const tgt = new THREE.Object3D();
      tgt.position.set(0, 1, 0);
      this.group.add(tgt);
      s.target = tgt;
      this.group.add(s);
      this.spots.push(s);
      // visible beam cone
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15, 5.4, 24, 1, true), mat);
      cone.position.set(x, 2.7, 2.5);
      this.group.add(cone);
      this.beamMats.push(mat);
      return s;
    };
    mkSpot(0xff2d78, -2.2);
    mkSpot(0x22d3ee, 2.2);
    mkSpot(0xb14dff, 0);

    // ambient + key
    this.group.add(new THREE.HemisphereLight(0x8877aa, 0x0a0812, 0.55));
    const key = new THREE.DirectionalLight(0xfff0e8, 1.1);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.group.add(key);

    // audience silhouettes (dark capsules in a ring)
    const audMat = new THREE.MeshStandardMaterial({ color: 0x05040a, roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const r = 3.4 + (i % 3) * 0.5;
      const h = 1.5 + ((i * 37) % 10) / 22;
      const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, h, 4, 10), audMat);
      cap.position.set(Math.cos(a) * r, h / 2 + 0.22, Math.sin(a) * r);
      cap.rotation.y = -a + Math.PI / 2;
      this.group.add(cap);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), audMat);
      head.position.set(Math.cos(a) * r, h + 0.42, Math.sin(a) * r);
      this.group.add(head);
    }
  }

  update(dt: number, t: number) {
    this.time = t;
    // sweep spots
    this.spots.forEach((s, i) => {
      const a = t * (0.5 + i * 0.17) + i * 2.1;
      s.target.position.set(Math.cos(a) * 1.6, 0.9, Math.sin(a) * 1.6);
    });
    this.beamMats.forEach((m, i) => {
      m.opacity = 0.07 + 0.05 * Math.sin(t * 2 + i * 1.7);
    });
    // LED ring color cycle pink->cyan
    const hue = (0.92 + 0.12 * Math.sin(t * 0.6) + 1) % 1;
    this.ledMat.emissive.setHSL(hue > 0.5 ? 0.52 : 0.94, 1, 0.55);
  }
}
