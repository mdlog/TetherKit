import type { DevicePlatform } from '../protocol/types';

export interface BrowserEnvironment {
  platform: DevicePlatform;
  /** Running inside an in-app browser / WKWebView where gyro permission is unreliable. */
  isInAppBrowser: boolean;
  inAppName: string | null;
  hasOrientationEvent: boolean;
  /** iOS 13+ style `DeviceOrientationEvent.requestPermission()` is present. */
  needsOrientationPermission: boolean;
  hasVibration: boolean;
  hasWakeLock: boolean;
  isSecureContext: boolean;
  isTouchDevice: boolean;
}

const IN_APP_PATTERNS: Array<[RegExp, string]> = [
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
  [/Instagram/i, 'Instagram'],
  [/\bLine\//i, 'LINE'],
  [/MicroMessenger/i, 'WeChat'],
  [/WhatsApp/i, 'WhatsApp'],
  [/Twitter|TwitterAndroid/i, 'X / Twitter'],
  [/musical_ly|TikTok|BytedanceWebview/i, 'TikTok'],
  [/Snapchat/i, 'Snapchat'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/Telegram/i, 'Telegram'],
  [/\bGSA\//i, 'Google App'],
];

type OrientationCtor = { requestPermission?: () => Promise<string> };

function orientationCtor(): OrientationCtor | undefined {
  return typeof DeviceOrientationEvent === 'undefined'
    ? undefined
    : (DeviceOrientationEvent as unknown as OrientationCtor);
}

export function detectPlatform(ua: string, maxTouchPoints: number): DevicePlatform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ reports a desktop Safari UA.
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return 'desktop';
  return 'other';
}

export function detectEnvironment(): BrowserEnvironment {
  const nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator;
  const ua = nav?.userAgent ?? '';
  const maxTouchPoints = nav?.maxTouchPoints ?? 0;
  const platform = detectPlatform(ua, maxTouchPoints);
  const ctor = orientationCtor();
  const needsOrientationPermission = typeof ctor?.requestPermission === 'function';

  let inAppName: string | null = null;
  for (const [pattern, name] of IN_APP_PATTERNS) {
    if (pattern.test(ua)) {
      inAppName = name;
      break;
    }
  }
  // iOS WKWebViews omit the "Safari/" token (Chrome/Firefox/Edge on iOS keep it),
  // and in-app iOS views commonly lack requestPermission.
  if (!inAppName && platform === 'ios' && (!/Safari\//.test(ua) || (ctor && !needsOrientationPermission))) {
    inAppName = 'in-app browser';
  }

  return {
    platform,
    isInAppBrowser: inAppName !== null,
    inAppName,
    hasOrientationEvent: ctor !== undefined,
    needsOrientationPermission,
    hasVibration: typeof nav?.vibrate === 'function',
    hasWakeLock: !!nav && 'wakeLock' in nav,
    isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
    isTouchDevice: maxTouchPoints > 0,
  };
}

export type OrientationPermission = 'granted' | 'denied' | 'unavailable';

/**
 * Requests gyro access. MUST be called synchronously from a click/tap handler:
 * iOS rejects the request if it happens after an await, setTimeout or effect.
 * See .kiro/steering/sensor-browser-safety.md rule 1.
 */
export function requestOrientationPermission(): Promise<OrientationPermission> {
  const ctor = orientationCtor();
  if (!ctor) return Promise.resolve('unavailable');
  if (typeof ctor.requestPermission !== 'function') return Promise.resolve('granted');
  try {
    return ctor.requestPermission().then(
      (result) => (result === 'granted' ? 'granted' : 'denied'),
      () => 'denied',
    );
  } catch {
    return Promise.resolve('denied');
  }
}
