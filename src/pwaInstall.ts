export type PwaInstallState = 'available' | 'unavailable' | 'installed';
export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type InstallStateListener = (state: PwaInstallState) => void;

let deferredInstallPrompt: InstallPromptEvent | null = null;
const listeners = new Set<InstallStateListener>();

function isInstalled(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return displayModeStandalone || iosStandalone;
}

let installState: PwaInstallState = isInstalled() ? 'installed' : 'unavailable';

function publishInstallState(state: PwaInstallState): void {
  installState = state;
  listeners.forEach((listener) => listener(state));
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault();
    deferredInstallPrompt = event as InstallPromptEvent;
    publishInstallState('available');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    publishInstallState('installed');
  });
}

export function getPwaInstallState(): PwaInstallState {
  if (isInstalled()) return 'installed';
  return installState;
}

export function subscribePwaInstallState(listener: InstallStateListener): () => void {
  listeners.add(listener);
  listener(getPwaInstallState());
  return () => listeners.delete(listener);
}

export async function promptPwaInstall(): Promise<PwaInstallOutcome> {
  const installPrompt = deferredInstallPrompt;
  if (!installPrompt) return 'unavailable';

  try {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    deferredInstallPrompt = null;
    publishInstallState(choice.outcome === 'accepted' ? 'installed' : 'unavailable');
    return choice.outcome;
  } catch (error) {
    deferredInstallPrompt = null;
    publishInstallState('unavailable');
    throw error;
  }
}
