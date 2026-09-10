import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;

type InstallChangeListener = (canInstall: boolean) => void;
type UpdateAvailableListener = (reload: () => void) => void;
type OnlineStatusListener = (isOnline: boolean) => void;

const installListeners = new Set<InstallChangeListener>();
const updateListeners = new Set<UpdateAvailableListener>();
const onlineListeners = new Set<OnlineStatusListener>();

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function initPWA() {
  if (import.meta.env.DEV) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.unregister();
        }
      }).catch(() => {});
    }
    return;
  }

  // 1. Service Worker & Update Checking
  try {
    updateSWFn = registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log('[PWA] New version of FlipBlue is available.');
        notifyUpdateAvailable();
      },
      onOfflineReady() {
        console.log('[PWA] FlipBlue is ready for offline use.');
      },
      onRegistered(r) {
        console.log('[PWA] Service Worker registered.');
        if (r) {
          // Check for SW updates periodically every 30 minutes
          setInterval(() => {
            r.update().catch((err) => console.log('[PWA] Update check failed:', err));
          }, 30 * 60 * 1000);
        }
      },
      onRegisterError(error) {
        console.warn('[PWA] SW registration failed:', error);
      },
    });
  } catch (err) {
    console.warn('[PWA] registerSW error:', err);
  }

  // 2. Install prompt listener
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    installListeners.forEach((l) => l(true));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installListeners.forEach((l) => l(false));
  });

  // 3. Connectivity status
  window.addEventListener('online', () => {
    onlineListeners.forEach((l) => l(true));
  });

  window.addEventListener('offline', () => {
    onlineListeners.forEach((l) => l(false));
  });
}

function notifyUpdateAvailable() {
  const reload = () => {
    if (updateSWFn) {
      updateSWFn(true);
    } else {
      window.location.reload();
    }
  };
  updateListeners.forEach((l) => l(reload));
}

export function promptPWAInstall(): Promise<boolean> {
  if (!deferredPrompt) {
    return Promise.resolve(false);
  }
  return deferredPrompt.prompt().then(() => {
    return deferredPrompt!.userChoice.then((choice) => {
      deferredPrompt = null;
      installListeners.forEach((l) => l(false));
      return choice.outcome === 'accepted';
    });
  });
}

export function onInstallableChange(listener: InstallChangeListener): () => void {
  installListeners.add(listener);
  listener(!isStandalone() && !!deferredPrompt);
  return () => installListeners.delete(listener);
}

export function onUpdateAvailable(listener: UpdateAvailableListener): () => void {
  updateListeners.add(listener);
  return () => updateListeners.delete(listener);
}

export function onOnlineStatusChange(listener: OnlineStatusListener): () => void {
  onlineListeners.add(listener);
  listener(navigator.onLine);
  return () => onlineListeners.delete(listener);
}
