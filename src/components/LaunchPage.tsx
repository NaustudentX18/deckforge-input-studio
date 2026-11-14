import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import {
  AlertIcon,
  ArrowRightIcon,
  BoltIcon,
  CheckIcon,
  DialIcon,
  DrumsIcon,
  GamepadIcon,
  GuitarIcon,
  InfoIcon,
  PlugIcon,
  SwitchIcon,
} from './icons';

interface LaunchPageProps {
  onLaunchStudio: () => void;
  activeDeviceName?: string;
  connectionState: string;
}

interface ProfileEntry {
  profile_id: string;
  family_id: string;
  family_name?: string;
  game: string;
  title: string;
  description: string;
  required_mode: number;
  required_mode_name?: string | null;
  requires_xbox_licence: boolean;
  setup_notes: string[];
  binding_count: number;
}

interface ModeEntry {
  position: number;
  name: string;
  description: string;
  presents_as: string;
  intended_for: string;
  programmable: boolean;
}

interface FamilyEntry {
  family_id: string;
  display_name: string;
  kind: string;
  source: string;
  vendor_ids: string[];
  product_ids: string[];
  setup_notes: string[];
  modes: ModeEntry[];
}

interface DetectionEntry {
  name: string;
  kind: string;
  vendor_id: string;
  product_id: string;
  family_name?: string | null;
  kind_reason: string;
  reserved: boolean;
}

type TabId = 'profiles' | 'hardware' | 'games' | 'setup' | 'reference';

const TABS: { id: TabId; label: string }[] = [
  { id: 'profiles', label: 'Profiles' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'games', label: 'Games' },
  { id: 'setup', label: 'Setup' },
  { id: 'reference', label: 'Refs' },
];

/* ------------------------------------------------------------------ *
 * Copy-to-clipboard, used by the code blocks.
 * ------------------------------------------------------------------ */
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is unavailable over plain HTTP on some browsers; the text is
      // selectable either way, so failing silently is acceptable here.
    }
  };
  return (
    <button className="df-code__copy" onClick={copy} aria-label="Copy to clipboard">
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};

const CodeBlock: React.FC<{ children: string }> = ({ children }) => (
  <code className="df-code">
    <CopyButton text={children} />
    {children}
  </code>
);

/* ------------------------------------------------------------------ *
 * One-click profile card.
 * ------------------------------------------------------------------ */
const ProfileCard: React.FC<{
  profile: ProfileEntry;
  busy: boolean;
  disabled: boolean;
  onApply: (id: string) => void;
}> = ({ profile, busy, disabled, onApply }) => (
  <article className="df-profile">
    <div className="df-profile__head">
      <h3 className="df-profile__title">{profile.title}</h3>
      <span className="df-badge df-badge--info" title={`Mode Dial position ${profile.required_mode}`}>
        Mode {profile.required_mode}
      </span>
    </div>

    <p className="df-sm df-clamp-2">{profile.description}</p>

    {profile.required_mode_name && (
      <div className="df-xs">
        Dial: <strong style={{ color: 'var(--text-muted)' }}>{profile.required_mode_name}</strong>
      </div>
    )}

    {profile.requires_xbox_licence && (
      <div className="df-notice df-notice--warning" style={{ padding: '8px 10px', fontSize: 'var(--fs-xs)' }}>
        <AlertIcon size={14} />
        <span>Needs the Xbox-licensed guitar.</span>
      </div>
    )}

    {profile.setup_notes.length > 0 && (
      <ul className="df-profile__notes">
        {profile.setup_notes.map((note) => (
          <li className="df-profile__note" key={note}>{note}</li>
        ))}
      </ul>
    )}

    <div className="df-profile__foot">
      <span className="df-xs">{profile.binding_count} bindings</span>
      <button
        className="df-btn df-btn--primary df-btn--sm"
        disabled={disabled}
        onClick={() => onApply(profile.profile_id)}
      >
        {busy ? 'Applying…' : 'Apply & sync'}
      </button>
    </div>
  </article>
);

/* ------------------------------------------------------------------ *
 * Mode dial reference table.
 * ------------------------------------------------------------------ */
const ModeTable: React.FC<{ modes: ModeEntry[] }> = ({ modes }) => (
  <div className="df-modes">
    {modes.map((mode) => {
      const kind = mode.presents_as === 'keyboard'
        ? ' df-mode--key'
        : /festival/i.test(mode.name) ? ' df-mode--festival' : '';
      return (
        <div className={`df-mode${kind}`} key={mode.position}>
          <span className="df-mode__pos">{mode.position}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>
              {mode.name}
            </div>
            <div className="df-xs" style={{ marginTop: 2 }}>
              {mode.intended_for || (mode.programmable ? 'User slot (CRKD CTRL)' : '—')}
            </div>
          </div>
          <div className="df-xs" style={{ gridColumn: 'span 1' }}>
            <span className={`df-badge ${mode.presents_as === 'keyboard' ? 'df-badge--warning' : 'df-badge--neutral'}`}>
              {mode.presents_as}
            </span>
          </div>
        </div>
      );
    })}
  </div>
);

/* ================================================================== */
export const LaunchPage: React.FC<LaunchPageProps> = ({
  onLaunchStudio,
  activeDeviceName,
  connectionState,
}) => {
  const [tab, setTab] = useState<TabId>('profiles');
  const [profiles, setProfiles] = useState<ProfileEntry[] | null>(null);
  const [families, setFamilies] = useState<FamilyEntry[]>([]);
  const [detected, setDetected] = useState<DetectionEntry | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: 'success' | 'danger' } | null>(null);

  // Load the catalog and current hardware once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profRes, famRes, detectRes] = await Promise.all([
          apiFetch('/api/catalog/profiles'),
          apiFetch('/api/catalog/devices'),
          apiFetch('/api/auto/detect'),
        ]);
        if (cancelled) return;
        if (profRes.ok) {
          const data = await profRes.json();
          setProfiles(Array.isArray(data?.profiles) ? data.profiles : []);
        } else {
          setProfiles([]);
        }
        if (famRes.ok) {
          const data = await famRes.json();
          setFamilies(Array.isArray(data) ? data : []);
        }
        if (detectRes.ok) {
          const data = await detectRes.json();
          setDetected(data?.best ?? null);
        }
      } catch {
        if (!cancelled) setProfiles([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const applyProfile = useCallback(async (profileId: string) => {
    setApplying(profileId);
    setMessage(null);
    try {
      const res = await apiFetch('/api/catalog/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: data?.detail || `Could not apply profile (${res.status})`, kind: 'danger' });
        return;
      }
      const applied = data?.applied?.length ?? 0;
      const skipped = data?.skipped?.length ?? 0;
      const mode = data?.hardware_setup?.mode_position;
      const modeName = data?.hardware_setup?.mode_name;
      setMessage({
        kind: 'success',
        text:
          `Saved “${data?.title ?? profileId}” — ${applied} controls bound` +
          (skipped ? `, ${skipped} not expressible` : '') +
          (mode ? `. Set the Mode Dial to ${mode}${modeName ? ` (${modeName})` : ''}.` : ''),
      });
    } catch (err) {
      setMessage({ text: String(err), kind: 'danger' });
    } finally {
      setApplying(null);
    }
  }, []);

  const guitar = families[0];
  const online = connectionState === 'connected';

  return (
    <div className="df-page df-scroll">
      <div className="df-container">
        {/* ---------------- Hero ---------------- */}
        <header className="df-hero">
          <div className="df-hero__brand">
            <div className="df-hero__logo" aria-hidden>
              <svg viewBox="0 0 40 40" width="26" height="26">
                <path d="M8 12 L20 6 L32 12 L32 28 L20 34 L8 28 Z" fill="none" stroke="#fff" strokeWidth="2.2" />
                <circle cx="16" cy="18" r="2.4" fill="#fff" />
                <circle cx="24" cy="18" r="2.4" fill="#fff" opacity="0.75" />
                <circle cx="20" cy="24" r="2.8" fill="#fff" opacity="0.9" />
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="df-hero__title-row">
                <h1 className="df-display">DeckForge</h1>
                <span className="df-badge df-badge--neutral">v0.1.0</span>
              </div>
              <p className="df-sm" style={{ marginTop: 2 }}>
                Hardware mapper &amp; Steam Input compiler for the Steam Deck
              </p>
            </div>
          </div>

          <div className="df-hero__meta">
            <div className="df-hero__status">
              <span className={`df-dot ${online ? 'df-dot--live' : 'df-dot--idle'}`} aria-hidden />
              <span>
                {detected
                  ? 'Hardware detected'
                  : online ? 'Streaming input' : 'No controller'}
              </span>
            </div>
            <button className="df-btn df-btn--primary df-launch" onClick={onLaunchStudio}>
              Open Studio
              <ArrowRightIcon size={16} />
            </button>
          </div>
        </header>

        {/* ---------------- Detected hardware ---------------- */}
        <div className={`df-device ${detected ? 'df-device--found' : 'df-device--none'}`}>
          {detected ? <GuitarIcon size={22} /> : <PlugIcon size={22} />}
          <div className="df-device__body">
            {detected ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>
                  {detected.family_name || detected.name}
                </div>
                <div className="df-xs" style={{ marginTop: 2 }}>
                  {detected.vendor_id}:{detected.product_id} · detected as {detected.kind}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>
                  No controllable device detected
                </div>
                <div className="df-xs" style={{ marginTop: 2 }}>
                  Plug in a guitar, pad, fightstick or drum kit — or open the Studio and press Auto-Profile.
                </div>
              </>
            )}
          </div>
          <button className="df-btn df-btn--sm" onClick={onLaunchStudio}>
            {detected ? 'Auto-profile' : 'Open Studio'}
          </button>
        </div>

        {/* ---------------- Tabs ---------------- */}
        <nav className="df-tabs" role="tablist" aria-label="Documentation sections">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              className="df-tab"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        {/* ---------------- Feedback ---------------- */}
        {message && (
          <div className={`df-notice df-notice--${message.kind}`} role="status" style={{ marginBottom: 'var(--sp-4)' }}>
            {message.kind === 'success' ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* ================= One-click profiles ================= */}
        {tab === 'profiles' && (
          <section>
            {/* Real captures of the running app, so the page shows rather than
                claims what it does. */}
            <div className="df-section-head">
              <h2 className="df-h2">What it looks like</h2>
              <span className="df-xs">Captured from this build</span>
            </div>
            <div className="df-showcase" style={{ marginBottom: 'var(--sp-6)' }}>
              <figure className="df-shot">
                <img src="/static/shots/landing-profiles.jpg" alt="One-click profile cards for Clone Hero, YARG, Fortnite Festival and Rock Band 4, each showing the required Mode Dial position" loading="lazy" width="1280" height="900" />
                <figcaption>One-click profiles, each with its required dial position</figcaption>
              </figure>
              <figure className="df-shot">
                <img src="/static/shots/landing-hardware.jpg" alt="Hardware page listing the CRKD Les Paul Pro specifications and the nine-position Mode Dial reference" loading="lazy" width="1280" height="900" />
                <figcaption>The Mode Dial reference — what each position presents</figcaption>
              </figure>
              <figure className="df-shot df-shot--phone">
                <img src="/static/shots/landing-mobile.jpg" alt="The same page on a phone, showing the mobile layout with bottom-sized tabs and stacked profile cards" loading="lazy" width="390" height="844" />
                <figcaption>Mobile layout, mobile-first</figcaption>
              </figure>
            </div>

            <div className="df-section-head">
              <h2 className="df-h2">One-click profiles</h2>
              <span className="df-xs">Each states the Mode Dial position it needs</span>
            </div>

            {profiles === null ? (
              <div className="df-grid df-grid--cards">
                <div className="df-skeleton" />
                <div className="df-skeleton" />
                <div className="df-skeleton" />
              </div>
            ) : profiles.length === 0 ? (
              <div className="df-empty">
                <GamepadIcon size={26} />
                <span>The profile catalog could not be loaded. Open the Studio and press Auto-Profile instead.</span>
                <button className="df-btn df-btn--primary df-btn--sm" onClick={onLaunchStudio}>
                  Open Studio
                </button>
              </div>
            ) : (
              <div className="df-grid df-grid--cards">
                {profiles.map((profile) => (
                  <ProfileCard
                    key={profile.profile_id}
                    profile={profile}
                    busy={applying === profile.profile_id}
                    disabled={applying !== null}
                    onApply={applyProfile}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ================= Hardware ================= */}
        {tab === 'hardware' && (
          <section className="df-col" style={{ gap: 'var(--sp-4)' }}>
            <div className="df-card">
              <div className="df-section-head">
                <h2 className="df-h2">{guitar?.display_name ?? 'CRKD Gibson Les Paul Pro Edition'}</h2>
                <span className="df-badge df-badge--guitar">Flagship support</span>
              </div>
              <p className="df-sm" style={{ marginBottom: 'var(--sp-3)' }}>
                Officially licensed Gibson Les Paul with mechanical fret buttons and a Hall Effect
                strum bar with adjustable travel and haptic feedback. Eight-button navigation hub,
                two Hall Effect sticks, tilt sensor for star power, headstock d-pad, 3.5&nbsp;mm audio
                jack, RGB fret neck, and wired / 2.4&nbsp;GHz / Bluetooth.
              </p>
              <div className="df-grid df-grid--stats" style={{ marginBottom: 'var(--sp-3)' }}>
                <div className="df-stat">
                  <span className="df-stat__icon"><DialIcon size={18} /></span>
                  <div>
                    <div className="df-stat__label">Mode Dial</div>
                    <div className="df-stat__value">9 positions, 4 programmable</div>
                  </div>
                </div>
                <div className="df-stat">
                  <span className="df-stat__icon"><SwitchIcon size={18} /></span>
                  <div>
                    <div className="df-stat__label">Platform Slider</div>
                    <div className="df-stat__value">PC · NS · AN · P3</div>
                  </div>
                </div>
                <div className="df-stat">
                  <span className="df-stat__icon"><GuitarIcon size={18} /></span>
                  <div>
                    <div className="df-stat__label">Frets</div>
                    <div className="df-stat__value">Mechanical, RGB-lit neck</div>
                  </div>
                </div>
                <div className="df-stat">
                  <span className="df-stat__icon"><BoltIcon size={18} /></span>
                  <div>
                    <div className="df-stat__label">Strum</div>
                    <div className="df-stat__value">Hall Effect + haptics</div>
                  </div>
                </div>
              </div>

              <div className="df-notice df-notice--info">
                <InfoIcon size={16} />
                <span>
                  The dial changes what the host sees. Position 9 is <strong>KEYJAM</strong> on PC —
                  the guitar enumerates as a keyboard, so gamepad profiles do not apply there.
                </span>
              </div>
            </div>

            <div>
              <div className="df-section-head">
                <h3 className="df-h3">Mode Dial reference</h3>
                <span className="df-xs">What each position presents to the computer</span>
              </div>
              <ModeTable modes={guitar?.modes ?? []} />
            </div>

            {guitar?.setup_notes && guitar.setup_notes.length > 0 && (
              <div className="df-card">
                <h3 className="df-h3" style={{ marginBottom: 'var(--sp-3)' }}>Hardware setup</h3>
                <ol className="df-steps">
                  {guitar.setup_notes.map((note) => (
                    <li className="df-step" key={note}>{note}</li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        )}

        {/* ================= Games ================= */}
        {tab === 'games' && (
          <section className="df-col" style={{ gap: 'var(--sp-4)' }}>
            <div className="df-card">
              <div className="df-section-head">
                <h2 className="df-h2">Game compatibility</h2>
                <span className="df-xs">Per CRKD's published chart</span>
              </div>
              <div className="df-table-scroll">
              <table className="df-matrix">
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th>Fortnite Festival</th>
                    <th>Clone Hero</th>
                    <th>YARG</th>
                    <th>Rock Band 4</th>
                    <th>Legacy GH/RB</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Steam Deck / PC</strong></td>
                    <td className="df-partial">Mode 2+</td>
                    <td className="df-yes">Yes</td>
                    <td className="df-yes">Yes</td>
                    <td className="df-no">—</td>
                    <td className="df-partial">P3 + emulator</td>
                  </tr>
                  <tr>
                    <td><strong>Xbox Series X|S / One</strong></td>
                    <td className="df-partial">Mode 2+</td>
                    <td className="df-no">—</td>
                    <td className="df-no">—</td>
                    <td className="df-yes">Xbox model</td>
                    <td className="df-no">—</td>
                  </tr>
                  <tr>
                    <td><strong>Android / Smart TV</strong></td>
                    <td className="df-yes">Yes</td>
                    <td className="df-no">—</td>
                    <td className="df-no">—</td>
                    <td className="df-no">—</td>
                    <td className="df-no">—</td>
                  </tr>
                  <tr>
                    <td><strong>KeyJam mode</strong></td>
                    <td className="df-yes">Yes</td>
                    <td className="df-partial">Key mapping</td>
                    <td className="df-partial">Key mapping</td>
                    <td className="df-no">—</td>
                    <td className="df-no">—</td>
                  </tr>
                </tbody>
              </table>
              </div>
              <p className="df-xs" style={{ marginTop: 'var(--sp-2)' }}>
                Scroll the table sideways for more platforms.
              </p>
            </div>

            <div className="df-notice df-notice--warning">
              <AlertIcon size={16} />
              <span>
                Fortnite Festival Pro mode needs the dial on <strong>2</strong>. On position 1 the
                CTRL button reports as Select, which opens a menu, and the game will not let you
                rebind it.
              </span>
            </div>
          </section>
        )}

        {/* ================= Setup ================= */}
        {tab === 'setup' && (
          <section className="df-col" style={{ gap: 'var(--sp-4)' }}>
            <div className="df-card">
              <h2 className="df-h2" style={{ marginBottom: 'var(--sp-3)' }}>Connect the guitar</h2>
              <ol className="df-steps">
                <li className="df-step">
                  <strong>Set the Platform Slider to PC</strong> for Steam Deck and desktop use.
                </li>
                <li className="df-step">
                  <strong>Wired is lowest latency.</strong> Plug USB-C in, or use the bundled
                  2.4&nbsp;GHz dongle. Bluetooth works but adds latency.
                </li>
                <li className="df-step">
                  <strong>Power on with the CRKD button</strong>, then turn the Mode Dial to 1
                  for Clone Hero / YARG.
                </li>
                <li className="df-step">
                  <strong>Open the Studio and press ⚡ Auto-Profile</strong> — or apply a
                  one-click profile from the first tab.
                </li>
                <li className="df-step">
                  <strong>Assign it to the game</strong> in Profiles, then launch.
                </li>
              </ol>
            </div>

            <div className="df-card">
              <h3 className="df-h3" style={{ marginBottom: 'var(--sp-2)' }}>Install on your phone</h3>
              <p className="df-sm" style={{ marginBottom: 'var(--sp-3)' }}>
                Installation needs a secure context. A plain LAN address will not offer it — the
                browser hides the service worker entirely.
              </p>
              <CodeBlock>{`sudo /opt/tailscale/tailscale serve --bg --https=443 http://127.0.0.1:8765`}</CodeBlock>
              <p className="df-xs" style={{ marginTop: 'var(--sp-2)' }}>
                Then open the tailnet HTTPS URL and choose “Add to Home screen”.
              </p>
            </div>

            <div className="df-card">
              <h3 className="df-h3" style={{ marginBottom: 'var(--sp-2)' }}>Where profiles are written</h3>
              <CodeBlock>{`~/.local/share/Steam/controller_base/templates/`}</CodeBlock>
              <p className="df-xs" style={{ marginTop: 'var(--sp-2)' }}>
                Steam reads templates from here. The per-game binding lives in a
                <span className="df-mono"> configset_*.vdf</span> that references the template by name.
              </p>
            </div>
          </section>
        )}

        {/* ================= Reference ================= */}
        {tab === 'reference' && (
          <section className="df-col" style={{ gap: 'var(--sp-4)' }}>
            <div className="df-card">
              <h2 className="df-h2" style={{ marginBottom: 'var(--sp-2)' }}>Why identity is hard</h2>
              <p className="df-sm">
                The mainstream databases do not know this hardware. Checked against upstream SDL:
                the CRKD Les Paul Pro is classified as a plain <strong>PS3 controller</strong>, and
                the game-controller mapping DB contains <strong>no guitar entries at all</strong>.
                DeckForge therefore identifies devices by the inputs they physically report, then
                falls back to a vendored identity table of 613 controllers.
              </p>
            </div>

            <div className="df-card">
              <h3 className="df-h3" style={{ marginBottom: 'var(--sp-2)' }}>Non-Steam shortcut ID</h3>
              <CodeBlock>{`ID_32 = (crc32(exe + appname) | 0x80000000)\nID_64 = ((ID_32 << 32) | 0x02000000)`}</CodeBlock>
            </div>

            <div className="df-card">
              <h3 className="df-h3" style={{ marginBottom: 'var(--sp-2)' }}>Useful hardware shortcuts</h3>
              <div className="df-table-scroll">
              <table className="df-matrix" style={{ minWidth: 'auto' }}>
                <tbody>
                  <tr><td>Strum travel</td><td>Hold <strong>L3</strong> 6s, then strum up/down</td></tr>
                  <tr><td>Strum haptics</td><td>Hold <strong>R3</strong> 6s, then strum up/down</td></tr>
                  <tr><td>Tilt on/off</td><td>Hold <strong>View</strong> 6s</td></tr>
                  <tr><td>D-pad on/off</td><td>Hold <strong>Capture + R3</strong> 6s</td></tr>
                  <tr><td>RGB brightness</td><td>Hold <strong>Capture</strong> 6s, strum up/down</td></tr>
                  <tr><td>Factory reset</td><td>Hold <strong>Menu</strong> 6s until LED 1 pulses purple</td></tr>
                </tbody>
              </table>
              </div>
            </div>
          </section>
        )}

        <footer className="df-xs" style={{ marginTop: 'var(--sp-8)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--border-subtle)' }}>
          DeckForge Input Studio · hardware facts sourced from CRKD's product page, CK25GM user
          guide and firmware v2.0 notes.
        </footer>
      </div>
    </div>
  );
};

export default LaunchPage;
