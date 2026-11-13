import React, { useState } from 'react';

interface LaunchPageProps {
  onLaunchStudio: () => void;
  activeDeviceName?: string;
  connectionState: string;
}

export const LaunchPage: React.FC<LaunchPageProps> = ({
  onLaunchStudio,
  activeDeviceName,
  connectionState,
}) => {
  const [activeGuideTab, setActiveGuideTab] = useState<'hardware' | 'vdf' | 'diagnostics' | 'setup'>('hardware');

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#0e0e17',
      color: '#e2e8f0',
      overflowY: 'auto',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box',
      padding: '32px 40px',
    }}>
      {/* ── Header & Hero ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #1f1f33',
        paddingBottom: '24px',
        marginBottom: '28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Custom Vector Logo */}
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #e94560 0%, #16213e 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(233, 69, 96, 0.35)',
            border: '2px solid rgba(255,255,255,0.1)',
          }}>
            <svg viewBox="0 0 40 40" width="38" height="38">
              <path d="M 8 12 L 20 6 L 32 12 L 32 28 L 20 34 L 8 28 Z" fill="#1a1a2e" stroke="#e94560" strokeWidth="2" />
              {/* Controller D-pad & Buttons */}
              <circle cx="16" cy="18" r="3" fill="#00e5ff" />
              <circle cx="24" cy="18" r="3" fill="#e94560" />
              <circle cx="20" cy="24" r="3.5" fill="#f1c40f" />
            </svg>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff' }}>
                DeckForge Input Studio
              </h1>
              <span style={{
                backgroundColor: '#1f1f38',
                color: '#e94560',
                border: '1px solid rgba(233, 69, 96, 0.4)',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.05em',
              }}>
                v0.1.0 STEAMOS
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
              Universal Hardware Mapper & Steam Input VDF Compiler for Steam Deck & Remote Desktops
            </p>
          </div>
        </div>

        {/* Live Status & Launch CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            fontSize: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: connectionState === 'connected' ? '#10b981' : '#f43f5e',
                boxShadow: connectionState === 'connected' ? '0 0 10px #10b981' : 'none',
              }} />
              <span style={{ color: '#fff', fontWeight: 600 }}>
                {connectionState === 'connected' ? 'Engine Online' : 'Engine Standby'}
              </span>
            </div>
            <span style={{ color: '#64748b', fontSize: '11px' }}>
              {activeDeviceName || 'Ready for Device Connect'}
            </span>
          </div>

          <button
            onClick={onLaunchStudio}
            style={{
              padding: '12px 26px',
              background: 'linear-gradient(135deg, #e94560 0%, #c82333 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(233, 69, 96, 0.45)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'transform 0.15s ease',
            }}
          >
            Launch Input Studio →
          </button>
        </div>
      </div>

      {/* ── Capability Badges ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '28px',
      }}>
        {[
          { label: 'Dual-Mode Deployment', desc: 'Decky Loader QAM & Remote Tailscale Web', icon: '⚡' },
          { label: 'Triple VDF Synchronization', desc: 'Steam Controller Configs, Cloud & Local Vault', icon: '🔄' },
          { label: 'Zero-Latency Hardware Engine', desc: 'evdev 60Hz+ normalized event bus & MIDI', icon: '⏱' },
          { label: 'Auto-Profilers Included', desc: 'CRKD NEO S & GP2040-CE / RP2040 Guitars', icon: '🎸' },
        ].map((badge, idx) => (
          <div key={idx} style={{
            backgroundColor: '#141424',
            border: '1px solid #222238',
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <span style={{ fontSize: '24px' }}>{badge.icon}</span>
            <div>
              <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>{badge.label}</div>
              <div style={{ color: '#71717a', fontSize: '11px', marginTop: '2px' }}>{badge.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Guide Navigation Tabs ── */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid #1f1f33',
        marginBottom: '24px',
      }}>
        {[
          { id: 'hardware', label: 'Hardware Blueprints & Visualizers' },
          { id: 'vdf', label: 'Steam Input VDF Architecture' },
          { id: 'diagnostics', label: 'Diagnostics & Latency Benchmarks' },
          { id: 'setup', label: 'Setup, Tailscale & Remote Pairing' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveGuideTab(tab.id as any)}
            style={{
              padding: '10px 18px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeGuideTab === tab.id ? '2px solid #e94560' : '2px solid transparent',
              color: activeGuideTab === tab.id ? '#fff' : '#888',
              fontSize: '13px',
              fontWeight: activeGuideTab === tab.id ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Guide Content Panels ── */}
      {activeGuideTab === 'hardware' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          {/* Card 1: CRKD Guitar */}
          <div style={{ backgroundColor: '#141422', border: '1px solid #24243a', borderRadius: '10px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#fff', fontWeight: 800 }}>CRKD NEO S Pro Guitar</h3>
              <span style={{ backgroundColor: '#2a1a24', color: '#e94560', fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>VID 0x2E95</span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12px', lineHeight: 1.5, margin: '0 0 12px 0' }}>
              Features Cherry MX mechanical frets, solo frets, dual-switch spring-return strum bar, whammy half-axis normalization, and accelerometer Star Power tilt thresholding. Auto-detected with one-click presets for Clone Hero, YARG, and RPCS3 Rock Band 4.
            </p>
            <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#00e5ff' }}>
              <span>✓ Auto-Profiled</span> • <span>✓ Whammy Arc</span> • <span>✓ 2ms Debounce</span>
            </div>
          </div>

          {/* Card 2: GP2040-CE / RP2040 */}
          <div style={{ backgroundColor: '#141422', border: '1px solid #24243a', borderRadius: '10px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#fff', fontWeight: 800 }}>GP2040-CE / RP2040 Riffstick</h3>
              <span style={{ backgroundColor: '#1a2838', color: '#00e5ff', fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>Raspberry Pi VID 0x2E8A</span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12px', lineHeight: 1.5, margin: '0 0 12px 0' }}>
              Open-source 3D-printed modular chassis (Riffstick, Polybar, PicoFret). Maps mechanical switch keys, clicky dual strum, rotary/potentiometer whammy gauge, and tilt switch with native XInput/Switch firmware compatibility.
            </p>
            <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#00e5ff' }}>
              <span>✓ RP2040 Probed</span> • <span>✓ Potentiometer Dial</span> • <span>✓ Clone Hero/YARG Ready</span>
            </div>
          </div>

          {/* Card 3: USB-MIDI Drums */}
          <div style={{ backgroundColor: '#141422', border: '1px solid #24243a', borderRadius: '10px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#fff', fontWeight: 800 }}>Electronic Drums & Synthesizers</h3>
              <span style={{ backgroundColor: '#26241a', color: '#f1c40f', fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>USB-MIDI / ALSA</span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12px', lineHeight: 1.5, margin: '0 0 12px 0' }}>
              Direct connection for Roland, Alesis, Yamaha, and Behringer drum kits. Streams MIDI note_on with velocity 1–127 onto the bus. Pads pulse visually proportional to strike force and map directly to gamepad or keyboard strokes.
            </p>
            <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#00e5ff' }}>
              <span>✓ Velocity Pulse</span> • <span>✓ GM Drum Note Map</span> • <span>✓ Double-Kick Support</span>
            </div>
          </div>

          {/* Card 4: Steam Deck Gamepad */}
          <div style={{ backgroundColor: '#141422', border: '1px solid #24243a', borderRadius: '10px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#fff', fontWeight: 800 }}>Steam Deck Neptune & Gamepads</h3>
              <span style={{ backgroundColor: '#1a2a1a', color: '#22c55e', fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>Neptune / XInput</span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12px', lineHeight: 1.5, margin: '0 0 12px 0' }}>
              Full 1280x800 visualizer displaying ABXY, D-pad, analog sticks with position dots, L2/R2 analog travel fill bars, rear grip switches L4/L5/R4/R5, dual capacitive trackpads, and 3D IMU gyro orientation wireframe.
            </p>
            <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#00e5ff' }}>
              <span>✓ Rear Grips</span> • <span>✓ Dual Trackpads</span> • <span>✓ 3D Gyro Indicator</span>
            </div>
          </div>
        </div>
      )}

      {activeGuideTab === 'vdf' && (
        <div style={{ backgroundColor: '#141422', border: '1px solid #24243a', borderRadius: '10px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#fff', fontWeight: 800 }}>
            Valve KeyValues (VDF) Compiler & Multi-Location Synchronization
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6, marginBottom: '18px' }}>
            SteamOS Gaming Mode indexes controller templates across several distinct directories depending on whether games are running offline, managed by Steam Cloud, or launched via Non-Steam shortcuts. DeckForge Input Studio performs synchronized, atomic writes across all three indexes so layouts appear immediately without rebooting Steam.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
            <div style={{ backgroundColor: '#10101c', padding: '14px', borderRadius: '8px', border: '1px solid #222238' }}>
              <div style={{ color: '#00e5ff', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>1. Common Configs</div>
              <div style={{ color: '#aaa', fontSize: '11px', fontFamily: 'monospace' }}>~/.local/share/Steam/steamapps/common/Steam Controller Configs/&lt;UID&gt;/config/</div>
            </div>
            <div style={{ backgroundColor: '#10101c', padding: '14px', borderRadius: '8px', border: '1px solid #222238' }}>
              <div style={{ color: '#f1c40f', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>2. Steam Cloud Remote</div>
              <div style={{ color: '#aaa', fontSize: '11px', fontFamily: 'monospace' }}>~/.local/share/Steam/userdata/&lt;UID&gt;/241100/remote/</div>
            </div>
            <div style={{ backgroundColor: '#10101c', padding: '14px', borderRadius: '8px', border: '1px solid #222238' }}>
              <div style={{ color: '#22c55e', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>3. Local Master Vault</div>
              <div style={{ color: '#aaa', fontSize: '11px', fontFamily: 'monospace' }}>~/.config/deckforge/templates/</div>
            </div>
          </div>

          <div style={{ backgroundColor: '#0d0d17', padding: '16px', borderRadius: '8px', border: '1px solid #1f1f33' }}>
            <div style={{ color: '#e94560', fontSize: '13px', fontWeight: 800, marginBottom: '6px' }}>
              Non-Steam Shortcut CRC32 Formula
            </div>
            <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.5 }}>
              Non-Steam shortcuts are identified by Steam Big Picture using a 64-bit ID computed from the executable path and app name:
              <pre style={{ margin: '8px 0 0 0', padding: '10px', backgroundColor: '#141422', borderRadius: '6px', color: '#38bdf8', fontSize: '12px' }}>
ID_32 = (crc32(exe + appname) | 0x80000000)
ID_64 = ((ID_32 &lt;&lt; 32) | 0x02000000)
              </pre>
            </div>
          </div>
        </div>
      )}

      {activeGuideTab === 'diagnostics' && (
        <div style={{ backgroundColor: '#141422', border: '1px solid #24243a', borderRadius: '10px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#fff', fontWeight: 800 }}>
            Hardware Diagnostics & Live Latency Benchmarking
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6, marginBottom: '20px' }}>
            DeckForge includes a hardware diagnostic suite running directly on the Linux input event subsystem:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div style={{ backgroundColor: '#10101c', padding: '16px', borderRadius: '8px', border: '1px solid #222238' }}>
              <h4 style={{ margin: '0 0 6px 0', color: '#38bdf8', fontSize: '14px' }}>Polling Frequency & Jitter</h4>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                Measures actual hardware sample rates in Hz and calculates standard deviation jitter to verify 250Hz, 500Hz, and 1000Hz polling consistency.
              </p>
            </div>
            <div style={{ backgroundColor: '#10101c', padding: '16px', borderRadius: '8px', border: '1px solid #222238' }}>
              <h4 style={{ margin: '0 0 6px 0', color: '#f43f5e', fontSize: '14px' }}>Mechanical Switch Bounce</h4>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                Records microsecond intervals between switch open/close events to dial in the perfect debounce filter for Cherry MX frets and strum bars.
              </p>
            </div>
            <div style={{ backgroundColor: '#10101c', padding: '16px', borderRadius: '8px', border: '1px solid #222238' }}>
              <h4 style={{ margin: '0 0 6px 0', color: '#22c55e', fontSize: '14px' }}>Stick Circularity Error</h4>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                Real-time polar coordinate scatter plot overlaying actual analog stick deflection against an ideal cardinal circle with error percentage.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeGuideTab === 'setup' && (
        <div style={{ backgroundColor: '#141422', border: '1px solid #24243a', borderRadius: '10px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#fff', fontWeight: 800 }}>
            Steam Deck Installation & Tailscale Remote Access
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6, marginBottom: '16px' }}>
            DeckForge Input Studio is self-contained in user space, respecting SteamOS read-only root constraints.
          </p>
          <div style={{ backgroundColor: '#0d0d17', padding: '14px', borderRadius: '8px', border: '1px solid #1f1f33', marginBottom: '16px' }}>
            <div style={{ color: '#00e5ff', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>One-Command Steam Deck Install</div>
            <pre style={{ margin: 0, color: '#e2e8f0', fontSize: '12px', fontFamily: 'monospace' }}>
cd ~/deckforge-input-studio && ./install.sh
            </pre>
          </div>
          <div style={{ backgroundColor: '#0d0d17', padding: '14px', borderRadius: '8px', border: '1px solid #1f1f33' }}>
            <div style={{ color: '#f1c40f', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Tailscale Remote Browser Studio</div>
            <p style={{ margin: '0 0 6px 0', color: '#aaa', fontSize: '12px' }}>
              Access the studio from any phone, tablet, or secondary PC on port 8765:
            </p>
            <code style={{ color: '#38bdf8', fontSize: '12px' }}>http://&lt;steamdeck-tailscale-ip&gt;:8765/</code>
          </div>
        </div>
      )}
    </div>
  );
};

export default LaunchPage;
