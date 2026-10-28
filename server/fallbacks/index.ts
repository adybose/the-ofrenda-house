import type { Role } from '../../src/case/types';
import { patriarch } from './patriarch';
import { painter } from './painter';
import { matriarch } from './matriarch';
import { bookkeeper } from './bookkeeper';
import { housekeeper } from './housekeeper';
import { cook } from './cook';
import { eldestChild } from './eldest-child';
import { doctor } from './doctor';
import { grandmother } from './grandmother';
import { gardener } from './gardener';
import type { RoleFallbacks } from './types';

/** Every role's hand-written lines: the game never depends on the model being there. */
export const FALLBACKS: Record<Role, RoleFallbacks> = { patriarch, painter, matriarch, bookkeeper, housekeeper, cook, eldestChild, doctor, grandmother, gardener };

export { SHADOW_TAUNTS } from './shadow';
export type { RoleFallbacks } from './types';
