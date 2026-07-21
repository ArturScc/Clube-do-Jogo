'use client';

import { useEffect } from 'react';

export function PwaRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // O servidor de desenvolvimento do Next troca chunks com frequência. Um
    // service worker cacheando esses arquivos pode alternar versões e causar
    // recarregamentos contínuos; PWA fica ativo somente no build de produção.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister())));
      return;
    }

    const register = () => { void navigator.serviceWorker.register('/sw.js'); };
    window.addEventListener('load', register);
    if (document.readyState === 'complete') register();
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
