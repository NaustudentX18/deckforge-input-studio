import React, { useState, useEffect, useRef } from 'react';
import { GAMEPAD_BUTTONS } from '../utils/mapping';

interface DiagnosticVisualizerProps {
  activeInputs?: Map<string, number>;
  onResetCenter?: () => void;
}

export const DiagnosticVisualizer: React.FC<DiagnosticVisualizerProps> = ({
  activeInputs = new Map(),
  onResetCenter,
}) => {
  // Stick circularity history points
  const [stickPoints, setStickPoints] = useState<[number, number][]>([]);

  // Read current axes
  const rawX = activeInputs.get('ABS_X') ?? 0;
  const rawY = activeInputs.get('ABS_Y') ?? 0;
  const normX = rawX > 255 || rawX < -255 ? rawX / 32767 : rawX / 128;
  const normY = rawY > 255 || rawY < -255 ? rawY / 32767 : rawY / 128;

  // Triggers (0.0 .. 1.0)
  const l2Raw = activeInputs.get('ABS_Z') ?? activeInputs.get('BTN_TL2') ?? 0;
  const r2Raw = activeInputs.get('ABS_RZ') ?? activeInputs.get('BTN_TR2') ?? 0;
  const l2Val = l2Raw > 1 ? Math.min(1, l2Raw / 255) : l2Raw;
  const r2Val = r2Raw > 1 ? Math.min(1, r2Raw / 255) : r2Raw;

  // Gyro (pitch, roll, yaw)
  const pitch = (activeInputs.get('ABS_MISC') ?? 0) / 100;
  const yaw = (activeInputs.get('ABS_MISC_1') ?? 0) / 100;
  const roll = (activeInputs.get('ABS_MISC_2') ?? 0) / 100;

  // D-pad
  const dpadUp = !!activeInputs.get('BTN_DPAD_UP') || (activeInputs.get('ABS_HAT0Y') ?? 0) < 0;
  const dpadDown = !!activeInputs.get('BTN_DPAD_DOWN') || (activeInputs.get('ABS_HAT0Y') ?? 0) > 0;
  const dpadLeft = !!activeInputs.get('BTN_DPAD_LEFT') || (activeInputs.get('ABS_HAT0X') ?? 0) < 0;
  const dpadRight = !!activeInputs.get('BTN_DPAD_RIGHT') || (activeInputs.get('ABS_HAT0X') ?? 0) > 0;

  // Record circularity scatter points
  useEffect(() => {
    if (Math.abs(normX) > 0.1 || Math.abs(normY) > 0.1) {
      setStickPoints((prev) => [...prev.slice(-300), [normX, normY]]);
    }
  }, [normX, normY]);

  // Compute circularity error percentage
  const circularityError = React.useMemo(() => {
    if (stickPoints.length < 20) return 0;
    // Calculate deviation from radius 1.0 for perimeter points
    const outerPoints = stickPoints.filter(([x, y]) => Math.sqrt(x * x + y * y) > 0.7);
    if (outerPoints.length === 0) return 0;
    const diffSum = outerPoints.reduce((acc, [x, y]) => {
      const r = Math.sqrt(x * x + y * y);
      return acc + Math.abs(r - 1.0);
    }, 0);
    return Math.min(30, (diffSum / outerPoints.length) * 100);
  }, [stickPoints]);

  const clearCircularity = () => {
    setStickPoints([]);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#161626',
      color: '#eee',
      fontFamily: 'Inter, system-ui, sans-serif',
      overflowY: 'auto'
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>Diagnostic Hardware Visualizer</span>
          <span style={{ fontSize: '12px', color: '#888' }}>
            Live sensor testing & circularity
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={clearCircularity}
            style={{
              padding: '6px 12px',
              backgroundColor: '#27273a',
              color: '#eee',
              border: '1px solid #3f3f58',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Clear Scatter
          </button>
          {onResetCenter && (
            <button
              onClick={onResetCenter}
              style={{
                padding: '6px 14px',
                backgroundColor: '#e94560',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Recenter Gyro / Axes
            </button>
          )}
        </div>
      </div>

      {/* Visualizer Grid */}
      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* 1. Stick Circularity Test */}
        <div style={{
          backgroundColor: '#1a1a2e',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #2d2d44',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Left Stick Circularity</span>
            <span style={{ fontSize: '12px', color: circularityError < 10 ? '#34d399' : '#f87171' }}>
              Error: {circularityError.toFixed(1)}%
            </span>
          </div>

          <svg viewBox="0 0 200 200" style={{ width: '100%', maxWidth: '240px', height: '240px' }}>
            {/* Background & crosshairs */}
            <rect x="0" y="0" width="200" height="200" fill="#10101d" rx="6" />
            <line x1="100" y1="10" x2="100" y2="190" stroke="#252538" strokeWidth="1" />
            <line x1="10" y1="100" x2="190" y2="100" stroke="#252538" strokeWidth="1" />

            {/* Ideal Circle (r=75px) */}
            <circle cx="100" cy="100" r="75" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 4" />

            {/* Scatter History */}
            {stickPoints.map(([x, y], i) => (
              <circle
                key={i}
                cx={100 + x * 75}
                cy={100 + y * 75}
                r="1.5"
                fill="#e94560"
                opacity="0.6"
              />
            ))}

            {/* Current Position Dot */}
            <circle
              cx={100 + normX * 75}
              cy={100 + normY * 75}
              r="6"
              fill="#22c55e"
              stroke="#fff"
              strokeWidth="2"
            />
          </svg>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
            X: {normX.toFixed(2)} | Y: {normY.toFixed(2)}
          </div>
        </div>

        {/* 2. Analog Triggers Travel */}
        <div style={{
          backgroundColor: '#1a1a2e',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #2d2d44',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>
            Trigger Linear Travel (L2 / R2)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', flex: 1, alignItems: 'center' }}>
            {/* L2 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#60a5fa' }}>L2 Trigger</span>
              <div style={{
                width: '32px',
                height: '160px',
                backgroundColor: '#10101d',
                borderRadius: '6px',
                overflow: 'hidden',
                position: 'relative',
                border: '1px solid #27273a'
              }}>
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: `${l2Val * 100}%`,
                  backgroundColor: '#3b82f6',
                  transition: 'height 0.05s ease'
                }} />
              </div>
              <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{Math.round(l2Val * 100)}%</span>
            </div>

            {/* R2 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#60a5fa' }}>R2 Trigger</span>
              <div style={{
                width: '32px',
                height: '160px',
                backgroundColor: '#10101d',
                borderRadius: '6px',
                overflow: 'hidden',
                position: 'relative',
                border: '1px solid #27273a'
              }}>
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: `${r2Val * 100}%`,
                  backgroundColor: '#e94560',
                  transition: 'height 0.05s ease'
                }} />
              </div>
              <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{Math.round(r2Val * 100)}%</span>
            </div>
          </div>
        </div>

        {/* 3. 3D Gyroscope Wireframe */}
        <div style={{
          backgroundColor: '#1a1a2e',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #2d2d44',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ width: '100%', fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '16px' }}>
            Gyro Orientation (3D IMU)
          </div>

          <div style={{
            perspective: '500px',
            width: '140px',
            height: '140px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '20px 0'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              border: '2px solid #e94560',
              backgroundColor: 'rgba(233, 69, 96, 0.15)',
              transform: `rotateX(${pitch}deg) rotateY(${yaw}deg) rotateZ(${roll}deg)`,
              transformStyle: 'preserve-3d',
              transition: 'transform 0.05s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700
            }}>
              IMU
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#888', display: 'flex', gap: '12px' }}>
            <span>P: {pitch.toFixed(1)}°</span>
            <span>Y: {yaw.toFixed(1)}°</span>
            <span>R: {roll.toFixed(1)}°</span>
          </div>
        </div>

        {/* 4. D-Pad Directional Matrix */}
        <div style={{
          backgroundColor: '#1a1a2e',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #2d2d44',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ width: '100%', fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '16px' }}>
            D-Pad Cross Matrix
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 40px)',
            gridTemplateRows: 'repeat(3, 40px)',
            gap: '4px',
            margin: '16px 0'
          }}>
            <div />
            <div style={{
              backgroundColor: dpadUp ? '#e94560' : '#222238',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700
            }}>↑</div>
            <div />

            <div style={{
              backgroundColor: dpadLeft ? '#e94560' : '#222238',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700
            }}>←</div>
            <div style={{ backgroundColor: '#161628', borderRadius: '4px' }} />
            <div style={{
              backgroundColor: dpadRight ? '#e94560' : '#222238',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700
            }}>→</div>

            <div />
            <div style={{
              backgroundColor: dpadDown ? '#e94560' : '#222238',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700
            }}>↓</div>
            <div />
          </div>
        </div>
      </div>

      {/* Button State Lights */}
      <div style={{
        padding: '16px 20px',
        backgroundColor: '#141424',
        borderTop: '1px solid #2d2d44'
      }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#a0a0b8', marginBottom: '10px' }}>
          Physical Button State Lights
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {Object.entries(GAMEPAD_BUTTONS).map(([code, name]) => {
            const isPressed = !!activeInputs.get(code);
            return (
              <div
                key={code}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: isPressed ? '#e94560' : '#1f1f33',
                  border: `1px solid ${isPressed ? '#ff6b81' : '#2c2c40'}`,
                  color: isPressed ? '#fff' : '#888',
                  fontSize: '11px',
                  fontWeight: isPressed ? 700 : 400,
                  transition: 'background-color 0.05s'
                }}
              >
                {name}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
