// The mechanical arms the monitors hang from (docs/hanging-rig.md): an
// overhead rail just above the default view, hung from the shell on two
// struts, and one arm per monitor. Each arm runs from a carriage on the rail
// down to a pivoting elbow, then to a tilt yoke on the monitor's back, with
// its cable alongside. The monitors' arms are posed once in the layout and
// never move; the console's two follow it up as the viewer leans in.

import * as THREE from 'three';
import type { ArmLayout, HungLayout, LayoutConfig, MonitorLayout } from './layout';
import { consolePose, monitorFrame, rigToWorld } from './rig';
import { chromeMaterial } from '../style/console';
import { physicalMaterial } from '../style/quality';

/** Where the rail runs, in rig space: a gentle arc around the seat, its ends nearer the viewer. */
export function railPoint(cfg: LayoutConfig, x: number, out = new THREE.Vector3()) {
  const r = cfg.rail;
  const t = x / r.halfWidth;
  return rigToWorld(cfg, x, r.y, r.z - r.bow * t * t, out);
}

/** Back of a monitor's case, where its yoke plate mounts, in panel units (local +z faces the viewer). */
const MOUNT_Z = -0.47;
/** How far the yoke stands off the plate, to the wrist pivot. */
const YOKE = 0.42;

/**
 * World points of an arm holding a hung piece at `attach` (panel units on
 * its back): rail carriage, elbow, wrist pivot, yoke plate.
 */
export function armPointsFor(cfg: LayoutConfig, piece: HungLayout, arm: ArmLayout, attach: [number, number]) {
  const f = monitorFrame(cfg, piece);
  const local = (z: number) => new THREE.Vector3(attach[0], attach[1], z).multiplyScalar(f.scale).applyQuaternion(f.quaternion).add(f.position);
  return {
    mount: railPoint(cfg, arm.mount),
    elbow: rigToWorld(cfg, arm.elbow[0], arm.elbow[1], arm.elbow[2]),
    wrist: local(MOUNT_Z - YOKE),
    plate: local(MOUNT_Z),
    frame: f,
  };
}

/** A monitor's arm, meeting its back a little above center. */
export function armPoints(cfg: LayoutConfig, m: MonitorLayout) {
  return armPointsFor(cfg, m, m.arm, [0, m.h * 0.12]);
}

/** The console's two arms, with the console `rise` of the way up (see consolePose). */
export function consoleArmPoints(cfg: LayoutConfig, rise = 0) {
  const pose = consolePose(cfg, rise);
  return cfg.console.arms.map((a) => armPointsFor(cfg, pose, a, a.attach));
}

/** Every arm on the rig: the monitors' and the console's two. */
export function allArmPoints(cfg: LayoutConfig, rise = 0) {
  return [...[cfg.plot, cfg.code, cfg.status, cfg.library].map((m) => armPoints(cfg, m)), ...consoleArmPoints(cfg, rise)];
}

const Y = new THREE.Vector3(0, 1, 0);

/** A cylinder of radius `r` from a to b. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, segments = 16): THREE.Mesh {
  const d = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), segments), mat);
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(Y, d.normalize());
  return mesh;
}

/** A cylinder of radius r and length len centered at p along axis. */
function hub(p: THREE.Vector3, axis: THREE.Vector3, r: number, len: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), mat);
  mesh.position.copy(p);
  mesh.quaternion.setFromUnitVectors(Y, axis.clone().normalize());
  return mesh;
}

export class Arms {
  readonly group = new THREE.Group();
  private readonly metal = physicalMaterial({ color: '#5b6167', metalness: 0.9, roughness: 0.3, clearcoat: 0.2, clearcoatRoughness: 0.25 });
  private readonly chrome = chromeMaterial({ roughness: 0.1 });
  private readonly rubber = physicalMaterial({ color: '#0d0f10', metalness: 0, roughness: 0.65 });
  /** The console's arms, rebuilt as it rises. */
  private readonly consoleArms = new THREE.Group();
  private rise = 0;

  constructor(cfg: LayoutConfig) {
    this.build(cfg);
  }

  relayout(cfg: LayoutConfig): void {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      if (o !== this.consoleArms) o.traverse((c) => (c as THREE.Mesh).geometry?.dispose());
    }
    this.build(cfg);
  }

  /** Re-poses the console's arms for the console `rise` of the way up. */
  setRise(cfg: LayoutConfig, rise: number): void {
    if (rise === this.rise) return;
    this.rise = rise;
    this.buildConsoleArms(cfg);
  }

  private build(cfg: LayoutConfig): void {
    this.rail(cfg);
    for (const m of [cfg.plot, cfg.code, cfg.status, cfg.library]) this.arm(cfg, armPoints(cfg, m), this.group);
    this.group.add(this.consoleArms);
    this.buildConsoleArms(cfg);
    // Never picked: pointer rays pass through to what's behind.
    this.group.traverse((o) => (o.raycast = () => {}));
  }

  private buildConsoleArms(cfg: LayoutConfig): void {
    for (const o of [...this.consoleArms.children]) {
      this.consoleArms.remove(o);
      o.traverse((c) => (c as THREE.Mesh).geometry?.dispose());
    }
    for (const a of consoleArmPoints(cfg, this.rise)) this.arm(cfg, a, this.consoleArms);
    this.consoleArms.traverse((o) => (o.raycast = () => {}));
  }

  private rail(cfg: LayoutConfig): void {
    const r = cfg.rail;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) pts.push(railPoint(cfg, -r.halfWidth + (2 * r.halfWidth * i) / 32));
    const curve = new THREE.CatmullRomCurve3(pts);
    // A squared-off beam: a tube with four sides, rotated to sit flat.
    const beam = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.11, 4, false), this.metal);
    this.group.add(beam);
    for (const end of [pts[0]!, pts[pts.length - 1]!]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 12), this.chrome);
      cap.position.copy(end);
      this.group.add(cap);
    }
    // Two struts up into the shell, out of view above.
    for (const x of [-r.halfWidth * 0.55, r.halfWidth * 0.48]) {
      const a = railPoint(cfg, x);
      const b = a.clone().add(new THREE.Vector3(0, 9, 0));
      this.group.add(rod(a, b, 0.07, this.metal), hub(a, Y, 0.12, 0.26, this.chrome));
    }
  }

  private arm(cfg: LayoutConfig, points: ReturnType<typeof armPointsFor>, parent: THREE.Group): void {
    const { mount, elbow, wrist, plate, frame } = points;
    const k = frame.scale;
    const g = new THREE.Group();

    // Carriage: a rounded sleeve riding the rail, and the turntable it
    // swivels on below it.
    const x = -mount.x; // rig x along the rail
    const along = railPoint(cfg, x + 0.05).sub(railPoint(cfg, x - 0.05)).normalize();
    const carriage = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.22, 8, 20), this.metal);
    carriage.position.copy(mount);
    carriage.quaternion.setFromUnitVectors(Y, along);
    const turntable = hub(mount.clone().add(new THREE.Vector3(0, -0.26, 0)), Y, 0.12, 0.05, this.chrome);
    const shoulder = mount.clone().add(new THREE.Vector3(0, -0.3, 0));
    g.add(carriage, turntable, hub(shoulder, Y, 0.085, 0.08, this.metal));

    // Upper arm and forearm; the forearm a little slimmer.
    g.add(rod(shoulder, elbow, 0.075, this.metal), rod(elbow, wrist, 0.062, this.metal));

    // Elbow: a pivot hub across the plane the arm bends in, chrome caps and
    // pins, a lock collar on the forearm and a clamp knob to set it.
    const up = shoulder.clone().sub(elbow).normalize();
    const down = wrist.clone().sub(elbow).normalize();
    const axis = new THREE.Vector3().crossVectors(up, down);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    g.add(hub(elbow, axis, 0.12, 0.24, this.metal));
    for (const s of [-1, 1]) {
      const cap = elbow.clone().addScaledVector(axis, s * 0.125);
      g.add(hub(cap, axis, 0.095, 0.02, this.chrome), hub(cap.clone().addScaledVector(axis, s * 0.025), axis, 0.03, 0.05, this.chrome));
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 10, 24), this.chrome);
    collar.position.copy(elbow).addScaledVector(down, 0.2);
    collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), down);
    const knobAxis = new THREE.Vector3().crossVectors(down, axis).normalize();
    const knobBase = collar.position.clone().addScaledVector(knobAxis, 0.085);
    g.add(collar, rod(collar.position, knobBase, 0.016, this.chrome));
    const knob = hub(knobBase, knobAxis, 0.038, 0.045, this.metal);
    g.add(knob);

    // Wrist: a tilt yoke, two round cheeks around a pin with chrome ends,
    // on a stem to a round plate on the monitor's back.
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(frame.quaternion);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(frame.quaternion);
    g.add(hub(wrist, side, 0.07, 0.12, this.metal));
    for (const s of [-1, 1]) {
      const cheek = wrist.clone().addScaledVector(side, s * 0.075);
      g.add(hub(cheek, side, 0.085, 0.025, this.metal), hub(cheek.addScaledVector(side, s * 0.02), side, 0.03, 0.03, this.chrome));
    }
    g.add(rod(wrist, plate, 0.04, this.metal));
    g.add(hub(plate.clone().addScaledVector(back, 0.01), back, 0.36 * k, 0.03, this.metal), hub(plate.clone().addScaledVector(back, 0.03), back, 0.07, 0.02, this.chrome));

    // The cable: alongside the arm, looping out around the elbow and
    // sagging a little between clips, into the back of the case.
    const off = (p: THREE.Vector3, d: number) => p.clone().addScaledVector(axis, d);
    const mid = (a: THREE.Vector3, b: THREE.Vector3, sag: number) => a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -sag, 0));
    const cable = new THREE.CatmullRomCurve3([
      off(shoulder, 0.1),
      off(mid(shoulder, elbow, 0.06), 0.11),
      off(elbow, 0.2).addScaledVector(up.clone().add(down).normalize(), -0.12),
      off(mid(elbow, wrist, 0.05), 0.1),
      off(wrist, 0.06).addScaledVector(back, 0.04),
      plate.clone().addScaledVector(side, 0.12).addScaledVector(back, 0.03),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 64, 0.018, 8, false), this.rubber));
    parent.add(g);
  }
}
