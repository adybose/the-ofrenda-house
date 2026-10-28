import { PointLight, type Scene, type Vector3Like } from 'three';
import { LIGHTING } from './config';

const config = LIGHTING.candle;

/**
 * Candle light: a few shadowless point lights, moved each frame to the candles nearest the
 * player (key rooms and the ofrenda), each with its own slow flicker.
 */
export class CandleLights {
  private readonly lights: PointLight[] = [];
  private time = 0;

  constructor(scene: Scene) {
    for (let i = 0; i < config.maxLights; i++) {
      const light = new PointLight(config.color, 0, config.distance, config.decay);
      light.castShadow = false;
      this.lights.push(light);
      scene.add(light);
    }
  }

  update(dt: number, player: Vector3Like, candles: readonly (readonly [number, number, number])[]): void {
    this.time += dt;
    const near = candles
      .map((p) => ({ p, d: Math.hypot(p[0] - player.x, p[2] - player.z) }))
      .filter((c) => c.d <= config.range)
      .sort((a, b) => a.d - b.d);
    this.lights.forEach((light, i) => {
      const candle = near[i];
      // Unused lights stay in the scene at intensity 0: toggling `visible` would recompile every material.
      if (!candle) {
        light.intensity = 0;
        return;
      }
      light.position.set(...candle.p);
      const t = this.time * 7 + i * 13.7;
      light.intensity = config.intensity * (0.82 + 0.1 * Math.sin(t) + 0.08 * Math.sin(t * 2.3 + 1.1));
    });
  }
}
