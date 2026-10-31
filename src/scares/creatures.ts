import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SphereGeometry,
  Vector3,
  type Material,
} from 'three';
import type { ScareKind } from './scheduler';

// The scares' creatures (spec 13): a bat, a rat and a cat, low-poly, built and animated in code.
// They are lit like the rest of the house, so they show in the torch beam; the cat's eyes glow.

// Black bats (spec 24).
const fur = new MeshLambertMaterial({ color: 0x0e0c0b });
const wingSkin = new MeshLambertMaterial({ color: 0x151112, side: 2 });
const ratFur = new MeshLambertMaterial({ color: 0x4a4038 });
const skin = new MeshLambertMaterial({ color: 0x6a4a44, side: 2 });
const catFur = new MeshLambertMaterial({ color: 0x242120 });
const eyes = new MeshBasicMaterial({ color: 0xd8e04a });

const mesh = (geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0) => {
  const m = new Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
};

/** A bat's wing: a flat triangle reaching out along +x from the shoulder. */
function wing(side: 1 | -1): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, 0, -0.04, side * 0.28, 0.02, 0.02, side * 0.12, 0, 0.1, 0, 0, -0.04, side * 0.22, 0.01, -0.12, side * 0.28, 0.02, 0.02], 3));
  g.computeVertexNormals();
  return g;
}

export interface Creature {
  kind: ScareKind;
  group: Group;
  /** Seconds the scare lasts. */
  seconds: number;
  /** Places it for time `t` since it burst out, from `from`, with `toward` the player (or away from them). */
  pose(t: number, from: Vector3, toward: Vector3): void;
}

function bat(): Creature {
  const group = new Group();
  const body = mesh(new SphereGeometry(0.06, 6, 4).scale(1, 0.8, 1.6), fur);
  const left = new Group();
  const right = new Group();
  left.add(mesh(wing(-1), wingSkin));
  right.add(mesh(wing(1), wingSkin));
  const ears = [-1, 1].map((s) => mesh(new ConeGeometry(0.018, 0.05, 4), fur, s * 0.025, 0.06, -0.06));
  group.add(body, left, right, ...ears);
  // A big one: a wingspan of about a metre.
  group.scale.setScalar(1.8);
  return {
    kind: 'bat',
    group,
    seconds: 1.4,
    pose(t, from, toward) {
      // Swoops at the face, veers past the shoulder and away.
      const k = t / 1.4;
      const past = new Vector3().subVectors(toward, from);
      const target = from.clone().addScaledVector(past, 1.3);
      target.x += Math.sin(k * Math.PI) * 0.6;
      group.position.lerpVectors(from, target, k);
      group.position.y += Math.sin(k * Math.PI) * 0.3;
      group.lookAt(target);
      const flap = Math.sin(t * 2 * Math.PI * 16) * 1.1;
      left.rotation.z = flap;
      right.rotation.z = -flap;
    },
  };
}

function rat(): Creature {
  const group = new Group();
  const body = mesh(new SphereGeometry(0.06, 6, 4).scale(1, 0.75, 2), ratFur, 0, 0.05, 0);
  const head = mesh(new ConeGeometry(0.04, 0.1, 5).rotateX(Math.PI / 2), ratFur, 0, 0.05, 0.15);
  const tail = new Group();
  tail.position.set(0, 0.04, -0.12);
  tail.add(mesh(new CylinderGeometry(0.008, 0.003, 0.22, 4).rotateX(Math.PI / 2).translate(0, 0, -0.11), skin));
  group.add(body, head, tail);
  group.scale.setScalar(1.5);
  return {
    kind: 'rat',
    group,
    seconds: 1.2,
    pose(t, from, toward) {
      // Scurries away from the player along the floor, tail whipping.
      const away = new Vector3().subVectors(from, toward).setY(0).normalize();
      group.position.copy(from).addScaledVector(away, (t / 1.2) * 3);
      group.position.y = 0;
      group.lookAt(group.position.clone().add(away));
      tail.rotation.y = Math.sin(t * 30) * 0.6;
      group.position.y = Math.abs(Math.sin(t * 25)) * 0.015;
    },
  };
}

/** The cat is drawn this much larger than its parts' sizes. */
const SIZE = 1.6;

function cat(): Creature {
  const group = new Group();
  const body = mesh(new SphereGeometry(0.1, 7, 5).scale(1, 0.75, 2), catFur, 0, 0.14, 0);
  const head = mesh(new SphereGeometry(0.07, 7, 5), catFur, 0, 0.2, 0.2);
  const ears = [-1, 1].map((s) => mesh(new ConeGeometry(0.025, 0.06, 4), catFur, s * 0.04, 0.27, 0.2));
  const glow = [-1, 1].map((s) => mesh(new SphereGeometry(0.018, 6, 4), eyes, s * 0.026, 0.21, 0.262));
  const tail = new Group();
  tail.position.set(0, 0.18, -0.18);
  tail.add(mesh(new CylinderGeometry(0.015, 0.01, 0.3, 5).translate(0, 0.15, 0), catFur));
  group.add(body, head, ...ears, ...glow, tail);
  return {
    kind: 'cat',
    group,
    seconds: 1.5,
    pose(t, from, toward) {
      // Crouched and glaring at the player, then it bolts away.
      const look = new Vector3(toward.x, 0, toward.z);
      const away = new Vector3().subVectors(from, toward).setY(0).normalize();
      if (t < 0.8) {
        group.position.copy(from).setY(0);
        group.lookAt(look);
        group.scale.set(SIZE, SIZE * (0.85 + 0.05 * Math.sin(t * 20)), SIZE);
        tail.rotation.x = -0.6 + Math.sin(t * 12) * 0.3;
      } else {
        const k = (t - 0.8) / 0.7;
        group.position.copy(from).addScaledVector(away, k * 2.5).setY(Math.sin(k * Math.PI) * 0.15);
        group.lookAt(group.position.clone().add(away));
        group.scale.setScalar(SIZE);
        tail.rotation.x = -1.2;
      }
    },
  };
}

export function createCreature(kind: ScareKind): Creature {
  return kind === 'bat' ? bat() : kind === 'rat' ? rat() : cat();
}
