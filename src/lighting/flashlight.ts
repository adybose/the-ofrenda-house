import { Object3D, PCFShadowMap, SpotLight, Vector3, type Camera, type Scene, type WebGLRenderer } from 'three';
import { events } from '../core/events';
import { createBattery, stepBattery, toggleFlashlight, type BatteryState } from './battery';
import { LIGHTING } from './config';
import { flashlightIntensity } from './flicker';

declare module '../core/events' {
  interface GameEvents {
    flashlightToggled: { on: boolean };
    batteryChanged: { level: number };
  }
}

const config = LIGHTING.flashlight;

/** The torch: a warm, narrow spotlight held at hand height that lags the view, with a battery. */
export class Flashlight {
  readonly light: SpotLight;
  private readonly target = new Object3D();
  private battery: BatteryState = createBattery();
  private flicker = 0;
  private killedUntil = 0;
  private time = 0;
  private readonly aim = new Vector3(0, 0, -1);
  private aimed = false;
  private lastPercent = 100;

  constructor(scene: Scene, renderer: WebGLRenderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    this.light = new SpotLight(config.color, 0, config.distance, config.angle, config.penumbra, config.decay);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(config.shadowMapSize, config.shadowMapSize);
    this.light.shadow.camera.near = 0.1;
    this.light.shadow.camera.far = config.distance;
    this.light.shadow.bias = -0.0005;
    this.light.shadow.normalBias = 0.02;
    this.light.target = this.target;
    // Never toggle `visible`: changing the number of lights recompiles every material (a long stall).
    // Off is intensity 0, with the shadow map left alone. It is drawn once at the start so the
    // map and its shaders exist before the first F press.
    this.light.shadow.needsUpdate = true;
    scene.add(this.light, this.target);
  }

  get on(): boolean {
    return this.battery.on;
  }

  get level(): number {
    return this.battery.level;
  }

  /** F. Returns whether it is now on. */
  toggle(): boolean {
    const before = this.battery.on;
    this.battery = toggleFlashlight(this.battery);
    if (this.battery.on !== before) events.emit('flashlightToggled', { on: this.battery.on });
    return this.battery.on;
  }

  /** Extra flicker, 0..1 (spec 12, the Shadow drawing near). */
  setFlicker(level: number): void {
    this.flicker = Math.min(1, Math.max(0, level));
  }

  /** The light dies for a while (spec 12, "lights dying"), then comes back by itself. */
  kill(seconds: number): void {
    this.killedUntil = Math.max(this.killedUntil, this.time + seconds);
  }

  /** Follows the camera: held at the hand, aimed where the eye looks, catching up a little late. */
  update(dt: number, camera: Camera): void {
    this.time += dt;
    const wasOn = this.battery.on;
    this.battery = stepBattery(this.battery, dt);
    if (wasOn && !this.battery.on) events.emit('flashlightToggled', { on: false });
    const percent = Math.round(this.battery.level * 100);
    if (percent !== this.lastPercent) {
      this.lastPercent = percent;
      events.emit('batteryChanged', { level: this.battery.level });
    }

    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    if (!this.aimed) {
      this.aim.copy(forward);
      this.aimed = true;
    } else {
      this.aim.lerp(forward, 1 - Math.exp(-config.follow * dt)).normalize();
    }
    this.light.position.set(...config.hand).applyQuaternion(camera.quaternion).add(camera.position);
    this.target.position.copy(this.light.position).addScaledVector(this.aim, 4);

    const factor = this.battery.on
      ? flashlightIntensity({ time: this.time, level: this.battery.level, flicker: this.flicker, killedUntil: this.killedUntil })
      : 0;
    this.light.intensity = config.intensity * factor;
    this.light.shadow.autoUpdate = factor > 0;
  }
}
