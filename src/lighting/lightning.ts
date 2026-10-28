import { Color, DirectionalLight, HemisphereLight, Object3D, type MeshBasicMaterial, type Scene } from 'three';
import { events } from '../core/events';
import type { Rng } from '../core/rng';
import { LIGHTING } from './config';
import { createLightningSchedule, flashLevel, strikeShape, type Strike } from './schedule';
import type { WindowSpot } from './windows';

declare module '../core/events' {
  interface GameEvents {
    lightning: { strength: number; distanceKm: number };
  }
}

const config = LIGHTING.lightning;
/** Height of the middle of a tall window. */
const WINDOW_MIDDLE = 1.75;
/** Metres the shadow camera sits back up the light ray from the window (see aim). */
const SHADOW_SETBACK = 1.3;

export interface StrikeOptions {
  strength?: number;
  distanceKm?: number;
  /** Shine through this window instead of the nearest one (the light lab). */
  spot?: WindowSpot;
  /** Sideways angle of the light through the window, radians (random if left out). */
  yaw?: number;
}

/**
 * Lightning: seeded strikes, each a few blue-white pulses through the nearest exterior window.
 * The shadow camera sits on the window itself, so only the window's frame and mullions (and the
 * room) cast shadows, never anything outside, and the bars of the window fall across the floor.
 */
export class Lightning {
  readonly light: DirectionalLight;
  private readonly sky: HemisphereLight;
  private readonly target = new Object3D();
  private readonly schedule: { next(): Strike };
  private upcoming: Strike;
  private active: { strike: Strike; startedAt: number } | undefined;
  private held: number | undefined;
  private time = 0;

  constructor(
    scene: Scene,
    private readonly options: {
      rng: Rng;
      /** The window to use for a strike right now, if any is near enough. */
      window(): WindowSpot | undefined;
      glass: MeshBasicMaterial;
      /** Seconds between strikes, overriding the seeded 20-60 s (debug and fps runs). */
      every?: number;
      /** Called when a strike's last pulse has faded (spec 03 reshuffles then). */
      onEnd?(): void;
      /** True while the player is outside the house (spec 16): light from the sky, not a window. */
      outdoors?(): boolean;
      /** Every frame, the flash level 0..1 (the sky and rain outside brighten with it). */
      onFlash?(level: number): void;
      /** Seconds until the first strike, overriding the schedule. */
      firstIn?: number;
    },
  ) {
    this.light = new DirectionalLight(config.color, 0);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(config.shadowMapSize, config.shadowMapSize);
    const shadowCamera = this.light.shadow.camera;
    shadowCamera.left = -config.shadowExtent;
    shadowCamera.right = config.shadowExtent;
    shadowCamera.top = config.shadowExtent;
    shadowCamera.bottom = -config.shadowExtent;
    shadowCamera.near = 0;
    shadowCamera.far = 40;
    this.light.shadow.bias = -0.0008;
    this.light.shadow.normalBias = 0.03;
    this.light.target = this.target;
    // Always in the scene (toggling `visible` recompiles every material); dark is intensity 0, and
    // the shadow map is only rendered during a flash.
    this.light.shadow.autoUpdate = false;
    // Drawn once at the start so the 2048 px map and its shaders exist before the first strike.
    this.light.shadow.needsUpdate = true;
    this.sky = new HemisphereLight(config.color, 0x000000, 0);
    scene.add(this.light, this.target, this.sky);
    this.schedule = createLightningSchedule(options.rng.fork('schedule'));
    this.upcoming = this.nextStrike();
    if (options.firstIn !== undefined) this.upcoming = { ...this.upcoming, at: options.firstIn };
  }

  private nextStrike(): Strike {
    const strike = this.schedule.next();
    if (!this.options.every) return strike;
    return { ...strike, at: this.time + this.options.every };
  }

  /** A strike now (story scripts, debug). Returns what struck. */
  strike(options: StrikeOptions = {}): Strike {
    const rng = this.options.rng.fork(`manual:${this.time}`);
    const strength = options.strength ?? 0.6 + rng.float() * 0.4;
    const strike: Strike = { at: this.time, strength, distanceKm: options.distanceKm ?? 0.3 + (1 - strength) * 4, pulses: strikeShape(rng, strength) };
    this.begin(strike, options, rng);
    return strike;
  }

  /** Holds the flash at a fixed level (0..1) for screenshots and the light lab; undefined lets go. */
  hold(level: number | undefined, options: StrikeOptions = {}): void {
    this.held = level;
    if (level !== undefined) this.aim(options.spot ?? this.options.window(), options.yaw ?? 0);
  }

  private begin(strike: Strike, options: StrikeOptions, rng: Rng): void {
    this.active = { strike, startedAt: this.time };
    this.aim(options.spot ?? this.options.window(), options.yaw ?? (rng.float() - 0.5) * 0.7);
    events.emit('lightning', { strength: strike.strength, distanceKm: strike.distanceKm });
  }

  private aim(spot: WindowSpot | undefined, yaw: number): void {
    const shadowCamera = this.light.shadow.camera;
    if (this.options.outdoors?.()) {
      // From the sky behind the house: it stands black against the flash, and throws its shadow
      // and the trees' across the grounds towards the player.
      const { from, towards, shadowExtent } = config.outdoor;
      this.light.position.set(...from);
      this.target.position.set(...towards);
      this.target.updateMatrixWorld();
      shadowCamera.left = shadowCamera.bottom = -shadowExtent;
      shadowCamera.right = shadowCamera.top = shadowExtent;
      shadowCamera.far = 160;
      shadowCamera.updateProjectionMatrix();
      this.light.userData.window = 'sky';
      return;
    }
    shadowCamera.left = shadowCamera.bottom = -config.shadowExtent;
    shadowCamera.right = shadowCamera.top = config.shadowExtent;
    shadowCamera.far = 40;
    shadowCamera.updateProjectionMatrix();
    if (!spot) {
      this.light.userData.window = undefined;
      return;
    }
    // Into the room through the glass, turned a little sideways, angled down.
    const [ox, oz] = spot.outward;
    const ix = -ox * Math.cos(yaw) - -oz * Math.sin(yaw);
    const iz = -ox * Math.sin(yaw) + -oz * Math.cos(yaw);
    const down = Math.sin(config.elevation);
    const flat = Math.cos(config.elevation);
    // The shadow camera's near plane is square to the light, not to the wall, so it sits back up
    // the ray (outside, in the empty space beyond an exterior window): far enough that the room's
    // own ceiling and the wall above the window are in front of it and block the light, while
    // anything further outside stays behind it.
    const back = SHADOW_SETBACK;
    this.light.position.set(spot.x - ix * flat * back, WINDOW_MIDDLE + down * back, spot.z - iz * flat * back);
    this.target.position.set(this.light.position.x + ix * flat, this.light.position.y - down, this.light.position.z + iz * flat);
    this.target.updateMatrixWorld();
    this.light.userData.window = spot;
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.active && this.held === undefined && this.time >= this.upcoming.at) {
      const strike = this.upcoming;
      this.upcoming = this.nextStrike();
      this.begin(strike, {}, this.options.rng.fork(`strike:${strike.at}`));
    }

    let level = this.held ?? 0;
    if (this.active) {
      const t = this.time - this.active.startedAt;
      level = Math.max(level, flashLevel(this.active.strike, t));
      const end = Math.max(...this.active.strike.pulses.map((p) => p.start + p.duration));
      if (t > end) {
        this.active = undefined;
        this.options.onEnd?.();
      }
    }

    const throughWindow = this.light.userData.window !== undefined;
    const outdoors = this.options.outdoors?.() ?? false;
    const lit = level > 0 && throughWindow;
    this.light.intensity = lit ? (outdoors ? config.outdoor.intensity : config.intensity) * level : 0;
    this.light.shadow.autoUpdate = lit;
    this.sky.intensity = (outdoors ? config.outdoor.skyGlow : config.skyGlow) * level;
    this.options.onFlash?.(level);
    this.options.glass.color = new Color().setScalar(1 + config.glassGlow * level);
  }

  /** Seconds until the next scheduled strike (debug). */
  get nextIn(): number {
    return this.upcoming.at - this.time;
  }
}
