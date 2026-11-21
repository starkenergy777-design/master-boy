(() => {
  const registerServiceWorker = () => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('SW registration skipped:', error);
    });
  };

  if (document.readyState === 'complete') {
    registerServiceWorker();
  } else {
    window.addEventListener('load', registerServiceWorker, { once: true });
  }

  // Optional PWA install invitation: never block browsing or force an install.
  // The browser owns the final confirmation dialog and decides eligibility.
  let deferredInstallPrompt = null;
  let installInvitation = null;
  const installedMode = () => window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const removeInstallInvitation = () => {
    installInvitation?.remove();
    installInvitation = null;
  };

  const showInstallInvitation = () => {
    if (installedMode() || installInvitation) return;
    const lang = localStorage.getItem('mb_lang') || 'ka';
    const labels = lang === 'ru'
      ? ['Установить Master Boy', 'Закрыть']
      : lang === 'en'
        ? ['Install Master Boy', 'Dismiss']
        : ['დააყენე Master Boy', 'დახურვა'];

    const panel = document.createElement('div');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', labels[0]);
    panel.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;max-width:370px;margin:0 auto;z-index:9999;display:flex;align-items:center;gap:10px;padding:12px;border-radius:14px;background:#0f172a;color:#f8fafc;border:1px solid #475569;box-shadow:0 10px 30px #0008;font:600 14px system-ui,sans-serif';

    const install = document.createElement('button');
    install.type = 'button';
    install.textContent = labels[0];
    install.style.cssText = 'flex:1;padding:11px 12px;border:0;border-radius:9px;background:#f59e0b;color:#020617;font:700 14px system-ui,sans-serif;cursor:pointer';
    install.addEventListener('click', async () => {
      const promptEvent = deferredInstallPrompt;
      if (!promptEvent) return;
      deferredInstallPrompt = null;
      removeInstallInvitation();
      try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } catch (error) {
        console.warn('PWA install prompt unavailable:', error);
      }
    });

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', labels[1]);
    dismiss.style.cssText = 'border:0;background:transparent;color:#cbd5e1;font:24px system-ui,sans-serif;cursor:pointer;padding:5px';
    dismiss.addEventListener('click', () => {
      removeInstallInvitation();
    });

    panel.append(install, dismiss);
    document.body.appendChild(panel);
    installInvitation = panel;
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    if (installedMode()) return;
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallInvitation();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    removeInstallInvitation();
  });
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => {
    if (installedMode()) removeInstallInvitation();
  });

  const showConnectionNotice = () => {
    window.setTimeout(() => {
      const root = document.getElementById('root');
      if (root && root.querySelector('.mb-initial-loader')) {
        const notice = document.getElementById('mb-connection-notice');
        if (notice) notice.style.display = 'block';
      }
    }, 6000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showConnectionNotice, { once: true });
  } else {
    showConnectionNotice();
  }

  document.getElementById('mb-reload-button')?.addEventListener('click', () => {
    window.location.reload();
  });
})();
