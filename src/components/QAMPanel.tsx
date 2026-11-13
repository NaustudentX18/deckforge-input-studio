import React, { useState, useEffect, FC } from 'react';
import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  ToggleField,
  DropdownItem,
  Navigation,
} from '@decky/ui';
import { useInputDevice } from '../hooks/useInputDevice';
import { useVDFTemplate } from '../hooks/useVDFTemplate';
import { VDFTemplate } from '../types';
import { apiFetch } from '../api/client';

export const QAMPanel: FC = () => {
  const [showMonitor, setShowMonitor] = useState<boolean>(false);
  const [injectStatus, setInjectStatus] = useState<string | null>(null);

  const {
    devices,
    activeDevice,
    activeDevicePath,
    selectDevice,
    inputStates,
    lastEvent,
    connectionState,
  } = useInputDevice();

  const {
    templates,
    activeTemplate,
    loadTemplate,
    games,
    assignGameTemplate,
  } = useVDFTemplate();

  const handleLaunchStudio = () => {
    // Open full-screen Studio route
    Navigation.Navigate('/deckforge');
  };

  const handleInjectTemplate = async () => {
    if (!activeTemplate) return;
    setInjectStatus('Injecting...');

    try {
      // Assign to a known installed game when we have one, otherwise push the
      // active template straight into Steam's controller config dirs.
      const targetGame = games[0];
      if (targetGame) {
        const ok = await assignGameTemplate(targetGame.appId, activeTemplate.metadata.name);
        setInjectStatus(ok ? `Applied to ${targetGame.name}!` : 'Failed to apply.');
      } else {
        const res = await apiFetch(
          `/api/templates/${encodeURIComponent(activeTemplate.metadata.name)}/sync`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        );
        setInjectStatus(res.ok ? 'Synced to Steam' : 'Sync failed.');
      }
    } catch {
      setInjectStatus('Network error.');
    }

    setTimeout(() => {
      setInjectStatus(null);
    }, 2500);
  };

  // Convert templates for DropdownItem
  const templateOptions = templates.map((t) => ({
    label: t.metadata.title || t.metadata.name,
    data: t.metadata.name,
  }));

  const activeTemplateIndex = templates.findIndex(
    (t) => t.metadata.name === activeTemplate?.metadata.name
  );

  return (
    <PanelSection title="DeckForge Input Studio">
      {/* Device Status Header */}
      <PanelSectionRow>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
              {activeDevice ? activeDevice.name : 'No Controller'}
            </span>
            <span style={{ fontSize: '11px', color: '#888' }}>
              {activeDevicePath ? activeDevicePath : 'Scan to connect'}
            </span>
          </div>
          <div style={{
            fontSize: '10px',
            padding: '2px 8px',
            borderRadius: '10px',
            backgroundColor: connectionState === 'connected' ? '#166534' : '#991b1b',
            color: '#fff',
            fontWeight: 700,
            textTransform: 'uppercase'
          }}>
            {connectionState}
          </div>
        </div>
      </PanelSectionRow>

      {/* Profile Switcher */}
      {templateOptions.length > 0 && (
        <PanelSectionRow>
          <DropdownItem
            label="Active Profile"
            rgOptions={templateOptions}
            selectedOption={activeTemplateIndex >= 0 ? activeTemplateIndex : 0}
            onChange={(opt) => {
              if (opt && opt.data) {
                loadTemplate(opt.data as string);
              }
            }}
          />
        </PanelSectionRow>
      )}

      {/* Action Buttons: Inject & Full Studio */}
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleInjectTemplate}
          disabled={!activeTemplate}
        >
          {injectStatus || 'Inject Profile into Game'}
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleLaunchStudio}
        >
          Launch Full Studio
        </ButtonItem>
      </PanelSectionRow>

      {/* Live Monitor Toggle */}
      <PanelSectionRow>
        <ToggleField
          label="Live Input Monitor"
          description="View incoming button presses in real time"
          checked={showMonitor}
          onChange={(val) => setShowMonitor(val)}
        />
      </PanelSectionRow>

      {/* Mini Input Monitor Display */}
      {showMonitor && (
        <PanelSectionRow>
          <div style={{
            width: '100%',
            backgroundColor: '#121220',
            borderRadius: '6px',
            padding: '10px',
            border: '1px solid #2d2d44',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#a0a0b8' }}>
              <span>Last Event:</span>
              <span style={{ color: '#60a5fa', fontWeight: 600 }}>
                {lastEvent ? `${lastEvent.codeLabel || lastEvent.code} (${lastEvent.value})` : 'Idle'}
              </span>
            </div>

            {/* Active inputs badge list */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', minHeight: '28px' }}>
              {inputStates.size === 0 ? (
                <span style={{ fontSize: '11px', color: '#555', fontStyle: 'italic' }}>
                  No inputs currently pressed
                </span>
              ) : (
                Array.from(inputStates.entries()).map(([code, val]) => (
                  <span
                    key={code}
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#e94560',
                      color: '#fff',
                      fontWeight: 700
                    }}
                  >
                    {code}: {val}
                  </span>
                ))
              )}
            </div>
          </div>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
};

export default QAMPanel;
