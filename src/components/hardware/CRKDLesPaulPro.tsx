import React, { useMemo } from 'react';
import { fitSvgStyle } from '../../utils/svgFit';

export interface CRKDLesPaulProProps {
  activeInputs: Map<string, number>;
  selectedInput: string | null;
  onSelectInput: (code: string) => void;
  scale?: number;
  connectionMode?: 'bluetooth' | 'usb' | 'wireless_2_4g';
  batteryLevel?: number; // 0 - 100
  finish?: 'stealth_gold' | 'cherry_sunburst' | 'ebony_custom';
}

const ACCENT = '#f59e0b'; // Gold accent for Les Paul Pro

const MECHANICAL_FRETS = [
  { code: 'FRET_GREEN', fill: '#22c55e', label: '1', key: 'G' },
  { code: 'FRET_RED', fill: '#ef4444', label: '2', key: 'R' },
  { code: 'FRET_YELLOW', fill: '#eab308', label: '3', key: 'Y' },
  { code: 'FRET_BLUE', fill: '#3b82f6', label: '4', key: 'B' },
  { code: 'FRET_ORANGE', fill: '#f97316', label: '5', key: 'O' },
];

const SOLO_FRETS = [
  { code: 'SOLO_GREEN', fill: '#22c55e', label: 'S1' },
  { code: 'SOLO_RED', fill: '#ef4444', label: 'S2' },
  { code: 'SOLO_YELLOW', fill: '#eab308', label: 'S3' },
  { code: 'SOLO_BLUE', fill: '#3b82f6', label: 'S4' },
  { code: 'SOLO_ORANGE', fill: '#f97316', label: 'S5' },
];

const SPEED_KNOBS = [
  { code: 'KNOB_VOL_NECK', label: 'VOL 1', x: 285, y: 550, desc: 'Neck Volume' },
  { code: 'KNOB_VOL_BRIDGE', label: 'VOL 2', x: 330, y: 580, desc: 'Bridge Volume' },
  { code: 'KNOB_TONE_NECK', label: 'TONE 1', x: 265, y: 615, desc: 'Neck Tone / Whammy Dial' },
  { code: 'KNOB_TONE_BRIDGE', label: 'TONE 2', x: 310, y: 645, desc: 'Bridge Tone / Tilt Gain' },
];

export const CRKDLesPaulPro: React.FC<CRKDLesPaulProProps> = ({
  activeInputs,
  selectedInput,
  onSelectInput,
  scale = 1,
  connectionMode = 'wireless_2_4g',
  batteryLevel = 92,
  finish = 'stealth_gold',
}) => {
  const isActive = (code: string) => (activeInputs.get(code) ?? 0) > 0;
  const getValue = (code: string) => activeInputs.get(code) ?? 0;
  const isSelected = (code: string) => selectedInput === code;

  const whammyValue = getValue('WHAMMY');
  const tiltValue = getValue('TILT');
  const pickupToggleActive = isActive('TOGGLE_PICKUP') || isActive('STAR_POWER') || isActive('BTN_MODE');

  const svgStyle = useMemo(
    () => fitSvgStyle(420, 740, scale),
    [scale],
  );

  const renderHighlightCircle = (cx: number, cy: number, r: number) => (
    <circle
      cx={cx}
      cy={cy}
      r={r + 4}
      fill="none"
      stroke={ACCENT}
      strokeWidth="3"
      strokeDasharray="6 3"
      className="highlight-ring"
    >
      <animate attributeName="stroke-dashoffset" from="0" to="18" dur="0.8s" repeatCount="indefinite" />
    </circle>
  );

  const renderHighlightRect = (x: number, y: number, w: number, h: number, rx = 5) => (
    <rect
      x={x - 3}
      y={y - 3}
      width={w + 6}
      height={h + 6}
      rx={rx + 2}
      fill="none"
      stroke={ACCENT}
      strokeWidth="3"
      strokeDasharray="6 3"
      className="highlight-ring"
    >
      <animate attributeName="stroke-dashoffset" from="0" to="18" dur="0.8s" repeatCount="indefinite" />
    </rect>
  );

  return (
    <svg
      viewBox="0 0 420 740"
      style={svgStyle}
      xmlns="http://www.w3.org/2000/svg"
      className="deckforge-crkd-les-paul-pro"
    >
      <defs>
        {/* Glow & Drop Shadow Filters */}
        <filter id="lp-glow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="4.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="lp-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#000000" floodOpacity="0.75" />
        </filter>
        <filter id="gold-shimmer" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f59e0b" floodOpacity="0.8" />
        </filter>

        {/* Finish Gradients */}
        {/* Stealth Matte Black & Gold (Default) */}
        <radialGradient id="lp-carved-body" cx="45%" cy="60%" r="55%" fx="40%" fy="55%">
          <stop offset="0%" stopColor="#2a2c38" />
          <stop offset="65%" stopColor="#181922" />
          <stop offset="100%" stopColor="#0d0e14" />
        </radialGradient>

        {/* Gold Binding Rim */}
        <linearGradient id="lp-gold-trim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd700" />
          <stop offset="50%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>

        {/* Fretboard Rosewood Gradient */}
        <linearGradient id="lp-fretboard-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1c1614" />
          <stop offset="50%" stopColor="#2b201c" />
          <stop offset="100%" stopColor="#1c1614" />
        </linearGradient>

        {/* Chrome & Gold Hardware Gradients */}
        <linearGradient id="lp-chrome-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#cbd5e1" />
          <stop offset="70%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>

        <linearGradient id="lp-gold-hardware" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="40%" stopColor="#eab308" />
          <stop offset="80%" stopColor="#ca8a04" />
          <stop offset="100%" stopColor="#854d0e" />
        </linearGradient>

        {/* Pearloid Inlay Pattern */}
        <linearGradient id="pearloid-inlay" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="50%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
      </defs>

      {/* ── 1. Iconic Single-Cutaway Les Paul Body Silhouette ── */}
      {/* Outer gold multi-ply binding */}
      <path
        d="M 145,260
           C 120,265 80,290 60,335
           C 35,390 40,460 70,510
           C 50,560 45,630 85,685
           C 125,740 210,740 250,725
           C 300,740 375,720 395,655
           C 415,595 385,530 355,495
           C 375,455 370,410 350,370
           C 330,330 295,305 270,300
           C 275,325 290,345 285,365
           C 280,380 265,390 250,375
           C 245,360 250,320 255,260
           Z"
        fill="none"
        stroke="url(#lp-gold-trim)"
        strokeWidth="6"
        strokeLinejoin="round"
        filter="url(#lp-shadow)"
      />

      {/* Main Carved-Top Body Surface */}
      <path
        d="M 145,260
           C 120,265 80,290 60,335
           C 35,390 40,460 70,510
           C 50,560 45,630 85,685
           C 125,740 210,740 250,725
           C 300,740 375,720 395,655
           C 415,595 385,530 355,495
           C 375,455 370,410 350,370
           C 330,330 295,305 270,300
           C 275,325 290,345 285,365
           C 280,380 265,390 250,375
           C 245,360 250,320 255,260
           Z"
        fill="url(#lp-carved-body)"
        stroke="#475569"
        strokeWidth="1.5"
      />

      {/* Arched Carve Contour Line (Sculpted Top Highlight) */}
      <path
        d="M 148,272
           C 128,277 95,300 78,340
           C 58,388 62,450 88,495
           C 70,542 66,610 100,660
           C 134,710 205,712 242,700
           C 285,712 352,695 372,640
           C 390,588 362,532 336,502
           C 354,465 350,425 332,388
           C 314,352 284,328 262,322
           Z"
        fill="none"
        stroke="#334155"
        strokeWidth="1.5"
        strokeDasharray="6 3"
        opacity="0.6"
      />

      {/* ── 2. Raised Les Paul Pickguard with Chrome Bracket ── */}
      <g id="lp-pickguard" transform="translate(142, 345)">
        {/* Shadow */}
        <path
          d="M 5,20 L 5,160 C 25,185 55,190 70,175 C 65,155 70,90 60,60 C 50,30 25,15 5,20 Z"
          fill="#000"
          opacity="0.4"
        />
        {/* Multi-ply 3-layer Pickguard */}
        <path
          d="M 0,15 L 0,155 C 20,180 50,185 65,170 C 60,150 65,85 55,55 C 45,25 20,10 0,15 Z"
          fill="#0f172a"
          stroke="url(#lp-gold-trim)"
          strokeWidth="1.5"
        />
        {/* Mounting screw bracket */}
        <circle cx="52" cy="115" r="3.5" fill="url(#lp-chrome-metal)" />
        <rect x="52" y="113" width="16" height="4" fill="url(#lp-chrome-metal)" />
        <circle cx="68" cy="115" r="2.5" fill="#334155" />
      </g>

      {/* ── 3. Headstock (Classic Open-Book Silhouette) ── */}
      <g id="lp-headstock" transform="translate(0, 0)">
        {/* Open-book shape */}
        <path
          d="M 148,65
             L 135,16
             C 142,6 170,14 200,4
             C 230,14 258,6 265,16
             L 252,65
             Z"
          fill="#0f1016"
          stroke="url(#lp-gold-trim)"
          strokeWidth="2"
        />

        {/* CRKD PRO Inlay Logo */}
        <text
          x="200"
          y="28"
          textAnchor="middle"
          fill="url(#lp-gold-hardware)"
          fontSize="10"
          fontWeight="900"
          letterSpacing="2"
          filter="url(#gold-shimmer)"
        >
          CRKD PRO
        </text>

        {/* Truss Rod Bell Cover */}
        <polygon
          points="193,42 207,42 204,58 196,58"
          fill="#000"
          stroke="#cbd5e1"
          strokeWidth="0.8"
        />
        <text x="200" y="52" textAnchor="middle" fill="#f8fafc" fontSize="5" fontWeight="bold">
          LES PAUL
        </text>

        {/* 6 Deluxe Gold Tuning Pegs (3 per side) */}
        {/* Bass side */}
        <circle cx="128" cy="22" r="5" fill="url(#lp-gold-hardware)" stroke="#451a03" strokeWidth="1" />
        <circle cx="130" cy="37" r="5" fill="url(#lp-gold-hardware)" stroke="#451a03" strokeWidth="1" />
        <circle cx="133" cy="52" r="5" fill="url(#lp-gold-hardware)" stroke="#451a03" strokeWidth="1" />
        {/* Treble side */}
        <circle cx="272" cy="22" r="5" fill="url(#lp-gold-hardware)" stroke="#451a03" strokeWidth="1" />
        <circle cx="270" cy="37" r="5" fill="url(#lp-gold-hardware)" stroke="#451a03" strokeWidth="1" />
        <circle cx="267" cy="52" r="5" fill="url(#lp-gold-hardware)" stroke="#451a03" strokeWidth="1" />

        {/* Bone Nut */}
        <rect x="146" y="62" width="108" height="6" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="0.8" />
      </g>

      {/* ── 4. Neck & Fretboard with Pearloid Trapezoid Inlays ── */}
      <rect
        x="148"
        y="68"
        width="104"
        height="192"
        fill="url(#lp-fretboard-grad)"
        stroke="url(#lp-gold-trim)"
        strokeWidth="1.5"
      />

      {/* Pearloid Trapezoid Inlays between frets */}
      <polygon points="175,108 225,108 220,118 180,118" fill="url(#pearloid-inlay)" opacity="0.85" />
      <polygon points="178,148 222,148 217,158 183,158" fill="url(#pearloid-inlay)" opacity="0.85" />
      <polygon points="180,188 220,188 216,198 184,198" fill="url(#pearloid-inlay)" opacity="0.85" />
      <polygon points="182,228 218,228 215,238 185,238" fill="url(#pearloid-inlay)" opacity="0.85" />

      {/* ── 5. Five Kailh/Cherry MX Mechanical Fret Buttons ── */}
      <g id="lp-primary-frets">
        {MECHANICAL_FRETS.map((fret, i) => {
          const yPos = 75 + i * 38;
          const active = isActive(fret.code);
          const selected = isSelected(fret.code);

          return (
            <g
              key={fret.code}
              transform={`translate(152, ${yPos})`}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectInput(fret.code)}
            >
              {selected && renderHighlightRect(0, 0, 96, 26, 6)}
              {/* Keycap Housing */}
              <rect
                x="0"
                y="0"
                width="96"
                height="26"
                rx="6"
                fill={active ? fret.fill : '#1e293b'}
                stroke={active ? '#ffffff' : '#475569'}
                strokeWidth={active ? 2.5 : 1.5}
                filter={active ? 'url(#lp-glow)' : undefined}
                className="fret-btn transition-all"
              />
              {/* Fret Color Accent Band */}
              <rect
                x="6"
                y="6"
                width="84"
                height="14"
                rx="3"
                fill={fret.fill}
                opacity={active ? 1 : 0.85}
              />
              {/* Cherry MX Cross-Stem Indicator */}
              <line x1="48" y1="9" x2="48" y2="17" stroke="#ffffff" strokeWidth="2" opacity="0.9" />
              <line x1="44" y1="13" x2="52" y2="13" stroke="#ffffff" strokeWidth="2" opacity="0.9" />
              {/* Label */}
              <text
                x="14"
                y="17"
                fill="#ffffff"
                fontSize="10"
                fontWeight="900"
                fontFamily="system-ui, sans-serif"
              >
                {fret.label}
              </text>
              <text
                x="84"
                y="16.5"
                textAnchor="end"
                fill="#ffffff"
                fontSize="9"
                fontWeight="bold"
                opacity="0.8"
              >
                {fret.key}
              </text>
            </g>
          );
        })}
      </g>

      {/* ── 6. Five Lower Solo / Tap Frets (High-Speed Neck Section) ── */}
      <g id="lp-solo-frets">
        {/* Solo fretboard extension */}
        <rect x="156" y="260" width="88" height="52" fill="#141824" stroke="#334155" strokeWidth="1" />
        <text x="200" y="271" textAnchor="middle" fill="#64748b" fontSize="6.5" fontWeight="900" letterSpacing="1">
          SOLO TAP STRIP
        </text>
        {SOLO_FRETS.map((sf, idx) => {
          const xPos = 162 + idx * 15.5;
          const active = isActive(sf.code);
          const selected = isSelected(sf.code);

          return (
            <g
              key={sf.code}
              transform={`translate(${xPos}, 278)`}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectInput(sf.code)}
            >
              {selected && renderHighlightRect(0, 0, 13, 28, 3)}
              <rect
                x="0"
                y="0"
                width="13"
                height="28"
                rx="3"
                fill={active ? sf.fill : '#1e293b'}
                stroke={active ? '#ffffff' : sf.fill}
                strokeWidth={active ? 2 : 1}
                filter={active ? 'url(#lp-glow)' : undefined}
              />
              <text
                x="6.5"
                y="18"
                textAnchor="middle"
                fill={active ? '#000' : '#fff'}
                fontSize="7.5"
                fontWeight="900"
              >
                {sf.label}
              </text>
            </g>
          );
        })}
      </g>

      {/* ── 7. Les Paul 3-Way Pickup Toggle Switch (Rhythm / Treble Plate) ── */}
      {/* Upper Bass Shoulder — Mapped to Star Power / Overdrive / Layer Toggle */}
      <g
        id="lp-pickup-selector"
        transform="translate(100, 360)"
        style={{ cursor: 'pointer' }}
        onClick={() => onSelectInput('TOGGLE_PICKUP')}
      >
        {isSelected('TOGGLE_PICKUP') && renderHighlightCircle(0, 0, 24)}
        {/* Black & Gold Washer Ring */}
        <circle cx="0" cy="0" r="22" fill="#090a0f" stroke="url(#lp-gold-trim)" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="17" fill="none" stroke="#334155" strokeWidth="0.8" />
        {/* RHYTHM / TREBLE stamped text */}
        <text x="0" y="-8" textAnchor="middle" fill="#d97706" fontSize="5.5" fontWeight="900" letterSpacing="1">
          RHYTHM
        </text>
        <text x="0" y="14" textAnchor="middle" fill="#d97706" fontSize="5.5" fontWeight="900" letterSpacing="1">
          TREBLE
        </text>
        {/* Toggle Bat Hinge & Tip */}
        <circle cx="0" cy="2" r="6" fill="url(#lp-chrome-metal)" />
        <ellipse
          cx={pickupToggleActive ? 4 : 0}
          cy={pickupToggleActive ? -4 : 2}
          rx="3.5"
          ry="7"
          fill={pickupToggleActive ? '#22c55e' : '#f8fafc'}
          stroke="#475569"
          strokeWidth="1"
          filter={pickupToggleActive ? 'url(#lp-glow)' : undefined}
          transform={pickupToggleActive ? 'rotate(25 0 2)' : undefined}
        />
        <text x="0" y="28" textAnchor="middle" fill="#94a3b8" fontSize="6.5" fontWeight="bold">
          STAR POWER
        </text>
      </g>

      {/* ── 8. Navigation D-Pad & Aux Menu Cluster ── */}
      <g id="lp-nav-cluster" transform="translate(95, 470)">
        {/* D-Pad Cross Background Plate */}
        <rect x="-24" y="-24" width="48" height="48" rx="8" fill="#13151f" stroke="#2a2c3d" strokeWidth="1" />

        {/* Up */}
        <g
          style={{ cursor: 'pointer' }}
          onClick={() => onSelectInput('DPAD_UP')}
          transform="translate(-6, -20)"
        >
          {isSelected('DPAD_UP') && renderHighlightRect(0, 0, 12, 14, 2)}
          <rect
            x="0"
            y="0"
            width="12"
            height="14"
            rx="2"
            fill={isActive('DPAD_UP') ? ACCENT : '#1e202e'}
            stroke="#3d4059"
            strokeWidth="1"
          />
          <polygon points="6,3 2,9 10,9" fill="#fff" />
        </g>
        {/* Down */}
        <g
          style={{ cursor: 'pointer' }}
          onClick={() => onSelectInput('DPAD_DOWN')}
          transform="translate(-6, 6)"
        >
          {isSelected('DPAD_DOWN') && renderHighlightRect(0, 0, 12, 14, 2)}
          <rect
            x="0"
            y="0"
            width="12"
            height="14"
            rx="2"
            fill={isActive('DPAD_DOWN') ? ACCENT : '#1e202e'}
            stroke="#3d4059"
            strokeWidth="1"
          />
          <polygon points="6,11 2,5 10,5" fill="#fff" />
        </g>
        {/* Left */}
        <g
          style={{ cursor: 'pointer' }}
          onClick={() => onSelectInput('DPAD_LEFT')}
          transform="translate(-20, -6)"
        >
          {isSelected('DPAD_LEFT') && renderHighlightRect(0, 0, 14, 12, 2)}
          <rect
            x="0"
            y="0"
            width="14"
            height="12"
            rx="2"
            fill={isActive('DPAD_LEFT') ? ACCENT : '#1e202e'}
            stroke="#3d4059"
            strokeWidth="1"
          />
          <polygon points="3,6 9,2 9,10" fill="#fff" />
        </g>
        {/* Right */}
        <g
          style={{ cursor: 'pointer' }}
          onClick={() => onSelectInput('DPAD_RIGHT')}
          transform="translate(6, -6)"
        >
          {isSelected('DPAD_RIGHT') && renderHighlightRect(0, 0, 14, 12, 2)}
          <rect
            x="0"
            y="0"
            width="14"
            height="12"
            rx="2"
            fill={isActive('DPAD_RIGHT') ? ACCENT : '#1e202e'}
            stroke="#3d4059"
            strokeWidth="1"
          />
          <polygon points="11,6 5,2 5,10" fill="#fff" />
        </g>

        {/* Center Pivot */}
        <circle cx="0" cy="0" r="3.5" fill="#0f1017" />
      </g>

      {/* Aux Buttons: Start / Select / Steam Home */}
      <g id="lp-aux-buttons" transform="translate(85, 545)">
        {/* View / Select */}
        <g style={{ cursor: 'pointer' }} onClick={() => onSelectInput('BTN_SELECT')}>
          {isSelected('BTN_SELECT') && renderHighlightCircle(0, 0, 8)}
          <circle cx="0" cy="0" r="7" fill={isActive('BTN_SELECT') ? ACCENT : '#1a1c27'} stroke="#475569" strokeWidth="1" />
          <text x="0" y="3" textAnchor="middle" fill="#cbd5e1" fontSize="6" fontWeight="bold">◀</text>
        </g>
        {/* Steam Home Guide */}
        <g style={{ cursor: 'pointer' }} onClick={() => onSelectInput('BTN_MODE')} transform="translate(20, 0)">
          {isSelected('BTN_MODE') && renderHighlightCircle(0, 0, 9)}
          <circle cx="0" cy="0" r="8" fill={isActive('BTN_MODE') ? '#38bdf8' : '#0f172a'} stroke="url(#lp-gold-trim)" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="3" fill="#38bdf8" />
        </g>
        {/* Menu / Start */}
        <g style={{ cursor: 'pointer' }} onClick={() => onSelectInput('BTN_START')} transform="translate(40, 0)">
          {isSelected('BTN_START') && renderHighlightCircle(0, 0, 8)}
          <circle cx="0" cy="0" r="7" fill={isActive('BTN_START') ? ACCENT : '#1a1c27'} stroke="#475569" strokeWidth="1" />
          <text x="0" y="3" textAnchor="middle" fill="#cbd5e1" fontSize="6" fontWeight="bold">▶</text>
        </g>
      </g>

      {/* ── 9. Precision Dual-Switch Strum Bar Assembly ── */}
      {/* Positioned authentically where the guitar pickups sit */}
      <g id="lp-strum-assembly" transform="translate(160, 360)">
        {/* Humbucker Pickup Bezel Frame */}
        <rect
          x="0"
          y="0"
          width="80"
          height="140"
          rx="8"
          fill="#0c0d13"
          stroke="url(#lp-gold-hardware)"
          strokeWidth="2"
        />

        {/* Strum Cavity Inset */}
        <rect x="8" y="10" width="64" height="120" rx="6" fill="#151722" stroke="#25283b" strokeWidth="1" />

        {/* Center Strum Pivot Guidelines */}
        <line x1="40" y1="15" x2="40" y2="125" stroke="#26293d" strokeWidth="1.5" strokeDasharray="3 3" />

        {/* Strum UP Target Area */}
        <g
          style={{ cursor: 'pointer' }}
          onClick={() => onSelectInput('STRUM_UP')}
        >
          {isSelected('STRUM_UP') && renderHighlightRect(14, 18, 52, 44, 4)}
          <rect
            x="16"
            y="20"
            width="48"
            height="40"
            rx="4"
            fill={isActive('STRUM_UP') ? '#22c55e' : '#1e2233'}
            stroke={isActive('STRUM_UP') ? '#ffffff' : '#3d4461'}
            strokeWidth={isActive('STRUM_UP') ? 2 : 1}
            filter={isActive('STRUM_UP') ? 'url(#lp-glow)' : undefined}
          />
          <polygon points="40,28 30,42 50,42" fill={isActive('STRUM_UP') ? '#ffffff' : '#94a3b8'} />
          <text
            x="40"
            y="54"
            textAnchor="middle"
            fill={isActive('STRUM_UP') ? '#ffffff' : '#64748b'}
            fontSize="8"
            fontWeight="bold"
          >
            STRUM UP
          </text>
        </g>

        {/* Central Switch Divider Bar */}
        <rect x="18" y="66" width="44" height="8" rx="2" fill="#0d0e14" stroke="#334155" strokeWidth="1" />

        {/* Strum DOWN Target Area */}
        <g
          style={{ cursor: 'pointer' }}
          onClick={() => onSelectInput('STRUM_DOWN')}
        >
          {isSelected('STRUM_DOWN') && renderHighlightRect(14, 78, 52, 44, 4)}
          <rect
            x="16"
            y="80"
            width="48"
            height="40"
            rx="4"
            fill={isActive('STRUM_DOWN') ? '#22c55e' : '#1e2233'}
            stroke={isActive('STRUM_DOWN') ? '#ffffff' : '#3d4461'}
            strokeWidth={isActive('STRUM_DOWN') ? 2 : 1}
            filter={isActive('STRUM_DOWN') ? 'url(#lp-glow)' : undefined}
          />
          <polygon points="40,112 30,98 50,98" fill={isActive('STRUM_DOWN') ? '#ffffff' : '#94a3b8'} />
          <text
            x="40"
            y="94"
            textAnchor="middle"
            fill={isActive('STRUM_DOWN') ? '#ffffff' : '#64748b'}
            fontSize="8"
            fontWeight="bold"
          >
            STRUM DN
          </text>
        </g>
      </g>

      {/* ── 10. Tune-o-Matic Bridge & Stopbar Tailpiece ── */}
      <g id="lp-bridge-tailpiece" transform="translate(162, 515)">
        {/* Tune-o-Matic Bridge */}
        <rect x="0" y="0" width="76" height="12" rx="3" fill="url(#lp-gold-hardware)" stroke="#451a03" strokeWidth="1" />
        {/* 6 Bridge Saddles */}
        {[8, 20, 32, 44, 56, 68].map((sx, idx) => (
          <rect key={idx} x={sx} y="2" width="4" height="8" fill="#fff" opacity="0.8" />
        ))}

        {/* Stopbar Tailpiece */}
        <rect x="4" y="24" width="68" height="14" rx="4" fill="url(#lp-gold-hardware)" stroke="#451a03" strokeWidth="1.2" />
        {/* Tailpiece mounting studs */}
        <circle cx="8" cy="31" r="4" fill="url(#lp-chrome-metal)" />
        <circle cx="68" cy="31" r="4" fill="url(#lp-chrome-metal)" />
      </g>

      {/* ── 11. Heavy-Duty Whammy Bar Assembly ── */}
      <g
        id="lp-whammy-assembly"
        transform="translate(242, 535)"
        style={{ cursor: 'pointer' }}
        onClick={() => onSelectInput('WHAMMY')}
      >
        {isSelected('WHAMMY') && renderHighlightCircle(0, 0, 26)}

        {/* Base Pivot Socket */}
        <circle cx="0" cy="0" r="14" fill="#181a24" stroke="url(#lp-gold-trim)" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="8" fill="url(#lp-chrome-metal)" />
        <circle cx="0" cy="0" r="3" fill="#1e293b" />

        {/* Dynamic Rotation based on WHAMMY value (0.0 to 1.0) */}
        <g transform={`rotate(${whammyValue * 30}, 0, 0)`}>
          {/* Whammy Arm Shaft */}
          <line
            x1="0"
            y1="0"
            x2="35"
            y2="75"
            stroke="url(#lp-chrome-metal)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          {/* Whammy Tip Handle */}
          <ellipse
            cx="37"
            cy="79"
            rx="6"
            ry="12"
            transform="rotate(25 37 79)"
            fill={whammyValue > 0.05 ? ACCENT : '#f8fafc'}
            stroke="#475569"
            strokeWidth="1"
            filter={whammyValue > 0.05 ? 'url(#lp-glow)' : undefined}
          />
        </g>

        {/* Whammy Value Gauge Arc */}
        <text
          x="32"
          y="15"
          fill={whammyValue > 0 ? ACCENT : '#94a3b8'}
          fontSize="9"
          fontWeight="bold"
        >
          {Math.round(whammyValue * 100)}%
        </text>
      </g>

      {/* ── 12. Four Gold Speed Knobs (Volume 1/2, Tone 1/2) ── */}
      <g id="lp-speed-knobs">
        {SPEED_KNOBS.map((knob) => {
          const active = isActive(knob.code);
          const selected = isSelected(knob.code);
          const rawVal = getValue(knob.code);

          return (
            <g
              key={knob.code}
              transform={`translate(${knob.x}, ${knob.y})`}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectInput(knob.code)}
            >
              {selected && renderHighlightCircle(0, 0, 18)}
              {/* Outer Amber/Gold Speed Knob */}
              <circle
                cx="0"
                cy="0"
                r="16"
                fill="url(#lp-gold-hardware)"
                stroke="#78350f"
                strokeWidth="1.5"
                filter={active ? 'url(#lp-glow)' : undefined}
              />
              {/* Embossed Numbers Ring */}
              <circle cx="0" cy="0" r="12" fill="#451a03" stroke="#b45309" strokeWidth="0.8" />
              {/* Position indicator notch */}
              <line
                x1="0"
                y1="-11"
                x2="0"
                y2="-5"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinecap="round"
                transform={`rotate(${rawVal * 270 - 135}, 0, 0)`}
              />
              <text
                x="0"
                y="3"
                textAnchor="middle"
                fill="#fef08a"
                fontSize="6"
                fontWeight="bold"
              >
                {knob.label}
              </text>
            </g>
          );
        })}
      </g>

      {/* ── 13. Tilt Sensor / Accelerometer Star Power Bar ── */}
      <g
        id="lp-tilt-meter"
        transform="translate(155, 685)"
        style={{ cursor: 'pointer' }}
        onClick={() => onSelectInput('TILT')}
      >
        {isSelected('TILT') && renderHighlightRect(0, 0, 90, 22, 5)}
        <rect x="0" y="0" width="90" height="20" rx="4" fill="#0f172a" stroke="url(#lp-gold-trim)" strokeWidth="1" />
        {/* Tilt gauge fill */}
        <rect
          x="2"
          y="2"
          width={Math.min(86, (tiltValue / 90) * 86)}
          height="16"
          rx="3"
          fill={tiltValue >= 55 ? '#22c55e' : '#eab308'}
          filter={tiltValue >= 55 ? 'url(#lp-glow)' : undefined}
        />
        {/* Threshold activation indicator line at ~55 deg */}
        <line x1="52" y1="2" x2="52" y2="18" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="2 2" />
        <text x="45" y="13.5" textAnchor="middle" fill="#ffffff" fontSize="7.5" fontWeight="900">
          TILT {Math.round(tiltValue)}° {tiltValue >= 55 ? '★ STAR POWER' : ''}
        </text>
      </g>

      {/* ── 14. Pro Status Strip (Tri-Mode & Battery) ── */}
      <g id="lp-status-panel" transform="translate(145, 715)">
        <rect x="0" y="0" width="110" height="16" rx="4" fill="#090a10" stroke="#334155" strokeWidth="1" />
        <circle
          cx="10"
          cy="8"
          r="3.5"
          fill={connectionMode === 'wireless_2_4g' ? '#22c55e' : connectionMode === 'usb' ? '#38bdf8' : '#a855f7'}
          filter="url(#lp-glow)"
        />
        <text x="18" y="11" fill="#cbd5e1" fontSize="7" fontWeight="bold">
          {connectionMode === 'wireless_2_4g' ? '2.4G 1000Hz' : connectionMode.toUpperCase()}
        </text>
        <text x="76" y="11" fill="#f59e0b" fontSize="6.5" fontWeight="bold">
          ⚡ {batteryLevel}%
        </text>
      </g>
    </svg>
  );
};

export default CRKDLesPaulPro;
