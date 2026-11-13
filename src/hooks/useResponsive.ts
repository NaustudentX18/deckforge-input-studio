// Responsive and platform helpers.
//
// Kept dependency-free and tiny: these run in the Decky CEF overlay, a desktop
// browser, and a phone, so the only reliable signal is the viewport and the
// pointer type rather than any user-agent sniffing.

import { useEffect, useState } from 'react';

export type LayoutMode = 'compact' | 'wide';

/**
 * Width at or below which the single-column phone layout applies.
 *
 * 900 rather than a typical 700: the studio's control bar needs roughly this
 * much room before it stops crowding, so anything narrower (phones in
 * landscape, small tablets) gets the stacked mobile chrome instead of a
 * squeezed desktop bar with clipped labels.
 */
export const COMPACT_MAX_WIDTH = 900;

function readViewport(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Track the viewport size and derive a layout mode.
 *
 * Listens to both `resize` and `orientationchange` because a phone reporting a
 * stale `innerWidth` right after rotation is common; `visualViewport` catches
 * the keyboard-inset case that `innerWidth` misses.
 */
export function useViewport(): { width: number; height: number; mode: LayoutMode; isCompact: boolean } {
  const [size, setSize] = useState(readViewport);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      // Coalesce the burst of resize events during rotation.
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSize(readViewport()));
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  const isCompact = size.width <= COMPACT_MAX_WIDTH;
  return { ...size, mode: isCompact ? 'compact' : 'wide', isCompact };
}

/** True when the primary pointer is coarse (touch), i.e. hit targets need to be big. */
export function useIsTouch(): boolean {
  const [touch, setTouch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
  });

  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: coarse)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setTouch(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return touch;
}

/** Minimum comfortable touch target, per the 44px guidance. */
export const TOUCH_TARGET = 44;

/**
 * Register the service worker.
 *
 * Only in a secure context: browsers refuse SW registration over plain HTTP to a
 * non-localhost origin, so registering on the LAN URL would just throw. The app
 * stays fully functional without it — the PWA install is the only thing lost.
 */
export async function registerServiceWorker(): Promise<'registered' | 'unsupported' | 'insecure' | 'failed'> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return 'registered';
  } catch {
    return 'failed';
  }
}

/** The browser's deferred install prompt, kept across renders. */
interface DeferredInstallPrompt extends Event {
  prompt?: () => Promise<void>;
  userChoice?: Promise<{ outcome: string }>;
}

let deferredInstallPrompt: DeferredInstallPrompt | null = null;

/** Ask the browser whether the app can be installed right now. */
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Keep the event so the UI can trigger it from a real user gesture.
      deferredInstallPrompt = e as DeferredInstallPrompt;
      e.preventDefault();
      setCanInstall(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setCanInstall(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari exposes standalone-ness on navigator instead of a media query.
    const iosStandalone =
      'standalone' in navigator && navigator.standalone === true;
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches || iosStandalone;
    if (standalone) setInstalled(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<boolean> => {
    const evt = deferredInstallPrompt;
    if (!evt?.prompt) return false;
    await evt.prompt();
    const choice = await evt.userChoice;
    deferredInstallPrompt = null;
    return choice?.outcome === 'accepted';
  };

  return { canInstall, installed, promptInstall };
}
