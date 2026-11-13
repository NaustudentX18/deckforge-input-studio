// ─────────────────────────────────────────────────────────────────────
// DeckForge Input Studio — TypeScript type definitions
// ─────────────────────────────────────────────────────────────────────

// ── Enums ────────────────────────────────────────────────────────────

/** Response-curve shape applied to an analog axis. */
export enum ResponseCurveType {
  Linear = "linear",
  Aggressive = "aggressive",
  Relaxed = "relaxed",
  CustomBezier = "custom_bezier",
}

/** Kind of output that a mapping binding targets. */
export enum OutputTargetType {
  Gamepad = "gamepad",
  Keyboard = "keyboard",
  Mouse = "mouse",
  System = "system",
}

/** How a physical press is interpreted before firing the bound action. */
export enum ActivatorType {
  RegularPress = "regular_press",
  LongPress = "long_press",
  DoublePress = "double_press",
  StartPress = "start_press",
  ReleasePress = "release_press",
  ChordedPress = "chorded_press",
}

/** Visual menu type overlaid on a touch surface. */
export enum VirtualMenuType {
  TouchMenu = "touch_menu",
  RadialMenu = "radial_menu",
}

// ── Core device types ────────────────────────────────────────────────

/** Capabilities reported by an input device. */
export interface DeviceCapabilities {
  /** Supported event types (e.g. EV_KEY, EV_ABS). */
  eventTypes: string[];
  /** Key / button codes the device can emit. */
  keys: number[];
  /** Absolute axis codes (e.g. ABS_X, ABS_Y). */
  axes: number[];
  /** Relative axis codes (e.g. REL_X). */
  relativeAxes: number[];
  /** Supported force-feedback effect types. */
  forceFeedback: string[];
  /** Whether the device supports rumble haptics. */
  hasRumble: boolean;
  /** Whether the device has a gyroscope / IMU. */
  hasGyro: boolean;
  /** Whether the device has a touchpad surface. */
  hasTouchpad: boolean;
}

/** A single input device detected on the system. */
export interface InputDevice {
  /** Kernel device path, e.g. "/dev/input/event5". */
  path: string;
  /** Human-readable name reported by the driver. */
  name: string;
  /** USB or Bluetooth vendor ID. */
  vendorId: number;
  /** USB or Bluetooth product ID. */
  productId: number;
  /** Physical connection bus ("usb" | "bluetooth" | "hid" | "virtual"). */
  busType: string;
  /** Unique identifier (phys + uniq combined). */
  uniqueId: string;
  /** Device capabilities. */
  capabilities: DeviceCapabilities;
  /** Whether the device is currently grabbed exclusively. */
  grabbed: boolean;
}

/** A single input event read from a device. */
export interface InputEvent {
  /** Event timestamp in fractional seconds since boot. */
  timestamp: number;
  /** Event type string, e.g. "EV_KEY". */
  type: string;
  /** Event code, e.g. 304 (BTN_SOUTH). */
  code: number;
  /** Event value (0 = release, 1 = press, or axis value). */
  value: number;
  /** Human-readable code label, e.g. "BTN_SOUTH". */
  codeLabel: string;
  /** Device path that produced this event. */
  devicePath: string;
}

// ── Calibration ──────────────────────────────────────────────────────

/** Dead-zone configuration for a single analog axis. */
export interface DeadzoneConfig {
  /** Inner dead-zone radius (0.0 – 1.0). */
  inner: number;
  /** Outer dead-zone radius (0.0 – 1.0). */
  outer: number;
  /** Shape: "circle", "square", or "cross". */
  shape: string;
}

/** A response curve definition. */
export interface ResponseCurve {
  /** Curve type. */
  type: ResponseCurveType;
  /** Bezier control points when type is CustomBezier, else empty. */
  controlPoints: [number, number][];
  /** Optional exponent for Aggressive / Relaxed presets. */
  exponent: number;
}

/** Full calibration settings for a single axis. */
export interface AxisCalibration {
  /** Axis code (e.g. ABS_X). */
  axis: string;
  /** Minimum raw value reported by the hardware. */
  rawMin: number;
  /** Maximum raw value reported by the hardware. */
  rawMax: number;
  /** Centre / neutral raw value. */
  rawCenter: number;
  /** Dead-zone configuration. */
  deadzone: DeadzoneConfig;
  /** Response curve. */
  responseCurve: ResponseCurve;
  /** Whether to invert the axis. */
  inverted: boolean;
  /** Anti-deadzone push (0.0 – 1.0). */
  antiDeadzone: number;
}

// ── Mapping & bindings ───────────────────────────────────────────────

/** Where a mapping binding sends its output. */
export interface OutputTarget {
  /** Target category. */
  type: OutputTargetType;
  /** Target code — e.g. "BTN_SOUTH", "KEY_A", "REL_X", "volume_up". */
  code: string;
}

/** Configures how a press is turned into an activation. */
export interface BindingActivator {
  /** Activator kind. */
  type: ActivatorType;
  /** Hold duration in ms (for LongPress). */
  holdDurationMs: number;
  /** Double-press window in ms (for DoublePress). */
  doublePressWindowMs: number;
  /** Required chord partner source code (for ChordedPress). */
  chordSourceCode: string;
  /** Fire interval in ms for continuous activation; 0 = single fire. */
  fireIntervalMs: number;
  /** Whether haptic feedback is triggered on activation. */
  hapticFeedback: boolean;
}

/** A single mapping from a physical input to an output with an activator. */
export interface MappingBinding {
  /** Unique ID for this binding. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Source input code (e.g. "BTN_SOUTH", "ABS_X"). */
  sourceCode: string;
  /** Where the input is sent. */
  output: OutputTarget;
  /** How the press is interpreted. */
  activator: BindingActivator;
  /** Optional icon key for UI display. */
  icon: string;
  /** Whether this binding is currently enabled. */
  enabled: boolean;
}

// ── Action sets & layers ─────────────────────────────────────────────

/** A discrete action set (like Steam Input action sets). */
export interface ActionSet {
  /** Unique ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Bindings active in this set. */
  bindings: MappingBinding[];
  /** Layers that can be toggled on top of this set. */
  layers: ActionSetLayer[];
}

/** An action-set layer that overrides specific bindings. */
export interface ActionSetLayer {
  /** Unique ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Binding overrides in this layer. */
  bindings: MappingBinding[];
  /** Whether the layer is currently active. */
  active: boolean;
}

// ── Virtual menus ────────────────────────────────────────────────────

/** A single slice in a virtual menu (touch or radial). */
export interface MenuSlice {
  /** Unique ID. */
  id: string;
  /** Display label. */
  label: string;
  /** Icon key or emoji. */
  icon: string;
  /** Binding executed when this slice is selected. */
  binding: MappingBinding;
  /** Fill colour (hex). */
  color: string;
}

/** A virtual menu shown on a touch surface. */
export interface VirtualMenu {
  /** Unique ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Menu style. */
  type: VirtualMenuType;
  /** Slices / segments in the menu. */
  slices: MenuSlice[];
  /** Radius in pixels (radial) or grid size (touch). */
  size: number;
  /** Opacity (0.0 – 1.0). */
  opacity: number;
}

// ── Macros ───────────────────────────────────────────────────────────

/** A single step inside a macro sequence. */
export interface MacroStep {
  /** Output to fire. */
  output: OutputTarget;
  /** Press (true) or release (false). */
  press: boolean;
  /** Delay after this step in ms. */
  delayMs: number;
}

/** A recorded / authored macro sequence. */
export interface MacroSequence {
  /** Unique ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Ordered steps. */
  steps: MacroStep[];
  /** Whether the macro loops until cancelled. */
  loop: boolean;
  /** Optional inter-loop delay in ms. */
  loopDelayMs: number;
}

// ── Turbo ────────────────────────────────────────────────────────────

/** Turbo (rapid-fire) configuration for a binding. */
export interface TurboConfig {
  /** Whether turbo is enabled. */
  enabled: boolean;
  /** Presses per second. */
  rate: number;
  /** Delay before turbo engages in ms. */
  startDelayMs: number;
  /** Duty cycle (fraction of period held, 0.0 – 1.0). */
  dutyCycle: number;
}

// ── Hardware blueprints ──────────────────────────────────────────────

/** A single element in a hardware blueprint SVG layout. */
export interface BlueprintElement {
  /** Element ID matching the SVG node. */
  id: string;
  /** Element type: "button" | "axis" | "dpad" | "touchpad" | "trigger" | "bumper" | "stick". */
  type: string;
  /** Associated input code (e.g. "BTN_SOUTH", "ABS_X"). */
  inputCode: string;
  /** X position (percent of viewport). */
  x: number;
  /** Y position (percent of viewport). */
  y: number;
  /** Element width (percent of viewport). */
  width: number;
  /** Element height (percent of viewport). */
  height: number;
  /** Display label. */
  label: string;
}

/** A visual hardware blueprint describing a controller's physical layout. */
export interface HardwareBlueprint {
  /** Unique ID. */
  id: string;
  /** Display name, e.g. "Steam Deck". */
  name: string;
  /** Path to SVG asset. */
  svgPath: string;
  /** Natural width of the SVG viewport. */
  viewportWidth: number;
  /** Natural height of the SVG viewport. */
  viewportHeight: number;
  /** Interactive elements laid out on the blueprint. */
  elements: BlueprintElement[];
  /** Vendor ID this blueprint matches (0 = generic). */
  vendorId: number;
  /** Product ID this blueprint matches (0 = generic). */
  productId: number;
}

// ── VDF templates ────────────────────────────────────────────────────

/** Metadata about a saved VDF template. */
export interface TemplateMetadata {
  /** Template file name (without extension). */
  name: string;
  /** Human-readable title. */
  title: string;
  /** Description. */
  description: string;
  /** Original author. */
  author: string;
  /** ISO-8601 creation date. */
  createdAt: string;
  /** ISO-8601 last-modified date. */
  updatedAt: string;
  /** Semantic version of the template format. */
  version: string;
  /** Device blueprint ID this template targets. */
  deviceBlueprintId: string;
  /** Tags for categorisation. */
  tags: string[];
}

/** A complete VDF input configuration template. */
export interface VDFTemplate {
  /** Template metadata. */
  metadata: TemplateMetadata;
  /** Action sets defined in this template. */
  actionSets: ActionSet[];
  /** Virtual menus attached to this template. */
  virtualMenus: VirtualMenu[];
  /** Macro sequences embedded in this template. */
  macros: MacroSequence[];
  /** Per-axis calibration overrides. */
  axisCalibrations: AxisCalibration[];
  /** Turbo configurations keyed by binding ID. */
  turboConfigs: Record<string, TurboConfig>;
}

// ── Steam integration ────────────────────────────────────────────────

/** A Steam game installed on the device. */
export interface SteamGame {
  /** Steam application ID. */
  appId: number;
  /** Game title. */
  name: string;
  /** Absolute path to the game's install directory. */
  installDir: string;
  /** Path to the header image (library capsule). */
  headerImage: string;
  /** Currently assigned template name, or empty string. */
  assignedTemplate: string;
  /** Last launch time as a Unix timestamp. */
  lastPlayed: number;
}

// ── Diagnostics ──────────────────────────────────────────────────────

/** Result of a single latency measurement. */
export interface LatencyResult {
  /** Round-trip time in microseconds. */
  roundTripUs: number;
  /** Input-to-event latency in microseconds. */
  inputLatencyUs: number;
  /** Jitter (standard deviation) in microseconds. */
  jitterUs: number;
  /** ISO-8601 timestamp of the measurement. */
  measuredAt: string;
}

/** Result of a polling-rate test. */
export interface PollingRateResult {
  /** Measured polling rate in Hz. */
  measuredHz: number;
  /** Nominal / advertised polling rate in Hz. */
  nominalHz: number;
  /** Stability percentage (0 – 100). */
  stabilityPercent: number;
  /** Number of samples collected. */
  sampleCount: number;
  /** ISO-8601 timestamp of the measurement. */
  measuredAt: string;
}

/** Aggregated diagnostic data for a device. */
export interface DiagnosticData {
  /** Device path measured. */
  devicePath: string;
  /** Latency results (history). */
  latencyHistory: LatencyResult[];
  /** Polling-rate results (history). */
  pollingRateHistory: PollingRateResult[];
  /** Number of events processed since monitoring started. */
  totalEvents: number;
  /** Number of dropped / missed events. */
  droppedEvents: number;
  /** CPU usage percentage attributed to the input stack. */
  cpuUsagePercent: number;
}

// ── Presets ──────────────────────────────────────────────────────────

/** A reusable device-configuration preset. */
export interface PresetConfig {
  /** Unique ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Description of what this preset does. */
  description: string;
  /** Target device vendor ID (0 = any). */
  vendorId: number;
  /** Target device product ID (0 = any). */
  productId: number;
  /** Calibrations to apply. */
  axisCalibrations: AxisCalibration[];
  /** Bindings to apply. */
  bindings: MappingBinding[];
  /** Author. */
  author: string;
  /** ISO-8601 creation date. */
  createdAt: string;
  /** Tags for categorisation. */
  tags: string[];
}

// ── CRKD Guitar profile ─────────────────────────────────────────────

/** Profile specific to CRKD NEO S guitar-style controllers. */
export interface CRKDGuitarProfile {
  /** Profile ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Tilt sensitivity (0.0 – 1.0). */
  tiltSensitivity: number;
  /** Whammy-bar axis calibration. */
  whammyCalibration: AxisCalibration;
  /** Strum-bar dead-zone threshold (raw). */
  strumDeadzone: number;
  /** Fret-button colour mapping (fret index → hex colour). */
  fretColors: Record<number, string>;
  /** Star-power activation binding. */
  starPowerBinding: MappingBinding;
  /** Whether tilt-to-star-power is enabled. */
  tiltStarPower: boolean;
}

// ── WebSocket messages ──────────────────────────────────────────────

/** A message exchanged over the diagnostics / live-event WebSocket. */
export interface WebSocketMessage {
  /** Message type discriminator. */
  type:
    | "device_connected"
    | "device_disconnected"
    | "input_event"
    | "latency_update"
    | "polling_rate_update"
    | "calibration_progress"
    | "error";
  /** Arbitrary JSON payload. */
  payload: Record<string, unknown>;
  /** Server-side timestamp (ISO-8601). */
  timestamp: string;
  /** Sequence number for ordering. */
  seq: number;
  /** Device path this message relates to, if any. */
  devicePath: string;
}
