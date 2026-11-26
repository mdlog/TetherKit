import { defaultControllerUrl, parseIceServers } from 'tetherkit-core';

export const APP_ID = 'tether-deck';
export const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || null;
export const ICE_SERVERS = parseIceServers(import.meta.env.VITE_ICE_SERVERS);
export const CONTROLLER_URL = defaultControllerUrl(import.meta.env.VITE_PUBLIC_ORIGIN || null);
export const SIBLING_URL =
  import.meta.env.VITE_SIBLING_URL || `${location.protocol}//${location.hostname}:5174/`;
