import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { InputDevice, InputEvent } from '../types';

export interface BoundInputResult {
  devicePath: string;
  eventType: string;
  code: number;
  codeName: string;
  value: number;
}

export function useInputDevice(initialDevicePath?: string) {
  const [devices, setDevices] = useState<InputDevice[]>([]);
  const [activeDevicePath, setActiveDevicePath] = useState<string | null>(initialDevicePath || null);
  const [inputStates, setInputStates] = useState<Map<string, number>>(new Map());
  const [lastEvent, setLastEvent] = useState<InputEvent | null>(null);
  const [isBinding, setIsBinding] = useState<boolean>(false);
  const [boundInput, setBoundInput] = useState<BoundInputResult | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState<boolean>(false);

  // Fetch connected devices from REST endpoint
  const fetchDevices = useCallback(async () => {
    setIsLoadingDevices(true);
    try {
      const res = await fetch('http://localhost:8765/api/devices');
      if (res.ok) {
        const data = await res.json();
        setDevices(data);
        if (!activeDevicePath && data.length > 0) {
          setActiveDevicePath(data[0].path);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch devices from REST API:', err);
    } finally {
      setIsLoadingDevices(false);
    }
  }, [activeDevicePath]);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 3000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  const activeDevice = devices.find((d: InputDevice) => d.path === activeDevicePath) || null;

  // Live input stream WebSocket
  const wsInputUrl = activeDevicePath
    ? `ws://localhost:8765/ws/input/${encodeURIComponent(activeDevicePath.replace(/^\//, ''))}`
    : '';

  const handleInputEvent = useCallback((event: InputEvent) => {
    setLastEvent(event);
    setInputStates((prev: Map<string, number>) => {
      const next = new Map(prev);
      const key = event.codeLabel || `${event.type}_${event.code}`;
      if (event.type === 'EV_KEY') {
        if (event.value === 0) {
          next.delete(key);
        } else {
          next.set(key, event.value);
        }
      } else {
        next.set(key, event.value);
      }
      return next;
    });
  }, []);

  const inputWs = useWebSocket<InputEvent>({
    url: wsInputUrl,
    onMessage: handleInputEvent,
    autoReconnect: true,
  });

  // "Press Any Input to Bind" WebSocket
  const wsBindUrl = isBinding ? 'ws://localhost:8765/ws/bind' : '';

  const handleBindMessage = useCallback((msg: any) => {
    if (msg && (msg.code !== undefined || msg.code_name || msg.codeLabel)) {
      const result: BoundInputResult = {
        devicePath: msg.device_path || msg.devicePath || '',
        eventType: msg.event_type || msg.type || 'EV_KEY',
        code: msg.code ?? 0,
        codeName: msg.code_name || msg.codeLabel || `CODE_${msg.code}`,
        value: msg.value ?? 1,
      };
      setBoundInput(result);
      setIsBinding(false);
    }
  }, []);

  const bindWs = useWebSocket<any>({
    url: wsBindUrl,
    onMessage: handleBindMessage,
    autoReconnect: false,
  });

  const startBinding = useCallback(() => {
    setBoundInput(null);
    setIsBinding(true);
  }, []);

  const stopBinding = useCallback(() => {
    setIsBinding(false);
  }, []);

  const selectDevice = useCallback((path: string) => {
    setActiveDevicePath(path);
    setInputStates(new Map());
    setLastEvent(null);
  }, []);

  return {
    devices,
    activeDevice,
    activeDevicePath,
    selectDevice,
    inputStates,
    lastEvent,
    startBinding,
    stopBinding,
    isBinding,
    boundInput,
    isLoadingDevices,
    refreshDevices: fetchDevices,
    connectionState: inputWs.connectionState,
  };
}
