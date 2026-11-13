import React, { createContext, useContext, useEffect, useState } from 'react';
import FullStudio from './components/FullStudio';
import LaunchPage from './components/LaunchPage';
import { useInputDevice } from './hooks/useInputDevice';
import { useVDFTemplate } from './hooks/useVDFTemplate';
import { useViewport, registerServiceWorker } from './hooks/useResponsive';

// Contexts for standalone web mode
export const DeviceContext = createContext<ReturnType<typeof useInputDevice> | null>(null);
export const TemplateContext = createContext<ReturnType<typeof useVDFTemplate> | null>(null);

export const useDeviceContext = () => {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDeviceContext must be used within DeviceContext.Provider');
  return ctx;
};

export const useTemplateContext = () => {
  const ctx = useContext(TemplateContext);
  if (!ctx) throw new Error('useTemplateContext must be used within TemplateContext.Provider');
  return ctx;
};

export const App: React.FC = () => {
  const deviceState = useInputDevice();
  const templateState = useVDFTemplate();
  const { isCompact } = useViewport();
  const [currentView, setCurrentView] = useState<'launch' | 'studio'>('studio');

  // The PWA shell only registers where the browser allows it (HTTPS or
  // localhost). Over plain-HTTP LAN it silently no-ops and the app still works.
  useEffect(() => {
    registerServiceWorker().then((result) => {
      if (result === 'failed') console.warn('DeckForge: service worker registration failed');
    });
  }, []);

  return (
    <DeviceContext.Provider value={deviceState}>
      <TemplateContext.Provider value={templateState}>
        <div style={{
          width: '100%',
          height: '100dvh',
          backgroundColor: '#0a0a12',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: 0,
          boxSizing: 'border-box',
          overflow: 'hidden',
          position: 'relative',
          minHeight: 0,
        }}>
          {/* Global Quick Switcher. Always an inline row rather than a
              floating overlay: floating it over the studio's own top bar
              collided with the profile/Steam readout at every width the layout
              is used at, since both want the top-right corner. */}
          <div style={{
            position: 'relative',
            zIndex: 10001,
            display: 'flex',
            justifyContent: 'flex-end',
            width: '100%',
            padding: isCompact ? '4px 8px 0' : '4px 16px 0',
            flexShrink: 0,
            backgroundColor: '#0a0a12',
          }}>
            <button
              onClick={() => setCurrentView(currentView === 'launch' ? 'studio' : 'launch')}
              style={{
                padding: isCompact ? '10px 14px' : '6px 12px',
                backgroundColor: 'rgba(26, 26, 46, 0.9)',
                color: '#e94560',
                border: '1px solid #3d3d5c',
                borderRadius: '6px',
                fontSize: isCompact ? '12px' : '11px',
                fontWeight: 700,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              {currentView === 'launch' ? '🎮 Enter Live Studio' : '📖 Architecture & Guides'}
            </button>
          </div>

          {/* Main view. The Deck gets its native 1280x800 box; phones and
              tablets fill the viewport instead of being letterboxed. */}
          <div style={{
            width: '100%',
            height: undefined,
            flex: 1,
            minHeight: 0,
            maxWidth: isCompact ? '100%' : '1280px',
            maxHeight: isCompact ? '100%' : '800px',
            boxShadow: isCompact ? 'none' : '0 0 50px rgba(0, 0, 0, 0.8)',
            position: 'relative',
            backgroundColor: '#161626',
          }}>
            {currentView === 'launch' ? (
              <LaunchPage
                onLaunchStudio={() => setCurrentView('studio')}
                activeDeviceName={deviceState.activeDevice?.name}
                connectionState={deviceState.connectionState}
              />
            ) : (
              <FullStudio />
            )}
          </div>
        </div>
      </TemplateContext.Provider>
    </DeviceContext.Provider>
  );
};

export default App;
