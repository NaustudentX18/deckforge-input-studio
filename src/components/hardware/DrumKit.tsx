import React, { useMemo } from 'react';

interface DrumKitProps {
  activeInputs: Map<string, number>;
  selectedInput: string | null;
  onSelectInput: (code: string) => void;
  scale?: number;
}

const ACCENT = '#e94560';

interface PadDef {
  code: string;
  label: string;
  midiNote: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  type: 'pad' | 'cymbal' | 'pedal';
}

const PADS: PadDef[] = [
  // Drums
  { code: 'PAD_SNARE', label: 'Snare', midiNote: 38, cx: 300, cy: 300, rx: 55, ry: 50, fill: '#e8d5b7', type: 'pad' },
  { code: 'PAD_HI_TOM', label: 'Hi Tom', midiNote: 50, cx: 200, cy: 180, rx: 42, ry: 38, fill: '#c0392b', type: 'pad' },
  { code: 'PAD_MID_TOM', label: 'Mid Tom', midiNote: 47, cx: 340, cy: 170, rx: 45, ry: 40, fill: '#2980b9', type: 'pad' },
  { code: 'PAD_FLOOR_TOM', label: 'Floor Tom', midiNote: 43, cx: 470, cy: 310, rx: 52, ry: 48, fill: '#27ae60', type: 'pad' },
  // Cymbals
  { code: 'PAD_HIHAT', label: 'Hi-Hat', midiNote: 46, cx: 100, cy: 130, rx: 50, ry: 14, fill: '#f0c040', type: 'cymbal' },
  { code: 'PAD_CRASH', label: 'Crash', midiNote: 49, cx: 130, cy: 60, rx: 55, ry: 16, fill: '#f5d060', type: 'cymbal' },
  { code: 'PAD_RIDE', label: 'Ride', midiNote: 51, cx: 480, cy: 100, rx: 60, ry: 18, fill: '#dab840', type: 'cymbal' },
];

const PEDALS: PadDef[] = [
  { code: 'PEDAL_HIHAT', label: 'HH Pedal', midiNote: 44, cx: 90, cy: 440, rx: 30, ry: 50, fill: '#666', type: 'pedal' },
  { code: 'PEDAL_KICK', label: 'Kick', midiNote: 36, cx: 260, cy: 450, rx: 45, ry: 40, fill: '#555', type: 'pedal' },
  { code: 'PEDAL_KICK2', label: 'Kick 2', midiNote: 36, cx: 380, cy: 450, rx: 45, ry: 40, fill: '#555', type: 'pedal' },
];

const DrumKit: React.FC<DrumKitProps> = ({
  activeInputs,
  selectedInput,
  onSelectInput,
  scale = 1,
}) => {
  const isActive = (code: string) => (activeInputs.get(code) ?? 0) > 0;
  const velocity = (code: string) => Math.min(1, (activeInputs.get(code) ?? 0) / 127);
  const isSelected = (code: string) => selectedInput === code;

  const svgStyle = useMemo(
    () => ({ width: 600 * scale, height: 500 * scale }),
    [scale],
  );

  const renderPad = (pad: PadDef) => {
    const active = isActive(pad.code);
    const vel = velocity(pad.code);
    const selected = isSelected(pad.code);
    const pulseScale = active ? 1 + vel * 0.06 : 1;

    return (
      <g
        key={pad.code}
        data-input-code={pad.code}
        onClick={() => onSelectInput(pad.code)}
        style={{ cursor: 'pointer' }}
        transform={`translate(${pad.cx}, ${pad.cy}) scale(${pulseScale}) translate(${-pad.cx}, ${-pad.cy})`}
      >
        {/* Selection ring */}
        {selected && (
          <ellipse
            cx={pad.cx}
            cy={pad.cy}
            rx={pad.rx + 6}
            ry={pad.ry + 6}
            fill="none"
            stroke={ACCENT}
            strokeWidth="3"
            strokeDasharray="8 4"
          >
            <animate attributeName="stroke-dashoffset" from="0" to="24" dur="0.8s" repeatCount="indefinite" />
          </ellipse>
        )}

        {pad.type === 'cymbal' ? (
          <>
            {/* Cymbal stand */}
            <line
              x1={pad.cx}
              y1={pad.cy + pad.ry}
              x2={pad.cx}
              y2={pad.cy + pad.ry + 60}
              stroke="#888"
              strokeWidth="3"
            />
            <circle cx={pad.cx} cy={pad.cy + pad.ry + 60} r="8" fill="#777" stroke="#555" strokeWidth="1" />
            {/* Cymbal body */}
            <ellipse
              cx={pad.cx}
              cy={pad.cy}
              rx={pad.rx}
              ry={pad.ry}
              fill={active ? ACCENT : pad.fill}
              stroke="#a08520"
              strokeWidth="2"
              opacity={active ? 0.6 + vel * 0.4 : 0.85}
              filter={active ? 'url(#dk-glow)' : undefined}
            />
            {/* Cymbal highlight */}
            <ellipse
              cx={pad.cx - pad.rx * 0.2}
              cy={pad.cy - pad.ry * 0.2}
              rx={pad.rx * 0.4}
              ry={pad.ry * 0.35}
              fill="rgba(255,255,255,0.2)"
              pointerEvents="none"
            />
            {/* Bell */}
            <circle cx={pad.cx} cy={pad.cy} r="6" fill="#c8a830" stroke="#a08520" strokeWidth="1" pointerEvents="none" />
          </>
        ) : pad.type === 'pedal' ? (
          <>
            {/* Pedal base plate */}
            <rect
              x={pad.cx - pad.rx}
              y={pad.cy - pad.ry}
              width={pad.rx * 2}
              height={pad.ry * 2}
              rx="8"
              fill="#333"
              stroke="#555"
              strokeWidth="2"
            />
            {/* Pedal surface */}
            <rect
              x={pad.cx - pad.rx + 5}
              y={pad.cy - pad.ry + 5}
              width={pad.rx * 2 - 10}
              height={pad.ry * 2 - 10}
              rx="5"
              fill={active ? ACCENT : pad.fill}
              stroke="#444"
              strokeWidth="1.5"
              opacity={active ? 0.7 + vel * 0.3 : 0.8}
              filter={active ? 'url(#dk-glow)' : undefined}
            />
            {/* Pedal grip lines */}
            {[0.25, 0.5, 0.75].map((t) => (
              <line
                key={t}
                x1={pad.cx - pad.rx + 12}
                y1={pad.cy - pad.ry + 8 + t * (pad.ry * 2 - 16)}
                x2={pad.cx + pad.rx - 12}
                y2={pad.cy - pad.ry + 8 + t * (pad.ry * 2 - 16)}
                stroke="#777"
                strokeWidth="1.5"
                opacity="0.5"
                pointerEvents="none"
              />
            ))}
            {/* Hinge */}
            <rect
              x={pad.cx - 12}
              y={pad.cy - pad.ry - 6}
              width="24"
              height="8"
              rx="3"
              fill="#444"
              stroke="#555"
              strokeWidth="1"
              pointerEvents="none"
            />
          </>
        ) : (
          <>
            {/* Drum rim */}
            <ellipse
              cx={pad.cx}
              cy={pad.cy}
              rx={pad.rx}
              ry={pad.ry}
              fill="#444"
              stroke="#555"
              strokeWidth="2.5"
            />
            {/* Drum head */}
            <ellipse
              cx={pad.cx}
              cy={pad.cy}
              rx={pad.rx - 4}
              ry={pad.ry - 4}
              fill={active ? ACCENT : pad.fill}
              stroke={active ? ACCENT : '#888'}
              strokeWidth="1.5"
              opacity={active ? 0.6 + vel * 0.4 : 0.8}
              filter={active ? 'url(#dk-glow)' : undefined}
            />
            {/* Drum head highlight */}
            <ellipse
              cx={pad.cx - pad.rx * 0.15}
              cy={pad.cy - pad.ry * 0.2}
              rx={pad.rx * 0.35}
              ry={pad.ry * 0.25}
              fill="rgba(255,255,255,0.15)"
              pointerEvents="none"
            />
          </>
        )}

        {/* Label */}
        <text
          x={pad.cx}
          y={pad.type === 'pedal' ? pad.cy + pad.ry + 16 : pad.cy + pad.ry + (pad.type === 'cymbal' ? -4 : 14)}
          textAnchor="middle"
          fill="#ccc"
          fontSize="10"
          fontWeight="bold"
          pointerEvents="none"
        >
          {pad.label}
        </text>

        {/* MIDI note label */}
        <text
          x={pad.cx}
          y={pad.cy + (pad.type === 'cymbal' ? 2 : 4)}
          textAnchor="middle"
          dominantBaseline="central"
          fill={active ? '#fff' : '#666'}
          fontSize="9"
          pointerEvents="none"
        >
          MIDI {pad.midiNote}
        </text>
      </g>
    );
  };

  return (
    <svg
      viewBox="0 0 600 500"
      style={svgStyle}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="dk-glow">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="dk-floor-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e1e2e" />
          <stop offset="100%" stopColor="#0e0e1e" />
        </linearGradient>
      </defs>

      {/* Floor / background */}
      <rect x="0" y="0" width="600" height="500" rx="12" fill="url(#dk-floor-grad)" />

      {/* Drum rack frame (subtle) */}
      <path
        d="M100,130 C100,50 500,50 500,130"
        fill="none"
        stroke="#444"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.4"
      />
      <line x1="100" y1="130" x2="90" y2="400" stroke="#444" strokeWidth="3" opacity="0.4" />
      <line x1="500" y1="130" x2="510" y2="400" stroke="#444" strokeWidth="3" opacity="0.4" />

      {/* Cymbals (render first so they're behind drums) */}
      {PADS.filter((p) => p.type === 'cymbal').map(renderPad)}

      {/* Drum pads */}
      {PADS.filter((p) => p.type === 'pad').map(renderPad)}

      {/* Pedals */}
      {PEDALS.map(renderPad)}

      {/* Title */}
      <text x="300" y="22" textAnchor="middle" fill="#555" fontSize="12" fontWeight="bold" pointerEvents="none">
        DRUM KIT
      </text>
    </svg>
  );
};

export default DrumKit;
