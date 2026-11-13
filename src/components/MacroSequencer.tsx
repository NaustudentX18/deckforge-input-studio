import React, { useState } from 'react';
import { MacroSequence, MacroStep, OutputTargetType } from '../types';
import { GAMEPAD_BUTTONS, KEYBOARD_KEYS, MOUSE_BUTTONS } from '../utils/mapping';

interface MacroSequencerProps {
  macros: MacroSequence[];
  onSaveMacro: (macro: MacroSequence) => void;
  onDeleteMacro: (macroId: string) => void;
}

export const MacroSequencer: React.FC<MacroSequencerProps> = ({
  macros,
  onSaveMacro,
  onDeleteMacro,
}) => {
  const [selectedMacroId, setSelectedMacroId] = useState<string>(macros[0]?.id || 'new');
  const [macroName, setMacroName] = useState<string>(macros[0]?.name || 'New Macro');
  const [steps, setSteps] = useState<MacroStep[]>(macros[0]?.steps || []);
  const [loop, setLoop] = useState<boolean>(macros[0]?.loop || false);
  const [loopDelayMs, setLoopDelayMs] = useState<number>(macros[0]?.loopDelayMs || 100);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);

  // Load macro when selection changes
  const handleSelectMacro = (id: string) => {
    setSelectedMacroId(id);
    if (id === 'new') {
      setMacroName('New Macro');
      setSteps([]);
      setLoop(false);
      setLoopDelayMs(100);
    } else {
      const found = macros.find((m) => m.id === id);
      if (found) {
        setMacroName(found.name);
        setSteps(found.steps);
        setLoop(found.loop);
        setLoopDelayMs(found.loopDelayMs || 100);
      }
    }
  };

  const handleAddStep = (type: OutputTargetType, code: string, press: boolean, delayMs = 50) => {
    const newStep: MacroStep = {
      output: { type, code },
      press,
      delayMs,
    };
    setSteps([...steps, newStep]);
  };

  const handleAddDelay = (delayMs: number) => {
    const delayStep: MacroStep = {
      output: { type: OutputTargetType.System, code: 'DELAY' },
      press: false,
      delayMs,
    };
    setSteps([...steps, delayStep]);
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === steps.length - 1)) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const copy = [...steps];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    setSteps(copy);
  };

  const handleRemoveStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleStepDelayChange = (index: number, val: number) => {
    const copy = [...steps];
    copy[index] = { ...copy[index], delayMs: val };
    setSteps(copy);
  };

  const handlePlayPreview = () => {
    if (steps.length === 0 || isPlaying) return;
    setIsPlaying(true);
    let idx = 0;

    const playNext = () => {
      if (idx >= steps.length) {
        if (loop) {
          idx = 0;
          setTimeout(playNext, loopDelayMs);
        } else {
          setIsPlaying(false);
          setCurrentStepIndex(-1);
        }
        return;
      }

      setCurrentStepIndex(idx);
      const step = steps[idx];
      idx++;
      setTimeout(playNext, Math.max(30, step.delayMs));
    };

    playNext();
  };

  const handleSave = () => {
    const seq: MacroSequence = {
      id: selectedMacroId === 'new' ? `macro_${Date.now()}` : selectedMacroId,
      name: macroName,
      steps,
      loop,
      loopDelayMs,
    };
    onSaveMacro(seq);
    if (selectedMacroId === 'new') {
      setSelectedMacroId(seq.id);
    }
  };

  const getStepDisplayName = (step: MacroStep) => {
    if (step.output.code === 'DELAY') return `Delay ${step.delayMs}ms`;
    let label = step.output.code;
    if (step.output.type === OutputTargetType.Gamepad) label = GAMEPAD_BUTTONS[step.output.code] || label;
    if (step.output.type === OutputTargetType.Keyboard) label = KEYBOARD_KEYS[step.output.code] || label;
    if (step.output.type === OutputTargetType.Mouse) label = MOUSE_BUTTONS[step.output.code] || label;
    return `${label} (${step.press ? 'PRESS' : 'RELEASE'})`;
  };

  const totalDuration = steps.reduce((acc, s) => acc + s.delayMs, 0);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#161626',
      color: '#eee',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Top Header */}
      <div style={{
        padding: '16px',
        backgroundColor: '#1a1a2e',
        borderBottom: '1px solid #2d2d44',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        {/* Macro Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#a0a0b8', textTransform: 'uppercase' }}>
            Macro Sequence:
          </span>
          <select
            value={selectedMacroId}
            onChange={(e) => handleSelectMacro(e.target.value)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#121220',
              border: '1px solid #33334d',
              borderRadius: '6px',
              color: '#eee',
              fontSize: '13px',
              minWidth: '160px'
            }}
          >
            <option value="new">+ Create New Macro</option>
            {macros.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          <input
            type="text"
            value={macroName}
            onChange={(e) => setMacroName(e.target.value)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#121220',
              border: '1px solid #33334d',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600
            }}
          />
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handlePlayPreview}
            disabled={steps.length === 0}
            style={{
              padding: '6px 14px',
              backgroundColor: isPlaying ? '#16a34a' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: steps.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            {isPlaying ? '▶ Running...' : '▶ Play Preview'}
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '6px 16px',
              backgroundColor: '#e94560',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Save Macro
          </button>
          {selectedMacroId !== 'new' && (
            <button
              onClick={() => {
                if (window.confirm(`Delete macro "${macroName}"?`)) {
                  onDeleteMacro(selectedMacroId);
                  handleSelectMacro('new');
                }
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#381c24',
                color: '#ff6b81',
                border: '1px solid #552230',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Main Timeline & Step Builder Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Step Toolbox */}
        <div style={{
          width: '260px',
          backgroundColor: '#141422',
          borderRight: '1px solid #2d2d44',
          padding: '16px',
          overflowY: 'auto'
        }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '13px', color: '#a0a0b8', textTransform: 'uppercase' }}>
            Add Macro Steps
          </h4>

          {/* Quick Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={() => handleAddStep(OutputTargetType.Gamepad, 'BTN_A', true, 50)}
              style={{
                padding: '8px 12px',
                backgroundColor: '#1f1f33',
                color: '#fff',
                border: '1px solid #2d2d44',
                borderRadius: '4px',
                fontSize: '12px',
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              + Press Gamepad A
            </button>
            <button
              onClick={() => handleAddStep(OutputTargetType.Gamepad, 'BTN_A', false, 50)}
              style={{
                padding: '8px 12px',
                backgroundColor: '#1f1f33',
                color: '#aaa',
                border: '1px solid #2d2d44',
                borderRadius: '4px',
                fontSize: '12px',
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              + Release Gamepad A
            </button>
            <button
              onClick={() => handleAddStep(OutputTargetType.Keyboard, 'KEY_SPACE', true, 50)}
              style={{
                padding: '8px 12px',
                backgroundColor: '#1f1f33',
                color: '#fff',
                border: '1px solid #2d2d44',
                borderRadius: '4px',
                fontSize: '12px',
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              + Press Key Space
            </button>
            <button
              onClick={() => handleAddStep(OutputTargetType.Mouse, 'BTN_LEFT', true, 50)}
              style={{
                padding: '8px 12px',
                backgroundColor: '#1f1f33',
                color: '#fff',
                border: '1px solid #2d2d44',
                borderRadius: '4px',
                fontSize: '12px',
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              + Mouse Left Click
            </button>
            <button
              onClick={() => handleAddDelay(100)}
              style={{
                padding: '8px 12px',
                backgroundColor: '#1f1f33',
                color: '#fbbf24',
                border: '1px solid #2d2d44',
                borderRadius: '4px',
                fontSize: '12px',
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              + Add 100ms Delay
            </button>
          </div>

          {/* Loop & Timing Settings */}
          <div style={{
            backgroundColor: '#1a1a2e',
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid #29293e'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={loop}
                onChange={(e) => setLoop(e.target.checked)}
                style={{ accentColor: '#e94560' }}
              />
              Loop Continuously
            </label>

            {loop && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888' }}>
                  <span>Loop Delay</span>
                  <span>{loopDelayMs}ms</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={2000}
                  step={10}
                  value={loopDelayMs}
                  onChange={(e) => setLoopDelayMs(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#e94560', marginTop: '4px' }}
                />
              </div>
            )}

            <div style={{ marginTop: '12px', fontSize: '11px', color: '#777' }}>
              Total Sequence: {totalDuration}ms
            </div>
          </div>
        </div>

        {/* Right Timeline Canvas */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#fff' }}>
            Timeline Sequence ({steps.length} Steps)
          </h3>

          {steps.length === 0 ? (
            <div style={{
              padding: '60px',
              textAlign: 'center',
              backgroundColor: '#141422',
              borderRadius: '8px',
              border: '2px dashed #2d2d44',
              color: '#666'
            }}>
              No steps in this macro yet. Click buttons on the left to add inputs or delays!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {steps.map((step, idx) => {
                const isCurrent = currentStepIndex === idx;
                const isDelay = step.output.code === 'DELAY';

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: isCurrent ? '#3b1c24' : '#1a1a2e',
                      border: `1px solid ${isCurrent ? '#e94560' : '#2d2d44'}`,
                      borderRadius: '6px',
                      padding: '10px 16px',
                      boxShadow: isCurrent ? '0 0 10px rgba(233, 69, 96, 0.4)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#666', width: '24px' }}>
                        #{idx + 1}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: isDelay ? '#d97706' : step.press ? '#2563eb' : '#64748b',
                        color: '#fff',
                        fontWeight: 600,
                        textTransform: 'uppercase'
                      }}>
                        {step.output.type}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                        {getStepDisplayName(step)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: '#888' }}>Hold/Wait:</span>
                        <input
                          type="number"
                          value={step.delayMs}
                          onChange={(e) => handleStepDelayChange(idx, Number(e.target.value))}
                          style={{
                            width: '64px',
                            padding: '4px 6px',
                            backgroundColor: '#121220',
                            border: '1px solid #33334d',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '12px'
                          }}
                        />
                        <span style={{ fontSize: '11px', color: '#888' }}>ms</span>
                      </div>

                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => handleMoveStep(idx, 'up')}
                          disabled={idx === 0}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#222234',
                            color: idx === 0 ? '#444' : '#ccc',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: idx === 0 ? 'default' : 'pointer'
                          }}
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleMoveStep(idx, 'down')}
                          disabled={idx === steps.length - 1}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#222234',
                            color: idx === steps.length - 1 ? '#444' : '#ccc',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: idx === steps.length - 1 ? 'default' : 'pointer'
                          }}
                        >
                          ▼
                        </button>
                        <button
                          onClick={() => handleRemoveStep(idx)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#381c24',
                            color: '#ff6b81',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
