import { useEffect, useRef, useState, useCallback } from 'react';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseWebSocketOptions<T = any> {
  url: string;
  onMessage?: (data: T) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  autoReconnect?: boolean;
}

export interface UseWebSocketReturn<T = any> {
  connectionState: ConnectionState;
  sendMessage: (message: any) => boolean;
  lastMessage: T | null;
  disconnect: () => void;
  reconnect: () => void;
}

export function useWebSocket<T = any>(options: UseWebSocketOptions<T>): UseWebSocketReturn<T> {
  const {
    url,
    onMessage,
    onError,
    onOpen,
    onClose,
    reconnectInterval = 1000,
    maxReconnectAttempts = 10,
    autoReconnect = true,
  } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastMessage, setLastMessage] = useState<T | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const messageQueueRef = useRef<string[]>([]);
  const isManuallyClosedRef = useRef(false);

  // Store latest callbacks to avoid re-triggering connection on cb changes
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
  });

  const connect = useCallback(() => {
    if (!url) return;

    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    isManuallyClosedRef.current = false;
    setConnectionState('connecting');

    try {
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        reconnectAttemptsRef.current = 0;
        onOpenRef.current?.();

        // Flush message queue
        while (messageQueueRef.current.length > 0 && ws.readyState === WebSocket.OPEN) {
          const queued = messageQueueRef.current.shift();
          if (queued) ws.send(queued);
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data) as T;
          setLastMessage(parsed);
          onMessageRef.current?.(parsed);
        } catch {
          setLastMessage(event.data as unknown as T);
          onMessageRef.current?.(event.data as unknown as T);
        }
      };

      ws.onerror = (event: Event) => {
        setConnectionState('error');
        onErrorRef.current?.(event);
      };

      ws.onclose = (event: CloseEvent) => {
        setConnectionState('disconnected');
        onCloseRef.current?.(event);

        if (!isManuallyClosedRef.current && autoReconnect) {
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            const backoff = Math.min(reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current), 15000);
            reconnectAttemptsRef.current += 1;
            reconnectTimeoutRef.current = window.setTimeout(() => {
              connect();
            }, backoff);
          }
        }
      };
    } catch {
      setConnectionState('error');
    }
  }, [url, autoReconnect, maxReconnectAttempts, reconnectInterval]);

  const disconnect = useCallback(() => {
    isManuallyClosedRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnectionState('disconnected');
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  const sendMessage = useCallback((message: any): boolean => {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(payload);
      return true;
    } else {
      // Queue message to send on reconnect
      messageQueueRef.current.push(payload);
      return false;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connectionState,
    sendMessage,
    lastMessage,
    disconnect,
    reconnect,
  };
}
