import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import fbxUrl from '../assets/Jill_FBX.fbx?url';

export interface ClothingLayer {
  id: string;
  label: string;
  threshold: number;
  meshes: THREE.Object3D[];
  removed: boolean;
}

/** Loads Jill, builds a name->bone map from the deform skeleton, hides the gun. */
export class Dancer {
  group = new THREE.Group();          // scaled wrapper (meters)
  model!: THREE.Object3D;
  bones = new Map<string, THREE.Bone>();
  /** rest local quats + local length-axis for driven bones */
  restLocal = new Map<string, THREE.Quaternion>();
  lenAxis = new Map<string, THREE.Vector3>();
  layers: ClothingLayer[] = [];
  bodyMesh!: THREE.SkinnedMesh;
  morphIdx = new Map<string, number>();
  clothesMaterial!: THREE.Material;
  /** facing correction applied so she faces +Z */
  facingYaw = 0;

  async load(onProgress?: (p: number) => void): Promise<void> {
    const obj = await new FBXLoader().loadAsync(fbxUrl, (e) => {
      if (onProgress && (e as any).total) onProgress((e as any).loaded / (e as any).total);
    });
    this.setupModel(obj);
  }

  /** post-load setup; separated so Node smoke tests can feed a parsed FBX directly */
  setupModel(obj: THREE.Object3D): void {
    this.model = obj;
    this.group.add(obj);
    this.group.scale.setScalar(0.01); // cm -> m
    obj.updateMatrixWorld(true);

    // bone map from the skinned skeleton (deform bones)
    obj.traverse((o) => {
      if ((o as THREE.Bone).isBone && !this.bones.has(o.name)) {
        this.bones.set(o.name, o as THREE.Bone);
      }
    });

    // body mesh + morphs
    obj.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh && m.name === 'Jill_Body') {
        this.bodyMesh = m;
        if (m.morphTargetDictionary) {
          for (const k of Object.keys(m.morphTargetDictionary)) {
            this.morphIdx.set(k, m.morphTargetDictionary[k]);
          }
        }
      }
    });

    // clothing layers by mesh name
    const byName = (n: string) => {
      let found: THREE.Object3D | null = null;
      obj.traverse((o) => { if (o.name === n) found = o; });
      return found;
    };
    const bra = byName('Bra');
    const spats = byName('Spats');
    // hide gun prop meshes (pole dancer, not a shooter)
    obj.traverse((o) => {
      if (/^(Slide|Magazine|Cartridge|Bullet|Bullet_Case|Gun|Grip|Trigger|Trigger_gaurd)$/.test(o.name)) {
        o.visible = false;
      }
    });
    this.layers = [
      { id: 'bra', label: 'Top', threshold: 60, meshes: bra ? [bra] : [], removed: false },
      { id: 'spats', label: 'Bottoms', threshold: 120, meshes: spats ? [spats] : [], removed: false },
    ];
    // clothes material for outfit recolors
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material) && m.material && (m.material as any).name === 'Jill Clothes Material') {
        this.clothesMaterial = m.material as THREE.Material;
      }
    });

    // store rest pose
    for (const [name, b] of this.bones) {
      this.restLocal.set(name, b.quaternion.clone());
    }
    // length axis per bone (local space, toward first child)
    for (const [name, b] of this.bones) {
      const kids = b.children.filter((c) => (c as THREE.Bone).isBone) as THREE.Bone[];
      if (kids.length > 0) {
        const p0 = new THREE.Vector3(); b.getWorldPosition(p0);
        const p1 = new THREE.Vector3(); kids[0].getWorldPosition(p1);
        const dir = p1.sub(p0);
        if (dir.lengthSq() > 1e-8) {
          // to local space of b
          const inv = b.matrixWorld.clone().invert();
          dir.applyMatrix4(inv).normalize();
          this.lenAxis.set(name, dir);
        }
      }
    }

    // facing correction: rotate wrapper so nose direction -> +Z
    const nose = this.bones.get('DEF-nose') || this.bones.get('DEF-noseL');
    const head = this.bones.get('Head');
    if (nose && head) {
      const pn = new THREE.Vector3(); nose.getWorldPosition(pn);
      const ph = new THREE.Vector3(); head.getWorldPosition(ph);
      const f = pn.sub(ph); f.y = 0;
      if (f.lengthSq() > 1e-6) {
        this.facingYaw = Math.atan2(f.x, f.z); // yaw to rotate facing to +Z
        const inner = new THREE.Group();
        // wrap: put model inside inner group rotated by -facingYaw
        this.group.remove(obj);
        inner.add(obj);
        inner.rotation.y = -this.facingYaw;
        this.group.add(inner);
      }
    }
    this.group.updateMatrixWorld(true);
  }

  bone(name: string): THREE.Bone | undefined {
    return this.bones.get(name);
  }

  /** reset all driven bones to rest */
  resetPose(names: string[]) {
    for (const n of names) {
      const b = this.bones.get(n);
      const q = this.restLocal.get(n);
      if (b && q) b.quaternion.copy(q);
    }
  }

  setMorph(name: string, v: number) {
    const i = this.morphIdx.get(name);
    if (i !== undefined && this.bodyMesh.morphTargetInfluences) {
      this.bodyMesh.morphTargetInfluences[i] = THREE.MathUtils.clamp(v, 0, 1);
    }
  }

  removeLayer(id: string) {
    const l = this.layers.find((x) => x.id === id);
    if (l && !l.removed) {
      l.removed = true;
      for (const m of l.meshes) m.visible = false;
    }
  }

  restoreClothing() {
    for (const l of this.layers) {
      l.removed = false;
      for (const m of l.meshes) m.visible = true;
    }
  }

  setOutfitColor(hex: number) {
    if (this.clothesMaterial && 'color' in this.clothesMaterial) {
      (this.clothesMaterial as THREE.MeshStandardMaterial).color.setHex(hex);
    }
  }
}
