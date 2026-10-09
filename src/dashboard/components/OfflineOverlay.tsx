import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

declare const process: { env: { LAUNCHER_HTML: string } };
const launcherHtml: string = process.env.LAUNCHER_HTML;

const STANDALONE_PARAM = 'standalone';
const SLIDESHOW_PARAM = 'slideshow';
const RECONNECT_DELAY_MS = 2000;
const POLL_INTERVAL_MS = 3000;
const MAINTENANCE_CHECK_THRESHOLD = 3; // Number of failed checks before considering it maintenance

type ErrorType = 'network' | 'maintenance' | 'loading';

interface ErrorState {
  type: ErrorType;
  message: string;
  shouldReconnect: boolean;
}

function isPresentationMode(): boolean {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search);
  const isStandalone = query.get(STANDALONE_PARAM) === '1';
  const isSlideshow = query.get(SLIDESHOW_PARAM) === '1';
  const isFullscreen = Boolean(document.fullscreenElement);
  
  // Check if we're in an iframe that's part of a slideshow (parent window has slideshow)
  const isInSlideshowIframe = (() => {
    try {
      if (window.parent && window.parent !== window) {
        const parentQuery = new URLSearchParams(window.parent.location.search);
        return parentQuery.get(SLIDESHOW_PARAM) === '1';
      }
    } catch {
      // Cross-origin iframe, can't access parent
    }
    return false;
  })();
  
  return isStandalone || isSlideshow || isFullscreen || isInSlideshowIframe;
}

// Use lightweight probes so we do not rely only on navigator.onLine.
// Build probe paths relative to the current app root so this works
// correctly when Superset is mounted under a path prefix (e.g. /superset1/).
function getProbePaths(): string[] {
  // Walk up from the current pathname to find the app root.
  // e.g. /superset1/superset/dashboard/1/ → try /superset1/health first,
  // then fall back to absolute paths as a last resort.
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
      
      // Server responded but with an error status
      return { online: false, status: response.status };
    } catch {
      // Keep probing alternate endpoints.
    }
  }
  return { online: false };
}

function determineErrorType(
  failedChecks: number,
  lastStatus?: number,
): ErrorState {
  // If we got a response but it was an error, server is up but something's wrong
  if (lastStatus && lastStatus >= 500) {
    return {
      type: 'maintenance',
      message: 'Dashboard Under Maintenance',
      shouldReconnect: false,
    };
  }

  // Multiple consecutive failures suggest intentional shutdown (maintenance)
  if (failedChecks >= MAINTENANCE_CHECK_THRESHOLD) {
    return {
      type: 'maintenance',
      message: 'Dashboard Under Maintenance',
      shouldReconnect: false,
    };
  }

  // First few failures or network issues
  if (!navigator.onLine) {
    return {
      type: 'network',
      message: 'Network Connection Lost',
      shouldReconnect: true,
    };
  }

  // Server temporarily unreachable
  return {
    type: 'loading',
    message: 'Connecting to Dashboard...',
    shouldReconnect: true,
  };
}

const OfflineOverlay: React.FC = () => {
  const [offline, setOffline] = useState(false);
  const [active, setActive] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [errorState, setErrorState] = useState<ErrorState>({
    type: 'network',
    message: 'Network Connection Lost',
    shouldReconnect: true,
  });
  const offlineRef = useRef(false);
  const checkingRef = useRef(false);
  const reloadingRef = useRef(false);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failedChecksRef = useRef(0);
  const lastStatusRef = useRef<number | undefined>();

  useEffect(() => {
    offlineRef.current = offline;
  }, [offline]);

  // Track standalone/slideshow/fullscreen state with more aggressive checking
  useEffect(() => {
    const update = () => setActive(isPresentationMode());
    update();
    
    document.addEventListener('fullscreenchange', update);
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    
    // Check more frequently for slideshow mode changes
    const id = setInterval(update, 500);
    
    return () => {
      document.removeEventListener('fullscreenchange', update);
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!offline) {
      setIframeLoaded(false);
    }
  }, [offline]);

  useEffect(() => {
    if (!active) {
      checkingRef.current = false;
      reloadingRef.current = false;
      offlineRef.current = false;
      failedChecksRef.current = 0;
      lastStatusRef.current = undefined;
      setOffline(false);
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
      lastStatusRef.current = undefined;
      setOffline(false);

      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
      }
      if (!reloadingRef.current) {
        reloadingRef.current = true;
        reloadTimerRef.current = setTimeout(() => {
          // Check if we're in slideshow or standalone mode
          const query = new URLSearchParams(window.location.search);
          const isSlideshow = query.get(SLIDESHOW_PARAM) === '1';
          const isStandalone = query.get(STANDALONE_PARAM) === '1';
          
          // Don't reload if in slideshow or standalone mode - just let it continue
          // In slideshow mode, the parent slideshow component manages the iframes
          // In standalone mode (fullscreen), reloading would exit fullscreen
          // In both cases, just hiding the overlay is sufficient
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
      lastStatusRef.current = status;
      
      // Determine the error type and message
      const newErrorState = determineErrorType(
        failedChecksRef.current,
        status,
      );
      setErrorState(newErrorState);
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

  // Inject dynamic message into the launcher HTML
  const customHtml = launcherHtml.replace(
    /<\/body>/,
    `
      <style>
        .overlay-message {
          position: fixed;
          bottom: 60px;
          left: 50%;
          transform: translateX(-50%);
          background: ${
            errorState.type === 'maintenance'
              ? 'rgba(220, 38, 38, 0.95)'
              : errorState.type === 'loading'
              ? 'rgba(59, 130, 246, 0.95)'
              : 'rgba(249, 115, 22, 0.95)'
          };
          color: #fff;
          padding: 16px 32px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 100000;
          max-width: 90%;
          text-align: center;
        }
        .status-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #fff;
          flex-shrink: 0;
          ${
            errorState.shouldReconnect
              ? 'animation: statusPulse 1.5s ease-in-out infinite;'
              : ''
          }
        }
        @keyframes statusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        .message-text {
          line-height: 1.4;
        }
        .submessage {
          font-size: 13px;
          opacity: 0.95;
          margin-top: 4px;
          font-weight: 500;
        }
      </style>
      <div class="overlay-message">
        <span class="status-indicator"></span>
        <div class="message-text">
          <div>${errorState.message}</div>
          ${
            errorState.type === 'maintenance'
              ? '<div class="submessage">Please check back later or contact support</div>'
              : errorState.type === 'loading'
              ? '<div class="submessage">This may take a moment...</div>'
              : '<div class="submessage">Attempting to reconnect...</div>'
          }
        </div>
      </div>
    </body>`,
  );

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
        srcDoc={customHtml}
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
      <style>{`
        @keyframes offlinePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.4); }
        }
      `}</style>
    </div>,
    document.body,
  );
};

export default OfflineOverlay;
