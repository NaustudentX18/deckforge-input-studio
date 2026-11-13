import React, { useState, useEffect } from 'react';
import {
  GuitarController,
  DrumKit,
  SteamDeckGamepad,
  Fightstick,
  KeyboardMacropad,
  BlankCanvas,
  CRKDGuitar,
} from './hardware';
import { MappingEditor } from './MappingEditor';
import { InputMonitor } from './InputMonitor';
import { TemplateManager } from './TemplateManager';
import { ActionLayerEditor } from './ActionLayerEditor';
import { MacroSequencer } from './MacroSequencer';
import { VDFInspector } from './VDFInspector';
import { CalibrationPanel } from './CalibrationPanel';
import { LatencyTester } from './LatencyTester';
import { DiagnosticVisualizer } from './DiagnosticVisualizer';
import { useInputDevice } from '../hooks/useInputDevice';
import { useVDFTemplate } from '../hooks/useVDFTemplate';
import { BindingConfig } from '../utils/mapping';
import { ActionSet, ActionSetLayer, VDFTemplate } from '../types';

export type StudioTab =
  | 'mappings'
  | 'devices'
  | 'templates'
  | 'layers'
  | 'macros'
  | 'calibration'
  | 'latency'
  | 'diagnostics'
  | 'vdf';

export const FullStudio: React.FC = () => {
  const [activeTab, setActiveTab] = useState<StudioTab>('mappings');
  const [selectedInputCode, setSelectedInputCode] = useState<string | null>(null);
  const [activeSetId, setActiveSetId] = useState<string>('default_set');
  const [activeLayerId, setActiveLayerId] = useState<string>('default_layer');

  // Input Device Hook
  const {
    devices,
    activeDevice,
    activeDevicePath,
    selectDevice,
    inputStates,
    lastEvent,
    connectionState,
    isBinding,
    startBinding,
    stopBinding,
    boundInput,
  } = useInputDevice();

  // Template Hook
  const {
    templates,
    categorized,
    activeTemplate,
    originalTemplate,
    setActiveTemplate,
    updateActiveTemplate,
    games,
    loadTemplate,
    saveTemplate,
    cloneTemplate,
    deleteTemplate,
    exportTemplate,
    importTemplate,
    assignGameTemplate,
    isDirty,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useVDFTemplate();

  // Pick blueprint by device or template type
  const blueprintType = activeTemplate?.metadata.deviceBlueprintId || 'steam_deck';

  // Apply binding from MappingEditor
  const handleApplyBinding = (binding: BindingConfig) => {
    if (!selectedInputCode) return;

    updateActiveTemplate((prev: VDFTemplate) => {
      const sets = [...prev.actionSets];
      let setIdx = sets.findIndex((s) => s.id === activeSetId);
      if (setIdx === -1) setIdx = 0;

      const set = { ...sets[setIdx] };
      const currentLayer = set.layers.find((l) => l.id === activeLayerId) || set.layers[0];

      // Convert binding to MappingBinding
      const newBindingObj = {
        id: `bind_${Date.now()}`,
        label: `${selectedInputCode} -> ${binding.output.displayName}`,
        sourceCode: selectedInputCode,
        output: binding.output,
        activator: {
          type: binding.activator,
          holdDurationMs: binding.longPressThresholdMs || 300,
          doublePressWindowMs: 300,
          chordSourceCode: binding.chordedButton || '',
          fireIntervalMs: binding.turboRateHz ? Math.round(1000 / binding.turboRateHz) : 0,
          hapticFeedback: false,
        },
        icon: '',
        enabled: true,
      };

      if (currentLayer) {
        const nextLayers = set.layers.map((l) => {
          if (l.id === currentLayer.id) {
            const nextBindings = l.bindings.filter((b) => b.sourceCode !== selectedInputCode);
            nextBindings.push(newBindingObj as any);
            return { ...l, bindings: nextBindings };
          }
          return l;
        });
        set.layers = nextLayers;
      } else {
        const nextBindings = set.bindings.filter((b) => b.sourceCode !== selectedInputCode);
        nextBindings.push(newBindingObj as any);
        set.bindings = nextBindings;
      }

      sets[setIdx] = set;
      return { ...prev, actionSets: sets };
    });

    setSelectedInputCode(null);
  };

  // Render Hardware Blueprint
  const renderHardwareCanvas = () => {
    const commonProps = {
      activeInputs: inputStates,
      selectedInput: selectedInputCode,
      onSelectInput: (code: string) => setSelectedInputCode(code),
      scale: 0.85,
    };

    switch (blueprintType) {
      case 'guitar':
        return <GuitarController {...commonProps} />;
      case 'crkd_guitar':
        return <CRKDGuitar {...commonProps} />;
      case 'drum_kit':
        return <DrumKit {...commonProps} />;
      case 'fightstick':
        return <Fightstick {...commonProps} />;
      case 'macropad':
        return <KeyboardMacropad {...commonProps} />;
      case 'steam_deck':
        return <SteamDeckGamepad {...commonProps} />;
      default:
        return (
          <BlankCanvas
            {...commonProps}
            deviceCapabilities={{
              keys: activeDevice?.capabilities.keys || [],
              axes: activeDevice?.capabilities.axes || [],
            }}
          />
        );
    }
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      maxWidth: '1280px',
      maxHeight: '800px',
      backgroundColor: '#161626',
      color: '#eee',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
      userSelect: 'none'
    }}>
      {/* Top Studio Bar */}
      <div style={{
        height: '48px',
        backgroundColor: '#1a1a2e',
        borderBottom: '1px solid #2d2d44',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0
      }}>
        {/* Brand & Active Device Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#e94560', letterSpacing: '-0.02em' }}>
              DECKFORGE
            </span>
            <span style={{ fontSize: '11px', color: '#888', fontWeight: 600, letterSpacing: '0.05em' }}>
              INPUT STUDIO
            </span>
          </div>

          {/* Device Selector */}
          <select
            value={activeDevicePath || ''}
            onChange={(e) => selectDevice(e.target.value)}
            style={{
              padding: '4px 10px',
              backgroundColor: '#121220',
              border: '1px solid #33334d',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '12px'
            }}
          >
            {devices.length === 0 ? (
              <option value="">No Controller Connected</option>
            ) : (
              devices.map((d) => (
                <option key={d.path} value={d.path}>
                  {d.name} ({d.path})
                </option>
              ))
            )}
          </select>

          {/* Quick Bind Button */}
          <button
            onClick={isBinding ? stopBinding : startBinding}
            style={{
              padding: '4px 10px',
              backgroundColor: isBinding ? '#e94560' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {isBinding ? 'Listening... (Press Any Key)' : 'Press Any to Bind'}
          </button>
        </div>

        {/* Global Template & Save Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: '#a0a0b8' }}>
            Profile: <strong style={{ color: '#fff' }}>{activeTemplate?.metadata.title || 'Default'}</strong>
          </span>

          {isDirty && (
            <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>
              ● Unsaved Changes
            </span>
          )}

          <button
            onClick={() => saveTemplate()}
            disabled={!isDirty}
            style={{
              padding: '4px 14px',
              backgroundColor: isDirty ? '#e94560' : '#27273a',
              color: isDirty ? '#fff' : '#666',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isDirty ? 'pointer' : 'default'
            }}
          >
            Save VDF
          </button>
        </div>
      </div>

      {/* Main Layout Area: Sidebar Tabs + Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar Navigation */}
        <div style={{
          width: '180px',
          backgroundColor: '#141422',
          borderRight: '1px solid #2d2d44',
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 0',
          flexShrink: 0
        }}>
          {[
            { id: 'mappings', label: 'Mappings', icon: '🎮' },
            { id: 'devices', label: 'Live Monitor', icon: '📡' },
            { id: 'templates', label: 'Profiles', icon: '📁' },
            { id: 'layers', label: 'Action Layers', icon: '📑' },
            { id: 'macros', label: 'Macros & Turbo', icon: '⚡' },
            { id: 'calibration', label: 'Calibration', icon: '🎯' },
            { id: 'latency', label: 'Latency Test', icon: '⏱' },
            { id: 'diagnostics', label: 'Hardware Diag', icon: '🔍' },
            { id: 'vdf', label: 'VDF Inspector', icon: '📄' },
          ].map((item) => {
            const isCurrent = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as StudioTab)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 16px',
                  backgroundColor: isCurrent ? '#1e1e34' : 'transparent',
                  color: isCurrent ? '#e94560' : '#a0a0b8',
                  border: 'none',
                  borderLeft: isCurrent ? '3px solid #e94560' : '3px solid transparent',
                  fontSize: '13px',
                  fontWeight: isCurrent ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.1s'
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Center / Main Content View */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {activeTab === 'mappings' && (
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Left/Center Hardware Visualizer Canvas */}
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                backgroundColor: '#10101d',
                overflow: 'auto'
              }}>
                {renderHardwareCanvas()}
              </div>

              {/* Binding Editor Modal/Flyout */}
              {selectedInputCode && (
                <div style={{
                  position: 'absolute',
                  right: '20px',
                  top: '20px',
                  zIndex: 20
                }}>
                  <MappingEditor
                    inputCode={selectedInputCode}
                    onApply={handleApplyBinding}
                    onCancel={() => setSelectedInputCode(null)}
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'devices' && (
            <InputMonitor
              lastEvent={lastEvent}
              activeDeviceName={activeDevice?.name}
              connectionState={connectionState}
            />
          )}

          {activeTab === 'templates' && (
            <TemplateManager
              templates={templates}
              categorized={categorized}
              activeTemplate={activeTemplate}
              games={games}
              onSelectTemplate={(name) => loadTemplate(name)}
              onSaveTemplate={(tmpl) => saveTemplate(tmpl)}
              onCloneTemplate={(tmpl, newName) => cloneTemplate(tmpl, newName)}
              onDeleteTemplate={(name) => deleteTemplate(name)}
              onExportTemplate={(tmpl) => exportTemplate(tmpl)}
              onImportTemplate={(file) => importTemplate(file)}
              onAssignGame={(appId, name) => assignGameTemplate(appId, name)}
            />
          )}

          {activeTab === 'layers' && (
            <ActionLayerEditor
              actionSets={activeTemplate?.actionSets || []}
              activeSetId={activeSetId}
              activeLayerId={activeLayerId}
              onSelectSet={(id) => setActiveSetId(id)}
              onSelectLayer={(id) => setActiveLayerId(id)}
              onAddSet={(name) => {
                const newSet: ActionSet = {
                  id: `set_${Date.now()}`,
                  name,
                  bindings: [],
                  layers: [{ id: `layer_${Date.now()}`, name: 'Default', bindings: [], active: true }],
                };
                updateActiveTemplate((prev) => ({
                  ...prev,
                  actionSets: [...prev.actionSets, newSet],
                }));
              }}
              onRenameSet={(setId, newName) => {
                updateActiveTemplate((prev) => ({
                  ...prev,
                  actionSets: prev.actionSets.map((s) => (s.id === setId ? { ...s, name: newName } : s)),
                }));
              }}
              onDeleteSet={(setId) => {
                updateActiveTemplate((prev) => ({
                  ...prev,
                  actionSets: prev.actionSets.filter((s) => s.id !== setId),
                }));
              }}
              onAddLayer={(setId, layerName) => {
                const newLayer: ActionSetLayer = {
                  id: `layer_${Date.now()}`,
                  name: layerName,
                  bindings: [],
                  active: true,
                };
                updateActiveTemplate((prev) => ({
                  ...prev,
                  actionSets: prev.actionSets.map((s) =>
                    s.id === setId ? { ...s, layers: [...s.layers, newLayer] } : s
                  ),
                }));
              }}
              onRenameLayer={(setId, layerId, newName) => {
                updateActiveTemplate((prev) => ({
                  ...prev,
                  actionSets: prev.actionSets.map((s) =>
                    s.id === setId
                      ? {
                          ...s,
                          layers: s.layers.map((l) => (l.id === layerId ? { ...l, name: newName } : l)),
                        }
                      : s
                  ),
                }));
              }}
              onDeleteLayer={(setId, layerId) => {
                updateActiveTemplate((prev) => ({
                  ...prev,
                  actionSets: prev.actionSets.map((s) =>
                    s.id === setId
                      ? { ...s, layers: s.layers.filter((l) => l.id !== layerId) }
                      : s
                  ),
                }));
              }}
              onCopyLayerBindings={(setId, srcId, dstId) => {
                updateActiveTemplate((prev) => ({
                  ...prev,
                  actionSets: prev.actionSets.map((s) => {
                    if (s.id !== setId) return s;
                    const src = s.layers.find((l) => l.id === srcId);
                    if (!src) return s;
                    return {
                      ...s,
                      layers: s.layers.map((l) => (l.id === dstId ? { ...l, bindings: [...src.bindings] } : l)),
                    };
                  }),
                }));
              }}
            />
          )}

          {activeTab === 'macros' && (
            <MacroSequencer
              macros={activeTemplate?.macros || []}
              onSaveMacro={(macro) => {
                updateActiveTemplate((prev) => {
                  const filtered = prev.macros.filter((m) => m.id !== macro.id);
                  return { ...prev, macros: [...filtered, macro] };
                });
              }}
              onDeleteMacro={(macroId) => {
                updateActiveTemplate((prev) => ({
                  ...prev,
                  macros: prev.macros.filter((m) => m.id !== macroId),
                }));
              }}
            />
          )}

          {activeTab === 'calibration' && (
            <CalibrationPanel
              devicePath={activeDevicePath || undefined}
              liveAxisValues={inputStates}
              onSaveCalibration={(axis, config) => {
                updateActiveTemplate((prev) => {
                  const filtered = prev.axisCalibrations.filter((c) => c.axis !== axis);
                  return { ...prev, axisCalibrations: [...filtered, config] };
                });
              }}
            />
          )}

          {activeTab === 'latency' && (
            <LatencyTester
              lastEvent={lastEvent}
              devicePath={activeDevicePath || undefined}
            />
          )}

          {activeTab === 'diagnostics' && (
            <DiagnosticVisualizer
              activeInputs={inputStates}
              onResetCenter={() => {}}
            />
          )}

          {activeTab === 'vdf' && (
            <VDFInspector
              currentVdfText={activeTemplate ? JSON.stringify(activeTemplate, null, 2) : ''}
              savedVdfText={originalTemplate ? JSON.stringify(originalTemplate, null, 2) : ''}
              onChangeVdfText={(newText) => {
                try {
                  const parsed = JSON.parse(newText);
                  setActiveTemplate(parsed);
                } catch {}
              }}
            />
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div style={{
        height: '28px',
        backgroundColor: '#121220',
        borderTop: '1px solid #222235',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: '11px',
        color: '#71717a',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span>Device: <strong style={{ color: '#ccc' }}>{activeDevice?.name || 'None'}</strong></span>
          <span>Status: <strong style={{ color: connectionState === 'connected' ? '#22c55e' : '#ef4444' }}>{connectionState}</strong></span>
          <span>Active Inputs: <strong style={{ color: '#ccc' }}>{inputStates.size}</strong></span>
        </div>

        <div style={{ display: 'flex', gap: '14px' }}>
          <span>Resolution: 1280×800</span>
          <span>DeckForge v0.1.0</span>
        </div>
      </div>
    </div>
  );
};

export default FullStudio;
