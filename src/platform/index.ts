import { browserPlatform } from './browser';
import { getElectronPlatform } from './electron';
import type { Platform } from './types';

export const platform: Platform = getElectronPlatform() ?? browserPlatform;
export type { Platform } from './types';
