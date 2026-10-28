/** Every lighting number in one place, so the dark can be tuned without hunting. */
export const LIGHTING = {
  ambient: { color: 0x1c2030, intensity: 0.05 },
  fog: { color: 0x000000, density: 0.075 },
  flashlight: {
    color: 0xfff0d2,
    intensity: 110,
    distance: 18,
    decay: 2,
    /** Half-angle of the cone, radians. */
    angle: 0.42,
    penumbra: 0.45,
    shadowMapSize: 1024,
    /** Where the torch is held, relative to the eye: right, down, forward (metres). */
    hand: [0.18, -0.22, -0.1] as const,
    /** How quickly the beam catches up with the view (per second); lower sways more. */
    follow: 9,
  },
  lightning: {
    color: 0xc4d4ff,
    /** Peak intensity of the light through the window at full strength. */
    intensity: 9,
    /** A faint blue glow over everything, so a strike is felt with no window in view. */
    skyGlow: 0.06,
    /** How brightly window glass glows at the peak of a flash (1 = night). */
    glassGlow: 9,
    /** Light comes in at this angle below horizontal. */
    elevation: 0.65,
    /** Only rendered during a flash, so it can afford to be sharp enough for 4 cm mullions. */
    shadowMapSize: 2048,
    /**
     * Half-size of the shadow box around the window (metres). Anything outside it is lit as if
     * nothing were in the way, so it must cover everything near the player: windowRange plus a margin.
     */
    shadowExtent: 14,
    /** Only windows this close to the player light up the house. */
    windowRange: 12,
    /** Outside (spec 16): light from the sky behind the house, a big shadow box, and a strong sky glow. */
    outdoor: { intensity: 4, skyGlow: 1.4, shadowExtent: 45, from: [-25, 55, -45] as const, towards: [11, 0, 18] as const },
  },
  candle: { color: 0xffa64a, intensity: 2.2, distance: 6, decay: 2, maxLights: 4, range: 14 },
} as const;
