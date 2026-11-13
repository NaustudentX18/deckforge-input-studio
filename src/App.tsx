import React, { createContext, useContext, useState } from 'react';
import FullStudio from './components/FullStudio';
import LaunchPage from './components/LaunchPage';
import { useInputDevice } from './hooks/useInputDevice';
import { useVDFTemplate } from './hooks/useVDFTemplate';

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
  const [currentView, setCurrentView] = useState<'launch' | 'studio'>('studio');

  return (
    <DeviceContext.Provider value={deviceState}>
      <TemplateContext.Provider value={templateState}>
        <div style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: '#0a0a12',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: 0,
          boxSizing: 'border-box',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {/* Global Quick Switcher Bar (Web & Secondary Tablet Mode) */}
          <div style={{
            position: 'absolute',
            top: '8px',
            right: '16px',
            zIndex: 10001,
            display: 'flex',
            gap: '8px',
          }}>
            <button
              onClick={() => setCurrentView(currentView === 'launch' ? 'studio' : 'launch')}
              style={{
                padding: '6px 12px',
                backgroundColor: 'rgba(26, 26, 46, 0.9)',
                color: '#e94560',
                border: '1px solid #3d3d5c',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              {currentView === 'launch' ? '🎮 Enter Live Studio' : '📖 Architecture & Guides'}
            </button>
          </div>

          {/* Main FullStudio View container constrained to Steam Deck ratio */}
          <div style={{
            width: '100%',
            height: '100%',
            maxWidth: '1280px',
            maxHeight: '800px',
            boxShadow: '0 0 50px rgba(0, 0, 0, 0.8)',
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
