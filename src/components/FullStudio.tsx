import React, { useState, useEffect } from 'react';
import {
  GuitarController,
  DrumKit,
  SteamDeckGamepad,
  Fightstick,
  KeyboardMacropad,
  BlankCanvas,
  CRKDGuitar,
  CRKDLesPaulPro,
  RiffstickGuitar,
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
import { useViewport, useIsTouch, TOUCH_TARGET } from '../hooks/useResponsive';
import { useVDFTemplate } from '../hooks/useVDFTemplate';
import { BindingConfig } from '../utils/mapping';
import { ActionSet, ActionSetLayer, VDFTemplate } from '../types';
import { apiBase, apiFetch } from '../api/client';

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

/** One classified device from the auto-profiler. */
interface AutoDetection {
  device_path: string;
  name: string;
  vendor_id: string;
  product_id: string;
  bus_type: string;
  kind: string;
  kind_confidence: number;
  kind_reason: string;
  sdl_type: string | null;
  steam_schema: string;
  reserved: boolean;
  fingerprint?: { buttons: string[]; axes: string[] } | null;
}

/** Result of POST /api/auto/profile. */
interface AutoResult {
  error?: string;
  detection?: AutoDetection;
  template_name?: string;
  template_title?: string;
  notes?: string[];
  saved?: {
    path: string;
    applied: string[];
    skipped: string[];
    steam?: { writable: boolean; template_dir: string };
  };
}

interface StudioTabDef {
  id: StudioTab;
  label: string;
  short: string;
  icon: string;
  /** Shown in the phone bottom bar. */
  primary: boolean;
}

const STUDIO_TABS: StudioTabDef[] = [
  { id: 'mappings', label: 'Mappings', short: 'Map', icon: '🎮', primary: true },
  { id: 'devices', label: 'Live Monitor', short: 'Live', icon: '📡', primary: true },
  { id: 'templates', label: 'Profiles', short: 'Profiles', icon: '📁', primary: true },
  { id: 'layers', label: 'Action Layers', short: 'Layers', icon: '📑', primary: false },
  { id: 'macros', label: 'Macros & Turbo', short: 'Macros', icon: '⚡', primary: false },
  { id: 'calibration', label: 'Calibration', short: 'Calibrate', icon: '🎯', primary: false },
  { id: 'latency', label: 'Latency Test', short: 'Latency', icon: '⏱', primary: false },
  { id: 'diagnostics', label: 'Hardware Diag', short: 'Diag', icon: '🔍', primary: false },
  { id: 'vdf', label: 'VDF Inspector', short: 'VDF', icon: '📄', primary: false },
];

export const FullStudio: React.FC = () => {
  const [activeTab, setActiveTab] = useState<StudioTab>('mappings');
  const { isCompact } = useViewport();
  const isTouch = useIsTouch();
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  // Auto-profiler: detection result and in-flight flag.
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoResult | null>(null);
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [selectedInputCode, setSelectedInputCode] = useState<string | null>(null);
  const [activeSetId, setActiveSetId] = useState<string>('default_set');
  const [activeLayerId, setActiveLayerId] = useState<string>('default_layer');

  // Toast Notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Remote QR Pairing Modal state
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  const [qrInfo, setQrInfo] = useState<{ remote_url: string; qr_svg: string; primary_ip: string } | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Steam installation summary shown in the header; silently absent if unknown.
  const [steamInfo, setSteamInfo] = useState<{
    steam_root: string;
    writable: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/steam/info');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.steam_root) return;
        const writable =
          data.writable ?? data.template_dir_writable ?? data.templateDirWritable;
        setSteamInfo({ steam_root: String(data.steam_root), writable: writable === true });
      } catch (err) {
        console.debug('Steam info unavailable:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const syncTemplate = async (name: string) => {
    try {
      const res = await apiFetch(`/api/templates/${encodeURIComponent(name)}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return res.ok;
    } catch (err) {
      console.warn('Failed to sync template to Steam:', err);
      return false;
    }
  };

  // Detect connected hardware and build + save a matching profile.
  const handleAutoProfile = async () => {
    setAutoBusy(true);
    setShowAutoModal(true);
    setAutoResult(null);
    try {
      const res = await apiFetch('/api/auto/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_game: 'clone_hero', save: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAutoResult({ error: data?.detail || `Auto-profile failed (${res.status})` });
        return;
      }
      setAutoResult(data);
      // Reflect the new profile in the studio immediately.
      await fetchTemplates();
      if (data?.template_name) await loadTemplate(data.template_name);
      const applied = data?.saved?.applied?.length ?? 0;
      const skipped = data?.saved?.skipped?.length ?? 0;
      triggerToast(
        skipped > 0
          ? `Auto-profiled ${data?.detection?.kind ?? 'device'}: ${applied} bound, ${skipped} unsupported`
          : `Auto-profiled ${data?.detection?.kind ?? 'device'}: ${applied} controls bound`,
      );
    } catch (err) {
      setAutoResult({ error: String(err) });
    } finally {
      setAutoBusy(false);
    }
  };

  const handleOpenQR = async () => {
    setShowQRModal(true);
    try {
      const res = await apiFetch('/api/system/network-info');
      if (res.ok) {
        const data = await res.json();
        setQrInfo(data);
      }
    } catch (err) {
      console.debug('Failed to fetch network info:', err);
    }
  };

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
    fetchTemplates,
  } = useVDFTemplate();

  // Pick blueprint by device or template type (with manual override support)
  const [blueprintOverride, setBlueprintOverride] = useState<string | null>(null);
  const blueprintType = blueprintOverride || activeTemplate?.metadata.deviceBlueprintId || 'steam_deck';

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
      case 'crkd_les_paul':
      case 'crkd_pro_les_paul':
      case 'les_paul':
        return <CRKDLesPaulPro {...commonProps} />;
      case 'guitar':
        return <GuitarController {...commonProps} />;
      case 'crkd_guitar':
        return <CRKDGuitar {...commonProps} />;
      case 'riffstick':
      case 'riffstick_guitar':
      case 'gp2040':
        return <RiffstickGuitar {...commonProps} />;
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
            capabilities={{
              // DeviceCapabilities reports raw evdev codes; the canvas labels
              // its generated cells with strings.
              buttons: (activeDevice?.capabilities.keys || []).map((code) => String(code)),
              axes: (activeDevice?.capabilities.axes || []).map((code) => String(code)),
            }}
          />
        );
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      // Fill the parent box rather than the viewport: the view switcher owns a
      // row above this component, so 100vh would overflow and push the status
      // bar off-screen.
      minHeight: 0,
      backgroundColor: '#161626',
      color: '#eee',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
      // Safe-area padding keeps the UI clear of notches, rounded corners and
      // the gesture bar on phones; it resolves to 0 on the Deck and desktop.
      paddingTop: 'env(safe-area-inset-top)',
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
      paddingBottom: 'env(safe-area-inset-bottom)'
    }} data-no-select>
      {/* Top Studio Bar */}
      <div style={{
        minHeight: isCompact ? `${TOUCH_TARGET + 8}px` : '48px',
        backgroundColor: '#1a1a2e',
        borderBottom: '1px solid #2d2d44',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isCompact ? '6px 10px' : '0 16px',
        gap: isCompact ? '6px' : '8px',
        flexShrink: 0,
        flexWrap: isCompact ? 'wrap' : 'nowrap',
        // Wide layout: never clip a control's label. If the bar cannot fit at
        // a narrow desktop width it scrolls horizontally instead of truncating.
        overflowX: isCompact ? 'hidden' : 'auto',
        overflowY: 'hidden'
      }}>
        {/* Brand & Active Device Selector */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isCompact ? '6px' : '16px',
          flexWrap: 'wrap',
          width: isCompact ? '100%' : undefined,
          flexShrink: 0,
        }}>
          {/* Brand: its own line on a phone so the pickers get full width. */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: isCompact ? '100%' : undefined,
          }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#e94560', letterSpacing: '-0.02em' }}>
              DECKFORGE
            </span>
            {!isCompact && (
              <span style={{ fontSize: '11px', color: '#888', fontWeight: 600, letterSpacing: '0.05em' }}>
                INPUT STUDIO
              </span>
            )}
          </div>

          {/* Device Selector */}
          <select
            value={activeDevicePath || ''}
            onChange={(e) => selectDevice(e.target.value)}
            style={{
              padding: isCompact ? '10px 10px' : '4px 10px',
              backgroundColor: '#121220',
              border: '1px solid #33334d',
              borderRadius: '4px',
              color: '#fff',
              fontSize: isCompact ? '13px' : '12px',
              maxWidth: isCompact ? 'none' : undefined,
              flex: isCompact ? '1 1 0' : undefined,
              minWidth: 0,
              // iOS zooms a focused control whose text is under 16px.
              ...(isTouch ? { fontSize: '16px' } : {})
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

          {/* Blueprint Chassis Selector */}
          <select
            value={blueprintType}
            onChange={(e) => setBlueprintOverride(e.target.value)}
            style={{
              padding: isCompact ? '10px 10px' : '4px 10px',
              backgroundColor: '#181928',
              border: '1px solid #d97706',
              borderRadius: '4px',
              color: '#f59e0b',
              fontSize: isCompact ? '13px' : '12px',
              fontWeight: 600,
              maxWidth: isCompact ? 'none' : undefined,
              flex: isCompact ? '1 1 0' : undefined,
              minWidth: 0,
              ...(isTouch ? { fontSize: '16px' } : {})
            }}
            title="Switch Active Hardware Blueprint"
          >
            <option value="steam_deck">🎮 Steam Deck (Neptune)</option>
            <option value="crkd_les_paul">🎸 CRKD Les Paul Pro Model</option>
            <option value="crkd_guitar">🎸 CRKD NEO S Pro Guitar</option>
            <option value="riffstick">🎸 GP2040-CE / RP2040 Riffstick</option>
            <option value="guitar">🎸 Standard Guitar Hero / RB</option>
            <option value="drum_kit">🥁 USB-MIDI Drum Kit</option>
            <option value="fightstick">🕹️ Arcade Fightstick</option>
            <option value="macropad">⌨️ Mechanical Macropad</option>
            <option value="blank">🎛️ Raw HID Canvas</option>
          </select>

          {/* Quick Bind Button */}
          <button
            onClick={isBinding ? stopBinding : startBinding}
            style={{
              padding: isCompact ? '10px 12px' : '4px 10px',
              minHeight: isCompact ? TOUCH_TARGET : undefined,
              flexShrink: 0,
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

          {/* One press: identify the connected hardware and build a profile. */}
          <button
            onClick={handleAutoProfile}
            disabled={autoBusy}
            title="Detect the connected controller and auto-map a profile"
            style={{
              padding: isCompact ? '10px 12px' : '4px 10px',
              minHeight: isCompact ? TOUCH_TARGET : undefined,
              flexShrink: 0,
              backgroundColor: autoBusy ? '#4c1d95' : '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: autoBusy ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {autoBusy ? 'Detecting…' : '⚡ Auto-Profile'}
          </button>
        </div>

        {/* Global Template & Save Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isCompact ? '8px' : '12px',
          flexWrap: isCompact ? 'wrap' : 'nowrap',
          width: isCompact ? '100%' : undefined,
          // The Steam path is long; on a phone it must be allowed to shrink
          // rather than push the Save button off-screen.
          minWidth: 0,
          flexShrink: 0,
        }}>
          <button
            onClick={handleOpenQR}
            style={{
              padding: '4px 10px',
              backgroundColor: '#1f1f33',
              color: '#00e5ff',
              border: '1px solid #33334d',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📱 Remote QR
          </button>

          <span style={{
            fontSize: '12px',
            color: '#a0a0b8',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            Profile: <strong style={{ color: '#fff' }}>{activeTemplate?.metadata.title || 'Default'}</strong>
          </span>

          {isDirty && (
            <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>
              ● Unsaved Changes
            </span>
          )}

          <button
            onClick={async () => {
              const name = activeTemplate?.metadata.name;
              const title = activeTemplate?.metadata.title || 'Custom';
              const saved = await saveTemplate();
              if (!saved) {
                triggerToast(`Failed to save VDF template "${title}".`);
                return;
              }
              if (!name) {
                triggerToast(`Saved "${title}" locally, but there is no active template to sync to Steam.`);
                return;
              }
              if (await syncTemplate(name)) {
                triggerToast(`VDF Template "${title}" synced to Steam Gaming Mode!`);
              } else {
                triggerToast(`Saved "${title}", but syncing to Steam failed.`);
              }
            }}
            disabled={!isDirty}
            style={{
              padding: isCompact ? '10px 16px' : '4px 14px',
              minHeight: isCompact ? TOUCH_TARGET : undefined,
              flexShrink: 0,
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
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: isCompact ? 'column' : 'row', overflow: 'hidden' }}>
        {/* Sidebar Navigation (wide layouts only; phones use the bottom bar) */}
        {!isCompact && (
        <div style={{
          width: '180px',
          backgroundColor: '#141422',
          borderRight: '1px solid #2d2d44',
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 0',
          flexShrink: 0
        }}>
          {STUDIO_TABS.map((item) => {
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
        )}

        {/* Center / Main Content View */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {activeTab === 'mappings' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
              {/* Left/Center Hardware Visualizer Canvas */}
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 0,
                minWidth: 0,
                padding: isCompact ? '4px' : '16px',
                backgroundColor: '#10101d',
                overflow: 'auto',
                // Let a finger pan the canvas but not zoom the page.
                touchAction: 'pan-x pan-y',
                WebkitOverflowScrolling: 'touch'
              }} data-no-select data-canvas>
                {renderHardwareCanvas()}
              </div>

              {/* Binding Editor: a docked flyout on wide screens, a bottom
                  sheet on phones so it never covers the thing being mapped. */}
              {selectedInputCode && (
                <div
                  style={
                    isCompact
                      ? {
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          top: '42%',
                          zIndex: 30,
                          backgroundColor: '#181829',
                          borderTop: '1px solid #33334d',
                          borderTopLeftRadius: '14px',
                          borderTopRightRadius: '14px',
                          boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
                          overflowY: 'auto',
                          WebkitOverflowScrolling: 'touch',
                          paddingBottom: 'env(safe-area-inset-bottom)',
                        }
                      : {
                          position: 'absolute',
                          right: '20px',
                          top: '20px',
                          zIndex: 20,
                        }
                  }
                >
                  {isCompact && (
                    <div
                      onClick={() => setSelectedInputCode(null)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        borderBottom: '1px solid #2d2d44',
                        position: 'sticky',
                        top: 0,
                        backgroundColor: '#181829',
                        zIndex: 1,
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                        Bind {selectedInputCode}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedInputCode(null);
                        }}
                        style={{
                          minWidth: TOUCH_TARGET,
                          minHeight: TOUCH_TARGET,
                          background: 'transparent',
                          border: 'none',
                          color: '#a0a0b8',
                          fontSize: '20px',
                          cursor: 'pointer',
                        }}
                        aria-label="Close binding editor"
                      >
                        ✕
                      </button>
                    </div>
                  )}
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

      {/* "More" sheet: the destinations that do not fit the bottom bar. */}
      {isCompact && showMoreTabs && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 40,
            display: 'flex',
            alignItems: 'flex-end',
          }}
          onClick={() => setShowMoreTabs(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              backgroundColor: '#181829',
              borderTopLeftRadius: '14px',
              borderTopRightRadius: '14px',
              borderTop: '1px solid #33334d',
              padding: '12px',
              paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
            }}
          >
            {STUDIO_TABS.map((tab) => {
              const isCurrent = activeTab === tab.id;
              return (
                <button
                  key={`more-${tab.id}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setShowMoreTabs(false);
                  }}
                  style={{
                    minHeight: TOUCH_TARGET + 16,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    backgroundColor: isCurrent ? '#1e1e34' : '#141422',
                    border: isCurrent ? '1px solid #e94560' : '1px solid #2d2d44',
                    borderRadius: '10px',
                    color: isCurrent ? '#e94560' : '#c8c8d8',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>{tab.icon}</span>
                  <span>{tab.short}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Phone bottom navigation. Nine destinations do not fit a bottom bar, so
          the four most-used are pinned and the rest live behind "More", which
          opens as a sheet rather than a cramped scroll row. */}
      {isCompact && (
        <nav
          style={{
            display: 'flex',
            alignItems: 'stretch',
            backgroundColor: '#141422',
            borderTop: '1px solid #2d2d44',
            flexShrink: 0,
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {STUDIO_TABS.filter((tab) => tab.primary || activeTab === tab.id).map((tab) => {
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={`bar-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  minHeight: TOUCH_TARGET + 8,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  background: 'transparent',
                  border: 'none',
                  borderTop: isCurrent ? '2px solid #e94560' : '2px solid transparent',
                  color: isCurrent ? '#e94560' : '#a0a0b8',
                  fontSize: '10px',
                  fontWeight: isCurrent ? 700 : 500,
                  cursor: 'pointer',
                  padding: '4px 2px',
                }}
                aria-current={isCurrent ? 'page' : undefined}
              >
                <span style={{ fontSize: '16px', lineHeight: 1 }}>{tab.icon}</span>
                <span>{tab.short}</span>
              </button>
            );
          })}
          <button
            onClick={() => setShowMoreTabs((v) => !v)}
            style={{
              flex: 1,
              minHeight: TOUCH_TARGET + 8,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              background: 'transparent',
              border: 'none',
              borderTop: showMoreTabs ? '2px solid #e94560' : '2px solid transparent',
              color: showMoreTabs ? '#e94560' : '#a0a0b8',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '4px 2px',
            }}
            aria-expanded={showMoreTabs}
            aria-label="More tools"
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>{showMoreTabs ? '✕' : '⋯'}</span>
            <span>More</span>
          </button>
        </nav>
      )}

      {/* Bottom Status Bar */}
      <div style={{
        height: isCompact ? '0px' : '28px',
        minHeight: isCompact ? '0px' : '28px',
        flexShrink: 0,
        overflow: 'hidden',
        backgroundColor: '#121220',
        borderTop: '1px solid #222235',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: '11px',
        color: '#71717a'
      }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span>Device: <strong style={{ color: '#ccc' }}>{activeDevice?.name || 'None'}</strong></span>
          <span>Status: <strong style={{ color: connectionState === 'connected' ? '#22c55e' : '#ef4444' }}>{connectionState}</strong></span>
          <span>Active Inputs: <strong style={{ color: '#ccc' }}>{inputStates.size}</strong></span>
        </div>

        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', minWidth: 0 }}>
          {steamInfo && (
            <span
              title={`${steamInfo.steam_root} — template dir ${steamInfo.writable ? 'writable' : 'read-only'}`}
              style={{ maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              Steam: <strong style={{ color: steamInfo.writable ? '#22c55e' : '#ef4444' }}>
                {steamInfo.writable ? 'writable' : 'read-only'}
              </strong>
            </span>
          )}
          <span>Resolution: 1280×800</span>
          <span>DeckForge v0.1.0</span>
        </div>
      </div>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div style={{
          position: 'absolute',
          bottom: isCompact ? 'calc(64px + env(safe-area-inset-bottom))' : '42px',
          left: isCompact ? '12px' : undefined,
          right: isCompact ? '12px' : '24px',
          backgroundColor: '#1e1e30',
          border: '1px solid #e94560',
          borderRadius: '6px',
          padding: '10px 18px',
          color: '#fff',
          fontSize: '13px',
          fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <span style={{ color: '#22c55e', fontSize: '16px' }}>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Auto-profiler result: what was found, what was bound, what was not. */}
      {showAutoModal && (
        <div
          onClick={() => setShowAutoModal(false)}
          style={{
            position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10002, padding: isCompact ? '12px' : 0,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: isCompact ? '100%' : '520px', maxWidth: '520px',
              maxHeight: isCompact ? '86vh' : '80vh', overflowY: 'auto',
              backgroundColor: '#181829', border: '1px solid #33334d',
              borderRadius: '12px', padding: isCompact ? '16px' : '22px',
              boxShadow: '0 12px 48px rgba(0,0,0,0.8)',
            }}
          >
            <h3 style={{ margin: '0 0 12px', color: '#fff', fontSize: '17px', fontWeight: 800 }}>
              ⚡ Auto-Profile
            </h3>

            {autoBusy && (
              <p style={{ color: '#a0a0b8', fontSize: '13px' }}>
                Identifying connected hardware…
              </p>
            )}

            {autoResult?.error && (
              <p style={{ color: '#ef4444', fontSize: '13px', lineHeight: 1.5 }}>
                {autoResult.error}
              </p>
            )}

            {autoResult?.detection && (
              <>
                <div style={{ marginBottom: '12px', fontSize: '13px', color: '#ddd' }}>
                  <div style={{ marginBottom: '4px' }}>
                    <strong style={{ color: '#fff' }}>{autoResult.detection.name || 'Unknown device'}</strong>
                    {' '}
                    <span style={{ color: '#8a8aa8', fontSize: '11px' }}>
                      {autoResult.detection.vendor_id}:{autoResult.detection.product_id}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#a0a0b8' }}>
                    Detected as{' '}
                    <strong style={{ color: '#22c55e' }}>{autoResult.detection.kind}</strong>
                    {' '}· {Math.round(autoResult.detection.kind_confidence * 100)}% confidence
                  </div>
                  <div style={{ fontSize: '11px', color: '#71717a', marginTop: '2px' }}>
                    {autoResult.detection.kind_reason}
                  </div>
                </div>

                {autoResult.saved && (
                  <div style={{ display: 'flex', gap: '16px', margin: '10px 0', fontSize: '12px' }}>
                    <span style={{ color: '#22c55e' }}>
                      ✓ {autoResult.saved.applied.length} bound
                    </span>
                    <span style={{ color: autoResult.saved.skipped.length ? '#f59e0b' : '#71717a' }}>
                      {autoResult.saved.skipped.length} unsupported
                    </span>
                    <span style={{ color: autoResult.saved.steam?.writable ? '#22c55e' : '#ef4444' }}>
                      Steam {autoResult.saved.steam?.writable ? 'writable' : 'read-only'}
                    </span>
                  </div>
                )}

                {autoResult.saved && autoResult.saved.skipped.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#f59e0b', marginBottom: '4px' }}>
                      Not expressible in Steam's schema:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px', color: '#8a8aa8', fontSize: '11px', lineHeight: 1.6 }}>
                      {autoResult.saved.skipped.map((s) => <li key={s}>{s}</li>)}
                    </ul>
                  </div>
                )}

                {autoResult.notes && autoResult.notes.length > 0 && (
                  <ul style={{ margin: '10px 0 0', paddingLeft: '16px', color: '#a0a0b8', fontSize: '11px', lineHeight: 1.6 }}>
                    {autoResult.notes.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                )}
              </>
            )}

            <button
              onClick={() => setShowAutoModal(false)}
              style={{
                marginTop: '16px', width: '100%',
                minHeight: isCompact ? TOUCH_TARGET : undefined,
                padding: '10px', backgroundColor: '#e94560', color: '#fff',
                border: 'none', borderRadius: '6px', fontSize: '13px',
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Remote QR Code Pairing Modal */}
      {showQRModal && (
        <div
          onClick={() => setShowQRModal(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: isCompact ? '12px' : 0,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
            width: isCompact ? '100%' : '440px',
            maxWidth: '440px',
            maxHeight: isCompact ? '86vh' : undefined,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            backgroundColor: '#181829',
            border: '1px solid #33334d',
            borderRadius: '12px',
            padding: isCompact ? '16px' : '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            boxShadow: '0 12px 48px rgba(0,0,0,0.8)'
          }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '18px', fontWeight: 800 }}>
              Remote Studio Pairing
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#aaa', fontSize: '12px', textAlign: 'center', lineHeight: 1.4 }}>
              Scan with your phone or tablet camera to open DeckForge Input Studio remotely over Tailscale or Local Wi-Fi.
            </p>

            {/* QR SVG display */}
            <div style={{
              width: '240px',
              height: '240px',
              backgroundColor: '#0e0e17',
              borderRadius: '8px',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #2d2d44'
            }}>
              {qrInfo?.qr_svg ? (
                <div dangerouslySetInnerHTML={{ __html: qrInfo.qr_svg }} />
              ) : (
                <span style={{ color: '#666', fontSize: '12px' }}>Loading QR Code…</span>
              )}
            </div>

            {/* Direct URL */}
            <div style={{
              marginTop: '16px',
              padding: '8px 14px',
              backgroundColor: '#121220',
              borderRadius: '6px',
              border: '1px solid #2d2d44',
              color: '#00e5ff',
              fontFamily: 'monospace',
              fontSize: '13px',
              userSelect: 'text'
            }}>
              {qrInfo?.remote_url || `${apiBase()}/`}
            </div>

            <button
              onClick={() => setShowQRModal(false)}
              style={{
                marginTop: '20px',
                padding: '8px 24px',
                backgroundColor: '#e94560',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FullStudio;
