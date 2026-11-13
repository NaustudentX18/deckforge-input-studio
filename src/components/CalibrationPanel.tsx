import React, { useState, useEffect } from 'react';
import { AxisCalibration, ResponseCurveType } from '../types';

interface CalibrationPanelProps {
  devicePath?: string;
  availableAxes?: string[];
  liveAxisValues?: Map<string, number>;
  onSaveCalibration?: (axis: string, config: AxisCalibration) => void;
}

export const CalibrationPanel: React.FC<CalibrationPanelProps> = ({
  devicePath,
  availableAxes = ['ABS_X', 'ABS_Y', 'ABS_RX', 'ABS_RY', 'ABS_Z', 'ABS_RZ', 'ABS_WHAMMY', 'ABS_TILT'],
  liveAxisValues,
  onSaveCalibration,
}) => {
  const [selectedAxis, setSelectedAxis] = useState<string>(availableAxes[0] || 'ABS_X');

  // Calibration settings
  const [innerDeadzone, setInnerDeadzone] = useState<number>(0.08); // 8%
  const [outerDeadzone, setOuterDeadzone] = useState<number>(0.95); // 95%
  const [antiDeadzone, setAntiDeadzone] = useState<number>(0.0);
  const [curveType, setCurveType] = useState<ResponseCurveType>(ResponseCurveType.Linear);
  const [inverted, setInverted] = useState<boolean>(false);
  const [bezierP1, setBezierP1] = useState<[number, number]>([0.25, 0.1]);
  const [bezierP2, setBezierP2] = useState<[number, number]>([0.25, 1.0]);

  // Rhythm/Guitar specific settings
  const [debounceMs, setDebounceMs] = useState<number>(2);
  const [whammyNormalize, setWhammyNormalize] = useState<boolean>(true);
  const [tiltThreshold, setTiltThreshold] = useState<number>(0.6);

  // Auto-calibrate state
  const [isAutoCalibrating, setIsAutoCalibrating] = useState<boolean>(false);
  const [minObserved, setMinObserved] = useState<number>(0);
  const [maxObserved, setMaxObserved] = useState<number>(0);

  // Live value from prop map or 0
  const rawValue = liveAxisValues?.get(selectedAxis) || 0;

  // Track min/max during auto-calibrate
  useEffect(() => {
    if (isAutoCalibrating) {
      setMinObserved((prev) => Math.min(prev, rawValue));
      setMaxObserved((prev) => Math.max(prev, rawValue));
    }
  }, [rawValue, isAutoCalibrating]);

  // Compute calibrated value (normalized 0.0 .. 1.0)
  const computeCalibrated = (raw: number): number => {
    // Normalization assuming 16-bit signed (-32768 .. 32767) or 8-bit (0 .. 255)
    let norm = Math.abs(raw) > 255 ? Math.abs(raw) / 32767 : Math.abs(raw) / 255;
    norm = Math.min(1.0, Math.max(0.0, norm));

    // Invert
    if (inverted) norm = 1.0 - norm;

    // Deadzones
    if (norm < innerDeadzone) return 0.0;
    if (norm > outerDeadzone) return 1.0;

    // Rescale between inner and outer
    let rescaled = (norm - innerDeadzone) / (outerDeadzone - innerDeadzone);

    // Apply curve
    if (curveType === ResponseCurveType.Aggressive) {
      rescaled = Math.pow(rescaled, 0.6);
    } else if (curveType === ResponseCurveType.Relaxed) {
      rescaled = Math.pow(rescaled, 1.8);
    } else if (curveType === ResponseCurveType.CustomBezier) {
      // Approximate cubic bezier easing
      rescaled = Math.pow(rescaled, 2) * (3 - 2 * rescaled);
    }

    return Math.min(1.0, Math.max(0.0, rescaled + antiDeadzone));
  };

  const calibratedValue = computeCalibrated(rawValue);

  const handleStartAutoCalibrate = () => {
    setMinObserved(rawValue);
    setMaxObserved(rawValue);
    setIsAutoCalibrating(true);
  };

  const handleStopAutoCalibrate = () => {
    setIsAutoCalibrating(false);
  };

  const handleSave = () => {
    const config: AxisCalibration = {
      axis: selectedAxis,
      rawMin: minObserved,
      rawMax: maxObserved,
      rawCenter: 0,
      deadzone: {
        inner: innerDeadzone,
        outer: outerDeadzone,
        shape: 'circle',
      },
      responseCurve: {
        type: curveType,
        controlPoints: [bezierP1, bezierP2],
        exponent: curveType === ResponseCurveType.Aggressive ? 0.6 : curveType === ResponseCurveType.Relaxed ? 1.8 : 1.0,
      },
      inverted,
      antiDeadzone,
    };
    onSaveCalibration?.(selectedAxis, config);
  };

  // Generate SVG path for response curve visualization
  const generateCurveSvgPath = (): string => {
    const points: string[] = [];
    for (let x = 0; x <= 100; x += 5) {
      const normX = x / 100;
      let normY = normX;

      if (normX < innerDeadzone) normY = 0;
      else if (normX > outerDeadzone) normY = 1;
      else {
        let rescaled = (normX - innerDeadzone) / (outerDeadzone - innerDeadzone);
        if (curveType === ResponseCurveType.Aggressive) rescaled = Math.pow(rescaled, 0.6);
        else if (curveType === ResponseCurveType.Relaxed) rescaled = Math.pow(rescaled, 1.8);
        else if (curveType === ResponseCurveType.CustomBezier) rescaled = Math.pow(rescaled, 2) * (3 - 2 * rescaled);
        normY = rescaled;
      }

      const svgX = 20 + normX * 160;
      const svgY = 180 - normY * 160;
      points.push(`${x === 0 ? 'M' : 'L'} ${svgX} ${svgY}`);
    }
    return points.join(' ');
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
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>Axis & Sensor Calibration</span>
          <select
            value={selectedAxis}
            onChange={(e) => setSelectedAxis(e.target.value)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#121220',
              border: '1px solid #33334d',
              borderRadius: '6px',
              color: '#60a5fa',
              fontWeight: 600,
              fontSize: '13px'
            }}
          >
            {availableAxes.map((axis) => (
              <option key={axis} value={axis}>{axis}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={isAutoCalibrating ? handleStopAutoCalibrate : handleStartAutoCalibrate}
            style={{
              padding: '6px 14px',
              backgroundColor: isAutoCalibrating ? '#e94560' : '#27273a',
              color: '#fff',
              border: '1px solid #3f3f58',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {isAutoCalibrating ? '■ Stop Auto-Calibrate' : '⚡ Auto-Calibrate (Range)'}
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
            Save Calibration
          </button>
        </div>
      </div>

      {/* Main Grid Content */}
      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Left Column: Sliders & Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Live Monitor Bar */}
          <div style={{
            backgroundColor: '#1a1a2e',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #2d2d44'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span style={{ fontWeight: 600, color: '#fff' }}>Live Axis Input</span>
              <span style={{ fontFamily: 'monospace', color: '#a0a0b8' }}>
                Raw: {rawValue} | Calibrated: {(calibratedValue * 100).toFixed(1)}%
              </span>
            </div>

            {/* Visual Travel Bar */}
            <div style={{ height: '14px', backgroundColor: '#121220', borderRadius: '7px', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${calibratedValue * 100}%`,
                backgroundColor: '#3b82f6',
                transition: 'width 0.05s ease'
              }} />
              {/* Inner deadzone marker */}
              <div style={{
                position: 'absolute',
                left: `${innerDeadzone * 100}%`,
                top: 0,
                bottom: 0,
                width: '2px',
                backgroundColor: '#ef4444'
              }} />
              {/* Outer deadzone marker */}
              <div style={{
                position: 'absolute',
                left: `${outerDeadzone * 100}%`,
                top: 0,
                bottom: 0,
                width: '2px',
                backgroundColor: '#10b981'
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '4px' }}>
              <span>0% (Neutral)</span>
              <span style={{ color: '#ef4444' }}>Inner ({Math.round(innerDeadzone * 100)}%)</span>
              <span style={{ color: '#10b981' }}>Outer ({Math.round(outerDeadzone * 100)}%)</span>
              <span>100%</span>
            </div>
          </div>

          {/* Deadzones Sliders */}
          <div style={{
            backgroundColor: '#1a1a2e',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #2d2d44',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a0a0b8' }}>
                <span>Inner Deadzone (Eliminate Drift)</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{Math.round(innerDeadzone * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={innerDeadzone}
                onChange={(e) => setInnerDeadzone(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#e94560', marginTop: '6px' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a0a0b8' }}>
                <span>Outer Deadzone (Max Saturation)</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{Math.round(outerDeadzone * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.0}
                step={0.01}
                value={outerDeadzone}
                onChange={(e) => setOuterDeadzone(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#e94560', marginTop: '6px' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a0a0b8' }}>
                <span>Anti-Deadzone (Game Offset Compensation)</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{Math.round(antiDeadzone * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={antiDeadzone}
                onChange={(e) => setAntiDeadzone(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#e94560', marginTop: '6px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
              <span style={{ fontSize: '13px', color: '#fff' }}>Invert Axis</span>
              <input
                type="checkbox"
                checked={inverted}
                onChange={(e) => setInverted(e.target.checked)}
                style={{ accentColor: '#e94560', width: '16px', height: '16px', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Filtering & Hardware Specials */}
          <div style={{
            backgroundColor: '#1a1a2e',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #2d2d44',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '13px', color: '#fff' }}>Input Filtering & Peripherals</h4>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a0a0b8' }}>
                <span>Debounce Threshold (Button Chattering Filter)</span>
                <span style={{ color: '#fff' }}>{debounceMs} ms</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={debounceMs}
                onChange={(e) => setDebounceMs(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#e94560', marginTop: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#a0a0b8' }}>Whammy Bar Normalization</span>
              <input
                type="checkbox"
                checked={whammyNormalize}
                onChange={(e) => setWhammyNormalize(e.target.checked)}
                style={{ accentColor: '#e94560' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a0a0b8' }}>
                <span>Tilt Sensor Activation Threshold</span>
                <span style={{ color: '#fff' }}>{Math.round(tiltThreshold * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={tiltThreshold}
                onChange={(e) => setTiltThreshold(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#e94560', marginTop: '4px' }}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Response Curve Graph Editor */}
        <div style={{
          backgroundColor: '#1a1a2e',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid #2d2d44',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', color: '#fff' }}>Response Curve</h4>
            <div style={{ display: 'flex', gap: '6px' }}>
              {([
                ResponseCurveType.Linear,
                ResponseCurveType.Aggressive,
                ResponseCurveType.Relaxed,
                ResponseCurveType.CustomBezier,
              ] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setCurveType(type)}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: curveType === type ? '#e94560' : '#27273a',
                    color: curveType === type ? '#fff' : '#a0a0b8',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'capitalize'
                  }}
                >
                  {type.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* SVG Graph View */}
          <div style={{
            flex: 1,
            backgroundColor: '#10101d',
            borderRadius: '6px',
            border: '1px solid #252538',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px'
          }}>
            <svg viewBox="0 0 200 200" style={{ width: '100%', maxHeight: '240px' }}>
              {/* Grid Lines */}
              <line x1="20" y1="20" x2="180" y2="20" stroke="#252538" strokeWidth="1" />
              <line x1="20" y1="100" x2="180" y2="100" stroke="#252538" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="20" y1="180" x2="180" y2="180" stroke="#252538" strokeWidth="1" />
              <line x1="20" y1="20" x2="20" y2="180" stroke="#252538" strokeWidth="1" />
              <line x1="100" y1="20" x2="100" y2="180" stroke="#252538" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="180" y1="20" x2="180" y2="180" stroke="#252538" strokeWidth="1" />

              {/* Diagonal Reference */}
              <line x1="20" y1="180" x2="180" y2="20" stroke="#33334d" strokeWidth="1" strokeDasharray="4 4" />

              {/* Response Curve Path */}
              <path
                d={generateCurveSvgPath()}
                fill="none"
                stroke="#e94560"
                strokeWidth="2.5"
              />

              {/* Current Position Dot */}
              <circle
                cx={20 + (Math.abs(rawValue) > 255 ? Math.abs(rawValue) / 32767 : Math.abs(rawValue) / 255) * 160}
                cy={180 - calibratedValue * 160}
                r="5"
                fill="#3b82f6"
              />
            </svg>
          </div>

          <div style={{ marginTop: '12px', fontSize: '12px', color: '#888', lineHeight: '1.4' }}>
            {curveType === ResponseCurveType.Linear && 'Linear: 1:1 mapping across physical displacement.'}
            {curveType === ResponseCurveType.Aggressive && 'Aggressive: Rapid ramp-up with high initial sensitivity for micro-movements.'}
            {curveType === ResponseCurveType.Relaxed && 'Relaxed: Soft initial response for precision aiming with ramp-up near boundaries.'}
            {curveType === ResponseCurveType.CustomBezier && 'Custom Bezier: Multi-point smoothed spline curve.'}
          </div>
        </div>
      </div>
    </div>
  );
};
