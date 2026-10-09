import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

declare const process: { env: { LAUNCHER_HTML: string } };
const launcherHtml: string = process.env.LAUNCHER_HTML;

const STANDALONE_PARAM = 'standalone';
const SLIDESHOW_PARAM = 'slideshow';
const RECONNECT_DELAY_MS = 2000;
const POLL_INTERVAL_MS = 3000;
const MAINTENANCE_CHECK_THRESHOLD = 3; // Number of failed checks before considering it maintenance

function isPresentationMode(): boolean {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search);
  const isStandalone = query.get(STANDALONE_PARAM) === '1';
  const isSlideshow = query.get(SLIDESHOW_PARAM) === '1';
  const isFullscreen = Boolean(document.fullscreenElement);
  return isStandalone || isSlideshow || isFullscreen;
}

function getProbePaths(): string[] {
  const appRoot = window.location.pathname.replace(/^(\/[^/]+)\/.*$/, '$1');
  return [`${appRoot}/health`, '/health', '/favicon.ico'];
}

async function checkConnectivity(): Promise<{ online: boolean; status?: number }> {
  const probePaths = getProbePaths();
  for (const path of probePaths) {
    try {
      const response = await fetch(path, {
        method: 'HEAD',
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (
        response.ok ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 405
      ) {
        return { online: true, status: response.status };
      }
      
      return { online: false, status: response.status };
    } catch {
      // Keep probing alternate endpoints.
    }
  }
  return { online: false };
}

const OfflineOverlay: React.FC = () => {
  const [offline, setOffline] = useState(false);
  const [active, setActive] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const offlineRef = useRef(false);
  const checkingRef = useRef(false);
  const reloadingRef = useRef(false);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failedChecksRef = useRef(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    offlineRef.current = offline;
  }, [offline]);

  // Update iframe content when maintenance state changes
  useEffect(() => {
    if (!iframeLoaded || !iframeRef.current) return;
    
    const iframeDoc = iframeRef.current.contentDocument;
    if (!iframeDoc) return;

    const statusElement = iframeDoc.getElementById('status');
    const loaderElement = iframeDoc.querySelector('.loader');
    
    if (statusElement && loaderElement) {
      if (isMaintenance) {
        statusElement.innerHTML = 'Dashboard Under Maintenance<br><span style="font-size: 1.2rem; opacity: 0.9;">The dashboard will be restored soon</span>';
        loaderElement.style.display = 'none';
      } else {
        statusElement.innerHTML = 'Reconnecting<div class="loader"></div>';
      }
    }
  }, [isMaintenance, iframeLoaded]);

  useEffect(() => {
    const update = () => setActive(isPresentationMode());
    update();
    document.addEventListener('fullscreenchange', update);
    window.addEventListener('popstate', update);
    const id = setInterval(update, 1000);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      window.removeEventListener('popstate', update);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!offline) {
      setIframeLoaded(false);
      setIsMaintenance(false);
      failedChecksRef.current = 0;
    }
  }, [offline]);

  useEffect(() => {
    if (!active) {
      checkingRef.current = false;
      reloadingRef.current = false;
      offlineRef.current = false;
      failedChecksRef.current = 0;
      setOffline(false);
      setIsMaintenance(false);
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      return undefined;
    }

    const goOnline = () => {
      if (!offlineRef.current) return;

      offlineRef.current = false;
      failedChecksRef.current = 0;
      setOffline(false);
      setIsMaintenance(false);

      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
      }
      if (!reloadingRef.current) {
        reloadingRef.current = true;
        reloadTimerRef.current = setTimeout(() => {
          const query = new URLSearchParams(window.location.search);
          const isSlideshow = query.get(SLIDESHOW_PARAM) === '1';
          const isStandalone = query.get(STANDALONE_PARAM) === '1';
          
          if (!isSlideshow && !isStandalone) {
            window.location.reload();
          }
        }, RECONNECT_DELAY_MS);
      }
    };

    const goOffline = (status?: number) => {
      if (reloadingRef.current && reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
        reloadingRef.current = false;
      }

      if (offlineRef.current) return;

      offlineRef.current = true;
      failedChecksRef.current += 1;
      
      // Check if this is maintenance (multiple failures or 500 error)
      const isMaintenanceMode = 
        failedChecksRef.current >= MAINTENANCE_CHECK_THRESHOLD || 
        (status !== undefined && status >= 500);
      
      setIsMaintenance(isMaintenanceMode);
      setOffline(true);
    };

    const verifyConnectivity = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        if (!navigator.onLine) {
          goOffline();
          return;
        }

        const { online, status } = await checkConnectivity();
        if (online) {
          goOnline();
        } else {
          goOffline(status);
        }
      } finally {
        checkingRef.current = false;
      }
    };

    const handleOffline = () => goOffline();
    const handleOnline = () => {
      void verifyConnectivity();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    const pollInterval = setInterval(() => {
      void verifyConnectivity();
    }, POLL_INTERVAL_MS);
    void verifyConnectivity();

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      checkingRef.current = false;
      reloadingRef.current = false;
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [active]);

  if (!active || !offline) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        overflow: 'hidden',
      }}
    >
      <iframe
        ref={iframeRef}
        srcDoc={launcherHtml}
        title="Offline"
        onLoad={() => setIframeLoaded(true)}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          opacity: iframeLoaded ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}
      />
    </div>,
    document.body,
  );
};

export default OfflineOverlay;
