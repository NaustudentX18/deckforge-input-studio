// Mapping Logic Utilities — Steam Input binding builder, presets, constants

// ─── Keyboard Key Codes & Display Names ─────────────────────────────

export const KEYBOARD_KEYS: Record<string, string> = {
  // Letters
  KEY_A: 'A', KEY_B: 'B', KEY_C: 'C', KEY_D: 'D', KEY_E: 'E', KEY_F: 'F',
  KEY_G: 'G', KEY_H: 'H', KEY_I: 'I', KEY_J: 'J', KEY_K: 'K', KEY_L: 'L',
  KEY_M: 'M', KEY_N: 'N', KEY_O: 'O', KEY_P: 'P', KEY_Q: 'Q', KEY_R: 'R',
  KEY_S: 'S', KEY_T: 'T', KEY_U: 'U', KEY_V: 'V', KEY_W: 'W', KEY_X: 'X',
  KEY_Y: 'Y', KEY_Z: 'Z',
  // Numbers
  KEY_1: '1', KEY_2: '2', KEY_3: '3', KEY_4: '4', KEY_5: '5',
  KEY_6: '6', KEY_7: '7', KEY_8: '8', KEY_9: '9', KEY_0: '0',
  // Function Keys
  KEY_F1: 'F1', KEY_F2: 'F2', KEY_F3: 'F3', KEY_F4: 'F4', KEY_F5: 'F5',
  KEY_F6: 'F6', KEY_F7: 'F7', KEY_F8: 'F8', KEY_F9: 'F9', KEY_F10: 'F10',
  KEY_F11: 'F11', KEY_F12: 'F12',
  // Modifiers
  KEY_LEFTSHIFT: 'Left Shift', KEY_RIGHTSHIFT: 'Right Shift',
  KEY_LEFTCTRL: 'Left Ctrl', KEY_RIGHTCTRL: 'Right Ctrl',
  KEY_LEFTALT: 'Left Alt', KEY_RIGHTALT: 'Right Alt',
  KEY_LEFTMETA: 'Left Meta', KEY_RIGHTMETA: 'Right Meta',
  // Navigation
  KEY_UP: '↑', KEY_DOWN: '↓', KEY_LEFT: '←', KEY_RIGHT: '→',
  KEY_HOME: 'Home', KEY_END: 'End', KEY_PAGEUP: 'Page Up', KEY_PAGEDOWN: 'Page Down',
  KEY_INSERT: 'Insert', KEY_DELETE: 'Delete',
  // Special
  KEY_SPACE: 'Space', KEY_ENTER: 'Enter', KEY_BACKSPACE: 'Backspace',
  KEY_TAB: 'Tab', KEY_ESC: 'Escape', KEY_CAPSLOCK: 'Caps Lock',
  KEY_NUMLOCK: 'Num Lock', KEY_SCROLLLOCK: 'Scroll Lock',
  KEY_PRINTSCREEN: 'Print Screen', KEY_PAUSE: 'Pause',
  // Symbols
  KEY_MINUS: '-', KEY_EQUAL: '=', KEY_LEFTBRACE: '[', KEY_RIGHTBRACE: ']',
  KEY_BACKSLASH: '\\', KEY_SEMICOLON: ';', KEY_APOSTROPHE: "'",
  KEY_GRAVE: '`', KEY_COMMA: ',', KEY_DOT: '.', KEY_SLASH: '/',
  // Numpad
  KEY_KP0: 'Num 0', KEY_KP1: 'Num 1', KEY_KP2: 'Num 2', KEY_KP3: 'Num 3',
  KEY_KP4: 'Num 4', KEY_KP5: 'Num 5', KEY_KP6: 'Num 6', KEY_KP7: 'Num 7',
  KEY_KP8: 'Num 8', KEY_KP9: 'Num 9',
  KEY_KPASTERISK: 'Num *', KEY_KPMINUS: 'Num -', KEY_KPPLUS: 'Num +',
  KEY_KPDOT: 'Num .', KEY_KPENTER: 'Num Enter', KEY_KPSLASH: 'Num /',
};

// ─── Gamepad Button & Axis Constants ─────────────────────────────────

export const GAMEPAD_BUTTONS: Record<string, string> = {
  BTN_A: 'A (Cross)', BTN_B: 'B (Circle)', BTN_X: 'X (Square)', BTN_Y: 'Y (Triangle)',
  BTN_TL: 'Left Bumper (L1)', BTN_TR: 'Right Bumper (R1)',
  BTN_TL2: 'Left Trigger (L2)', BTN_TR2: 'Right Trigger (R2)',
  BTN_SELECT: 'Select (Share)', BTN_START: 'Start (Options)',
  BTN_MODE: 'Guide (Home)', BTN_THUMBL: 'Left Stick Click (L3)',
  BTN_THUMBR: 'Right Stick Click (R3)',
  BTN_DPAD_UP: 'D-Pad Up', BTN_DPAD_DOWN: 'D-Pad Down',
  BTN_DPAD_LEFT: 'D-Pad Left', BTN_DPAD_RIGHT: 'D-Pad Right',
  // Steam Deck specific
  BTN_STEAM: 'Steam Button',
  BTN_QUICK_ACCESS: 'Quick Access (...)',
  BTN_L4: 'Left Back Paddle (L4)', BTN_R4: 'Right Back Paddle (R4)',
  BTN_L5: 'Left Back Paddle (L5)', BTN_R5: 'Right Back Paddle (R5)',
};

export const GAMEPAD_AXES: Record<string, string> = {
  ABS_X: 'Left Stick X', ABS_Y: 'Left Stick Y',
  ABS_RX: 'Right Stick X', ABS_RY: 'Right Stick Y',
  ABS_Z: 'Left Trigger', ABS_RZ: 'Right Trigger',
  ABS_HAT0X: 'D-Pad X', ABS_HAT0Y: 'D-Pad Y',
  // Gyro / Motion
  ABS_MISC: 'Gyro Pitch', ABS_MISC_1: 'Gyro Yaw', ABS_MISC_2: 'Gyro Roll',
  // Guitar specific
  ABS_WHAMMY: 'Whammy Bar', ABS_TILT: 'Tilt Sensor',
};

export const MOUSE_BUTTONS: Record<string, string> = {
  BTN_LEFT: 'Left Click', BTN_RIGHT: 'Right Click', BTN_MIDDLE: 'Middle Click',
  BTN_SIDE: 'Side Button', BTN_EXTRA: 'Extra Button',
  SCROLL_UP: 'Scroll Up', SCROLL_DOWN: 'Scroll Down',
  SCROLL_LEFT: 'Scroll Left', SCROLL_RIGHT: 'Scroll Right',
  MOUSE_CURSOR: 'Mouse Cursor',
};

export const SYSTEM_ACTIONS: Record<string, string> = {
  SYS_SCREENSHOT: 'Screenshot',
  SYS_KEYBOARD_TOGGLE: 'Toggle On-Screen Keyboard',
  SYS_OVERLAY: 'Steam Overlay',
  SYS_MAGNIFIER: 'Magnifier',
  SYS_DESKTOP: 'Switch to Desktop',
  SYS_SUSPEND: 'Suspend',
};

// ─── Output Target Types ─────────────────────────────────────────────

export type OutputTargetType = 'gamepad' | 'keyboard' | 'mouse' | 'system';

export type ActivatorType =
  | 'RegularPress'
  | 'LongPress'
  | 'DoublePress'
  | 'StartPress'
  | 'ReleasePress'
  | 'ChordedPress';

export interface OutputTarget {
  type: OutputTargetType;
  code: string;           // e.g. 'BTN_A', 'KEY_SPACE', 'BTN_LEFT', 'SYS_SCREENSHOT'
  displayName: string;
}

export interface BindingConfig {
  output: OutputTarget;
  activator: ActivatorType;
  longPressThresholdMs?: number;    // for LongPress
  chordedButton?: string;           // for ChordedPress
  turboEnabled: boolean;
  turboRateHz?: number;
  macroId?: string;                 // reference to saved macro
}

// ─── Steam Input Binding String Builder ──────────────────────────────

const XINPUT_BUTTON_MAP: Record<string, string> = {
  BTN_A: 'A', BTN_B: 'B', BTN_X: 'X', BTN_Y: 'Y',
  BTN_TL: 'SHOULDER_LEFT', BTN_TR: 'SHOULDER_RIGHT',
  BTN_TL2: 'TRIGGER_LEFT', BTN_TR2: 'TRIGGER_RIGHT',
  BTN_SELECT: 'SELECT', BTN_START: 'START', BTN_MODE: 'GUIDE',
  BTN_THUMBL: 'JOYSTICK_LEFT', BTN_THUMBR: 'JOYSTICK_RIGHT',
  BTN_DPAD_UP: 'DPAD_UP', BTN_DPAD_DOWN: 'DPAD_DOWN',
  BTN_DPAD_LEFT: 'DPAD_LEFT', BTN_DPAD_RIGHT: 'DPAD_RIGHT',
};

const ACTIVATOR_MODE_MAP: Record<ActivatorType, string> = {
  RegularPress: 'RegularPress',
  LongPress: 'LongPress',
  DoublePress: 'DoublePress',
  StartPress: 'StartPress',
  ReleasePress: 'ReleasePress',
  ChordedPress: 'ChordedPress',
};

/**
 * Build a Steam Input VDF binding string from a BindingConfig.
 * Example: "xinput_button TRIGGER_LEFT, Mode RegularPress"
 */
export function buildBindingString(config: BindingConfig): string {
  const parts: string[] = [];

  switch (config.output.type) {
    case 'gamepad': {
      const xinput = XINPUT_BUTTON_MAP[config.output.code] || config.output.code;
      parts.push(`xinput_button ${xinput}`);
      break;
    }
    case 'keyboard': {
      const keyName = config.output.code.replace('KEY_', '').toLowerCase();
      parts.push(`key_press ${keyName}`);
      break;
    }
    case 'mouse': {
      if (config.output.code === 'MOUSE_CURSOR') {
        parts.push('mouse_motion');
      } else if (config.output.code.startsWith('SCROLL_')) {
        const dir = config.output.code.replace('SCROLL_', '').toLowerCase();
        parts.push(`mouse_wheel ${dir}`);
      } else {
        const btn = config.output.code === 'BTN_LEFT' ? 'left'
          : config.output.code === 'BTN_RIGHT' ? 'right'
            : config.output.code === 'BTN_MIDDLE' ? 'middle'
              : config.output.code.replace('BTN_', '').toLowerCase();
        parts.push(`mouse_button ${btn}`);
      }
      break;
    }
    case 'system': {
      const sysAction = config.output.code.replace('SYS_', '').toLowerCase();
      parts.push(`system_action ${sysAction}`);
      break;
    }
  }

  parts.push(`Mode ${ACTIVATOR_MODE_MAP[config.activator]}`);

  if (config.activator === 'LongPress' && config.longPressThresholdMs !== undefined) {
    parts.push(`LongPressTime ${config.longPressThresholdMs}`);
  }

  if (config.activator === 'ChordedPress' && config.chordedButton) {
    const chordXInput = XINPUT_BUTTON_MAP[config.chordedButton] || config.chordedButton;
    parts.push(`ChordButton ${chordXInput}`);
  }

  if (config.turboEnabled && config.turboRateHz) {
    parts.push(`Turbo ${config.turboRateHz}`);
  }

  return parts.join(', ');
}

/**
 * Parse a Steam Input VDF binding string back into a BindingConfig.
 */
export function parseBindingString(binding: string): BindingConfig | null {
  if (!binding || binding.trim() === '') return null;

  const segments = binding.split(',').map(s => s.trim());
  if (segments.length === 0) return null;

  const firstPart = segments[0];
  let output: OutputTarget;

  if (firstPart.startsWith('xinput_button')) {
    const btnName = firstPart.replace('xinput_button ', '').trim();
    const code = Object.entries(XINPUT_BUTTON_MAP).find(([, v]) => v === btnName)?.[0] || btnName;
    output = { type: 'gamepad', code, displayName: GAMEPAD_BUTTONS[code] || btnName };
  } else if (firstPart.startsWith('key_press')) {
    const keyName = firstPart.replace('key_press ', '').trim();
    const code = `KEY_${keyName.toUpperCase()}`;
    output = { type: 'keyboard', code, displayName: KEYBOARD_KEYS[code] || keyName };
  } else if (firstPart.startsWith('mouse_button')) {
    const btn = firstPart.replace('mouse_button ', '').trim();
    const code = `BTN_${btn.toUpperCase()}`;
    output = { type: 'mouse', code, displayName: MOUSE_BUTTONS[code] || btn };
  } else if (firstPart.startsWith('mouse_wheel')) {
    const dir = firstPart.replace('mouse_wheel ', '').trim();
    const code = `SCROLL_${dir.toUpperCase()}`;
    output = { type: 'mouse', code, displayName: MOUSE_BUTTONS[code] || dir };
  } else if (firstPart === 'mouse_motion') {
    output = { type: 'mouse', code: 'MOUSE_CURSOR', displayName: 'Mouse Cursor' };
  } else if (firstPart.startsWith('system_action')) {
    const action = firstPart.replace('system_action ', '').trim();
    const code = `SYS_${action.toUpperCase()}`;
    output = { type: 'system', code, displayName: SYSTEM_ACTIONS[code] || action };
  } else {
    return null;
  }

  let activator: ActivatorType = 'RegularPress';
  let longPressThresholdMs: number | undefined;
  let chordedButton: string | undefined;
  let turboEnabled = false;
  let turboRateHz: number | undefined;

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i].trim();
    if (seg.startsWith('Mode ')) {
      activator = seg.replace('Mode ', '') as ActivatorType;
    } else if (seg.startsWith('LongPressTime ')) {
      longPressThresholdMs = parseInt(seg.replace('LongPressTime ', ''), 10);
    } else if (seg.startsWith('ChordButton ')) {
      const chordName = seg.replace('ChordButton ', '');
      chordedButton = Object.entries(XINPUT_BUTTON_MAP).find(([, v]) => v === chordName)?.[0] || chordName;
    } else if (seg.startsWith('Turbo ')) {
      turboEnabled = true;
      turboRateHz = parseInt(seg.replace('Turbo ', ''), 10);
    }
  }

  return { output, activator, longPressThresholdMs, chordedButton, turboEnabled, turboRateHz };
}

// ─── Output Target Presets ───────────────────────────────────────────

export interface OutputPreset {
  name: string;
  description: string;
  bindings: BindingConfig[];
}

export const GAMEPAD_PRESETS: OutputPreset[] = [
  {
    name: 'Standard Gamepad',
    description: 'Default Xbox-style gamepad mapping',
    bindings: Object.keys(GAMEPAD_BUTTONS).map(code => ({
      output: { type: 'gamepad' as const, code, displayName: GAMEPAD_BUTTONS[code] },
      activator: 'RegularPress' as const,
      turboEnabled: false,
    })),
  },
  {
    name: 'WASD + Mouse',
    description: 'FPS keyboard and mouse layout',
    bindings: [
      { output: { type: 'keyboard', code: 'KEY_W', displayName: 'W' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'keyboard', code: 'KEY_A', displayName: 'A' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'keyboard', code: 'KEY_S', displayName: 'S' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'keyboard', code: 'KEY_D', displayName: 'D' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'mouse', code: 'BTN_LEFT', displayName: 'Left Click' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'mouse', code: 'BTN_RIGHT', displayName: 'Right Click' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'keyboard', code: 'KEY_SPACE', displayName: 'Space' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'keyboard', code: 'KEY_LEFTSHIFT', displayName: 'Left Shift' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'keyboard', code: 'KEY_LEFTCTRL', displayName: 'Left Ctrl' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'keyboard', code: 'KEY_R', displayName: 'R' }, activator: 'RegularPress', turboEnabled: false },
    ],
  },
  {
    name: 'Racing',
    description: 'Racing game analog triggers and steering',
    bindings: [
      { output: { type: 'gamepad', code: 'BTN_TR2', displayName: 'Right Trigger (R2)' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'gamepad', code: 'BTN_TL2', displayName: 'Left Trigger (L2)' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'gamepad', code: 'BTN_A', displayName: 'A (Cross)' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'gamepad', code: 'BTN_B', displayName: 'B (Circle)' }, activator: 'RegularPress', turboEnabled: false },
      { output: { type: 'gamepad', code: 'BTN_X', displayName: 'X (Square)' }, activator: 'RegularPress', turboEnabled: false },
    ],
  },
];

// ─── Action Set / Layer Management ───────────────────────────────────

export interface ActionSet {
  id: string;
  name: string;
  layers: ActionLayer[];
}

export interface ActionLayer {
  id: string;
  name: string;
  bindings: Record<string, BindingConfig>; // inputCode -> BindingConfig
  activationTrigger?: LayerActivationTrigger;
}

export interface LayerActivationTrigger {
  type: 'hold' | 'toggle' | 'combo';
  button?: string;      // for hold/toggle
  combo?: string[];     // for combo activation
}

export function createActionSet(name: string): ActionSet {
  return {
    id: generateId(),
    name,
    layers: [{
      id: generateId(),
      name: 'Default',
      bindings: {},
    }],
  };
}

export function addLayerToSet(set: ActionSet, layerName: string): ActionSet {
  return {
    ...set,
    layers: [
      ...set.layers,
      { id: generateId(), name: layerName, bindings: {} },
    ],
  };
}

export function removeLayerFromSet(set: ActionSet, layerId: string): ActionSet {
  return {
    ...set,
    layers: set.layers.filter(l => l.id !== layerId),
  };
}

export function renameLayer(set: ActionSet, layerId: string, newName: string): ActionSet {
  return {
    ...set,
    layers: set.layers.map(l => l.id === layerId ? { ...l, name: newName } : l),
  };
}

export function setLayerBinding(
  set: ActionSet,
  layerId: string,
  inputCode: string,
  binding: BindingConfig,
): ActionSet {
  return {
    ...set,
    layers: set.layers.map(l =>
      l.id === layerId
        ? { ...l, bindings: { ...l.bindings, [inputCode]: binding } }
        : l
    ),
  };
}

export function removeLayerBinding(
  set: ActionSet,
  layerId: string,
  inputCode: string,
): ActionSet {
  return {
    ...set,
    layers: set.layers.map(l => {
      if (l.id !== layerId) return l;
      const { [inputCode]: _, ...rest } = l.bindings;
      return { ...l, bindings: rest };
    }),
  };
}

export function copyBindingsBetweenLayers(
  set: ActionSet,
  fromLayerId: string,
  toLayerId: string,
): ActionSet {
  const fromLayer = set.layers.find(l => l.id === fromLayerId);
  if (!fromLayer) return set;
  return {
    ...set,
    layers: set.layers.map(l =>
      l.id === toLayerId
        ? { ...l, bindings: { ...l.bindings, ...fromLayer.bindings } }
        : l
    ),
  };
}

export function setLayerActivation(
  set: ActionSet,
  layerId: string,
  trigger: LayerActivationTrigger,
): ActionSet {
  return {
    ...set,
    layers: set.layers.map(l =>
      l.id === layerId ? { ...l, activationTrigger: trigger } : l
    ),
  };
}

// ─── Macro Sequence Serializer ───────────────────────────────────────

export type MacroStepType = 'key_press' | 'key_release' | 'delay' | 'mouse_button' | 'gamepad_button';

export interface MacroStep {
  id: string;
  type: MacroStepType;
  code?: string;        // key/button code
  value?: number;        // 1=press, 0=release for buttons; ms for delay
  durationMs: number;    // how long this step takes
}

export interface MacroSequence {
  id: string;
  name: string;
  steps: MacroStep[];
  loopCount: number;     // 0 = infinite
  turboRateHz?: number;
}

export function serializeMacro(macro: MacroSequence): string {
  return JSON.stringify({
    version: 1,
    id: macro.id,
    name: macro.name,
    steps: macro.steps.map(s => ({
      t: s.type,
      c: s.code,
      v: s.value,
      d: s.durationMs,
    })),
    loop: macro.loopCount,
    turbo: macro.turboRateHz,
  });
}

export function deserializeMacro(json: string): MacroSequence | null {
  try {
    const data = JSON.parse(json);
    if (data.version !== 1) return null;
    return {
      id: data.id || generateId(),
      name: data.name || 'Unnamed Macro',
      steps: (data.steps || []).map((s: any) => ({
        id: generateId(),
        type: s.t as MacroStepType,
        code: s.c,
        value: s.v,
        durationMs: s.d || 0,
      })),
      loopCount: data.loop ?? 1,
      turboRateHz: data.turbo,
    };
  } catch {
    return null;
  }
}

export function createMacroStep(
  type: MacroStepType,
  code?: string,
  value?: number,
  durationMs: number = 50,
): MacroStep {
  return { id: generateId(), type, code, value, durationMs };
}

export function reorderMacroSteps(
  steps: MacroStep[],
  fromIndex: number,
  toIndex: number,
): MacroStep[] {
  const result = [...steps];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);
  return result;
}

export function totalMacroDuration(macro: MacroSequence): number {
  const singlePass = macro.steps.reduce((sum, step) => sum + step.durationMs, 0);
  if (macro.loopCount === 0) return Infinity;
  return singlePass * macro.loopCount;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export function getDisplayName(type: OutputTargetType, code: string): string {
  switch (type) {
    case 'gamepad': return GAMEPAD_BUTTONS[code] || code;
    case 'keyboard': return KEYBOARD_KEYS[code] || code;
    case 'mouse': return MOUSE_BUTTONS[code] || code;
    case 'system': return SYSTEM_ACTIONS[code] || code;
  }
}

/**
 * Get all available outputs for a given target type.
 */
export function getOutputsForType(type: OutputTargetType): OutputTarget[] {
  const map = type === 'gamepad' ? GAMEPAD_BUTTONS
    : type === 'keyboard' ? KEYBOARD_KEYS
      : type === 'mouse' ? MOUSE_BUTTONS
        : SYSTEM_ACTIONS;
  return Object.entries(map).map(([code, displayName]) => ({ type, code, displayName }));
}
