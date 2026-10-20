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
