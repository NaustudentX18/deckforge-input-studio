import React, { useState, useEffect } from 'react';
import {
  OutputTargetType,
  ActivatorType,
  GAMEPAD_BUTTONS,
  KEYBOARD_KEYS,
  MOUSE_BUTTONS,
  SYSTEM_ACTIONS,
  BindingConfig,
  buildBindingString,
} from '../utils/mapping';

interface MappingEditorProps {
  inputCode: string;
  initialBinding?: BindingConfig;
  onApply: (binding: BindingConfig) => void;
  onCancel: () => void;
}

export const MappingEditor: React.FC<MappingEditorProps> = ({
  inputCode,
  initialBinding,
  onApply,
  onCancel,
}) => {
  const [targetType, setTargetType] = useState<OutputTargetType>(initialBinding?.output.type || 'gamepad');
  const [selectedCode, setSelectedCode] = useState<string>(initialBinding?.output.code || 'BTN_A');
  const [activator, setActivator] = useState<ActivatorType>(initialBinding?.activator || 'RegularPress');
  const [longPressMs, setLongPressMs] = useState<number>(initialBinding?.longPressThresholdMs || 300);
  const [chordedButton, setChordedButton] = useState<string>(initialBinding?.chordedButton || 'BTN_SELECT');
  const [turboEnabled, setTurboEnabled] = useState<boolean>(initialBinding?.turboEnabled || false);
  const [turboRateHz, setTurboRateHz] = useState<number>(initialBinding?.turboRateHz || 10);
  const [keyboardSearch, setKeyboardSearch] = useState<string>('');
  const [isTesting, setIsTesting] = useState<boolean>(false);

  // Update selected code when changing tabs if current code isn't in new tab
  useEffect(() => {
    if (targetType === 'gamepad' && !GAMEPAD_BUTTONS[selectedCode]) {
      setSelectedCode('BTN_A');
    } else if (targetType === 'keyboard' && !KEYBOARD_KEYS[selectedCode]) {
      setSelectedCode('KEY_SPACE');
    } else if (targetType === 'mouse' && !MOUSE_BUTTONS[selectedCode]) {
      setSelectedCode('BTN_LEFT');
    } else if (targetType === 'system' && !SYSTEM_ACTIONS[selectedCode]) {
      setSelectedCode('SYS_SCREENSHOT');
    }
  }, [targetType]);

  const getCurrentDisplayName = (): string => {
    switch (targetType) {
      case 'gamepad': return GAMEPAD_BUTTONS[selectedCode] || selectedCode;
      case 'keyboard': return KEYBOARD_KEYS[selectedCode] || selectedCode;
      case 'mouse': return MOUSE_BUTTONS[selectedCode] || selectedCode;
      case 'system': return SYSTEM_ACTIONS[selectedCode] || selectedCode;
    }
  };

  const handleApply = () => {
    const config: BindingConfig = {
      output: {
        type: targetType,
        code: selectedCode,
        displayName: getCurrentDisplayName(),
      },
      activator,
      longPressThresholdMs: activator === 'LongPress' ? longPressMs : undefined,
      chordedButton: activator === 'ChordedPress' ? chordedButton : undefined,
      turboEnabled,
      turboRateHz: turboEnabled ? turboRateHz : undefined,
    };
    onApply(config);
  };

  const handleTest = () => {
    setIsTesting(true);
    setTimeout(() => setIsTesting(false), 800);
  };

  // Preview binding string
  const previewString = buildBindingString({
    output: { type: targetType, code: selectedCode, displayName: getCurrentDisplayName() },
    activator,
    longPressThresholdMs: activator === 'LongPress' ? longPressMs : undefined,
    chordedButton: activator === 'ChordedPress' ? chordedButton : undefined,
    turboEnabled,
    turboRateHz: turboEnabled ? turboRateHz : undefined,
  });

  return (
    <div style={{
      backgroundColor: '#1a1a2e',
      border: '1px solid #33334d',
      borderRadius: '8px',
      padding: '20px',
      color: '#eee',
      fontFamily: 'Inter, system-ui, sans-serif',
      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
      maxWidth: '680px',
      width: '100%'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #2d2d44',
        paddingBottom: '12px',
        marginBottom: '16px'
      }}>
        <div>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#e94560', fontWeight: 700, letterSpacing: '0.05em' }}>
            Binding Editor
          </span>
          <h3 style={{ margin: '2px 0 0', fontSize: '17px', color: '#fff' }}>
            Map Control: <span style={{ color: '#60a5fa' }}>{inputCode}</span>
          </h3>
        </div>
        <div style={{
          backgroundColor: '#121220',
          padding: '4px 10px',
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'JetBrains Mono, monospace',
          color: '#a0a0b8'
        }}>
          {previewString}
        </div>
      </div>

      {/* Target Type Selector Tabs */}
      <div style={{
        display: 'flex',
        backgroundColor: '#121220',
        borderRadius: '6px',
        padding: '3px',
        marginBottom: '16px',
        border: '1px solid #27273a'
      }}>
        {(['gamepad', 'keyboard', 'mouse', 'system'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setTargetType(tab)}
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: targetType === tab ? '#e94560' : 'transparent',
              color: targetType === tab ? '#fff' : '#a0a0b0',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{
        backgroundColor: '#141422',
        border: '1px solid #27273a',
        borderRadius: '6px',
        padding: '16px',
        minHeight: '160px',
        maxHeight: '220px',
        overflowY: 'auto',
        marginBottom: '16px'
      }}>
        {targetType === 'gamepad' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
            {Object.entries(GAMEPAD_BUTTONS).map(([code, name]) => (
              <button
                key={code}
                onClick={() => setSelectedCode(code)}
                style={{
                  padding: '8px 10px',
                  backgroundColor: selectedCode === code ? '#2563eb' : '#1f1f33',
                  color: '#fff',
                  border: `1px solid ${selectedCode === code ? '#3b82f6' : '#2d2d44'}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {targetType === 'keyboard' && (
          <div>
            <input
              type="text"
              placeholder="Search keys (e.g. Space, Shift, W)..."
              value={keyboardSearch}
              onChange={(e) => setKeyboardSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 12px',
                marginBottom: '10px',
                backgroundColor: '#1a1a2e',
                border: '1px solid #33334d',
                borderRadius: '4px',
                color: '#eee',
                fontSize: '12px'
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '6px' }}>
              {Object.entries(KEYBOARD_KEYS)
                .filter(([code, name]) =>
                  name.toLowerCase().includes(keyboardSearch.toLowerCase()) ||
                  code.toLowerCase().includes(keyboardSearch.toLowerCase())
                )
                .map(([code, name]) => (
                  <button
                    key={code}
                    onClick={() => setSelectedCode(code)}
                    style={{
                      padding: '6px 8px',
                      backgroundColor: selectedCode === code ? '#2563eb' : '#1f1f33',
                      color: '#fff',
                      border: `1px solid ${selectedCode === code ? '#3b82f6' : '#2d2d44'}`,
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    {name}
                  </button>
                ))}
            </div>
          </div>
        )}

        {targetType === 'mouse' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
            {Object.entries(MOUSE_BUTTONS).map(([code, name]) => (
              <button
                key={code}
                onClick={() => setSelectedCode(code)}
                style={{
                  padding: '8px 10px',
                  backgroundColor: selectedCode === code ? '#2563eb' : '#1f1f33',
                  color: '#fff',
                  border: `1px solid ${selectedCode === code ? '#3b82f6' : '#2d2d44'}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {targetType === 'system' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
            {Object.entries(SYSTEM_ACTIONS).map(([code, name]) => (
              <button
                key={code}
                onClick={() => setSelectedCode(code)}
                style={{
                  padding: '8px 10px',
                  backgroundColor: selectedCode === code ? '#2563eb' : '#1f1f33',
                  color: '#fff',
                  border: `1px solid ${selectedCode === code ? '#3b82f6' : '#2d2d44'}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Activator & Settings Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        {/* Activator Type */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#a0a0b8', marginBottom: '6px', fontWeight: 600 }}>
            Activator Type
          </label>
          <select
            value={activator}
            onChange={(e) => setActivator(e.target.value as ActivatorType)}
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#121220',
              border: '1px solid #33334d',
              borderRadius: '6px',
              color: '#eee',
              fontSize: '13px'
            }}
          >
            <option value="RegularPress">Regular Press</option>
            <option value="LongPress">Long Press (Hold)</option>
            <option value="DoublePress">Double Press</option>
            <option value="StartPress">Start Press (On Touch)</option>
            <option value="ReleasePress">Release Press (On Up)</option>
            <option value="ChordedPress">Chorded Press (Combo)</option>
          </select>

          {activator === 'LongPress' && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#a0a0b8' }}>
                <span>Hold Duration</span>
                <span>{longPressMs} ms</span>
              </div>
              <input
                type="range"
                min={150}
                max={1500}
                step={25}
                value={longPressMs}
                onChange={(e) => setLongPressMs(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#e94560', marginTop: '4px' }}
              />
            </div>
          )}

          {activator === 'ChordedPress' && (
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#a0a0b8', marginBottom: '4px' }}>
                Secondary (Chord) Button
              </label>
              <select
                value={chordedButton}
                onChange={(e) => setChordedButton(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  backgroundColor: '#121220',
                  border: '1px solid #33334d',
                  borderRadius: '4px',
                  color: '#eee',
                  fontSize: '12px'
                }}
              >
                {Object.entries(GAMEPAD_BUTTONS).map(([c, n]) => (
                  <option key={c} value={c}>{n}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Turbo Mode */}
        <div style={{
          backgroundColor: '#141422',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #27273a'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>Turbo (Rapid-Fire)</span>
            <input
              type="checkbox"
              checked={turboEnabled}
              onChange={(e) => setTurboEnabled(e.target.checked)}
              style={{ accentColor: '#e94560', width: '16px', height: '16px', cursor: 'pointer' }}
            />
          </div>

          {turboEnabled && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#a0a0b8' }}>
                <span>Repeat Rate</span>
                <span>{turboRateHz} Hz (fires/sec)</span>
              </div>
              <input
                type="range"
                min={2}
                max={30}
                step={1}
                value={turboRateHz}
                onChange={(e) => setTurboRateHz(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#e94560', marginTop: '4px' }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer Buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid #2d2d44',
        paddingTop: '16px'
      }}>
        <button
          onClick={handleTest}
          style={{
            padding: '8px 16px',
            backgroundColor: isTesting ? '#16a34a' : '#27273a',
            color: '#fff',
            border: '1px solid #3f3f5a',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          {isTesting ? '✓ Signal Sent!' : '⚡ Test Binding'}
        </button>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              backgroundColor: '#2d2d44',
              color: '#ccc',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            style={{
              padding: '8px 20px',
              backgroundColor: '#e94560',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Apply Binding
          </button>
        </div>
      </div>
    </div>
  );
};
