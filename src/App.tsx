import React, { createContext, useContext } from 'react';
import FullStudio from './components/FullStudio';
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

  return (
    <DeviceContext.Provider value={deviceState}>
      <TemplateContext.Provider value={templateState}>
        <div style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: '#0e0e17',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: 0,
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}>
          {/* Main FullStudio View container constrained to Steam Deck ratio */}
          <div style={{
            width: '100%',
            height: '100%',
            maxWidth: '1280px',
            maxHeight: '800px',
            boxShadow: '0 0 50px rgba(0, 0, 0, 0.8)',
            position: 'relative'
          }}>
            <FullStudio />
          </div>
        </div>
      </TemplateContext.Provider>
    </DeviceContext.Provider>
  );
};

export default App;
