"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type TranscriptEntry = {
  id: string;
  text: string;
  timestamp: string;
  confidence: number | null;
};

type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: "CONNECTING",
  live: "LIVE",
  reconnecting: "RECONNECTING",
  offline: "OFFLINE",
};

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connecting: "#f59e0b",
  live: "#ef4444",
  reconnecting: "#f59e0b",
  offline: "#6b7280",
};

export default function MiamiDispatchPage() {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setStatus("connecting");
    const es = new EventSource("/api/dispatch");
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);

        if (payload.type === "status" && payload.status === "live") {
          setStatus("live");
          setErrorMsg(null);
          reconnectAttempts.current = 0;
        }

        if (payload.type === "transcript" && payload.text?.trim()) {
          const entry: TranscriptEntry = {
            id: `${Date.now()}-${Math.random()}`,
            text: payload.text.trim(),
            timestamp: payload.timestamp,
            confidence: payload.confidence,
          };
          setEntries((prev) => [...prev, entry].slice(-200));
        }

        if (payload.type === "error") {
          setErrorMsg(payload.message);
        }
      } catch {
        // malformed JSON — ignore
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setStatus("reconnecting");

      const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30_000);
      reconnectAttempts.current += 1;

      reconnectTimer.current = setTimeout(() => {
        if (reconnectAttempts.current > 10) {
          setStatus("offline");
          return;
        }
        connect();
      }, delay);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  // Auto-scroll to latest entry
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [entries]);

  const statusColor = STATUS_COLORS[status];

  return (
    <div
      style={{
        background: "#0a0a0a",
        minHeight: "100vh",
        color: "#e8e8e8",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid #1f1f1f",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#0d0d0d",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Fire icon */}
          <span style={{ fontSize: "24px" }}>🔥</span>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "18px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "#ffffff",
              }}
            >
              MIAMI FIRE RESCUE
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: "11px",
                color: "#6b7280",
                letterSpacing: "0.08em",
              }}
            >
              LIVE DISPATCH — CITY OF MIAMI + CORAL GABLES
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: statusColor,
              boxShadow:
                status === "live"
                  ? `0 0 8px ${statusColor}, 0 0 16px ${statusColor}40`
                  : "none",
              animation:
                status === "live" || status === "connecting"
                  ? "pulse 1.4s ease-in-out infinite"
                  : "none",
            }}
          />
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: statusColor,
            }}
          >
            {STATUS_LABELS[status]}
          </span>
        </div>
      </header>

      {/* Subheader — feed info */}
      <div
        style={{
          padding: "8px 24px",
          background: "#111",
          borderBottom: "1px solid #1a1a1a",
          fontSize: "11px",
          color: "#4b5563",
          letterSpacing: "0.06em",
          display: "flex",
          gap: "24px",
        }}
      >
        <span>FEED: Broadcastify #30508</span>
        <span>TRANSCRIPTION: Deepgram nova-2</span>
        <span>ENTRIES: {entries.length}</span>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div
          style={{
            background: "#1a0a0a",
            borderBottom: "1px solid #3f1010",
            padding: "8px 24px",
            fontSize: "12px",
            color: "#f87171",
            letterSpacing: "0.04em",
          }}
        >
          ⚠ {errorMsg}
        </div>
      )}

      {/* Transcript feed */}
      <div
        ref={feedRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "#374151",
              gap: "12px",
              paddingTop: "80px",
            }}
          >
            <span style={{ fontSize: "40px" }}>📻</span>
            <span style={{ fontSize: "14px", letterSpacing: "0.08em" }}>
              {status === "connecting"
                ? "CONNECTING TO RADIO FEED…"
                : status === "reconnecting"
                ? "RECONNECTING…"
                : status === "offline"
                ? "FEED OFFLINE"
                : "WAITING FOR TRANSMISSIONS…"}
            </span>
          </div>
        ) : (
          entries.map((entry, i) => (
            <TranscriptRow key={entry.id} entry={entry} index={i} />
          ))
        )}
      </div>

      {/* Status bar */}
      <footer
        style={{
          borderTop: "1px solid #1a1a1a",
          padding: "8px 24px",
          background: "#0d0d0d",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "11px",
          color: "#374151",
          letterSpacing: "0.06em",
        }}
      >
        <span>BROADCASTIFY FEED 30508 — DISPATCH &amp; TACTICAL</span>
        <span>{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 0.9; transform: translateY(0); }
        }
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: #0a0a0a;
        }
        ::-webkit-scrollbar-thumb {
          background: #1f1f1f;
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #2d2d2d;
        }
      `}</style>
    </div>
  );
}

function TranscriptRow({
  entry,
  index,
}: {
  entry: TranscriptEntry;
  index: number;
}) {
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Highlight fire-related keywords in red
  const fireKeywords =
    /\b(fire|structure fire|working fire|flames|smoke|alarm|mayday|emergency|rescue|hazmat|explosion|smoke showing)\b/gi;
  const isFireCall = fireKeywords.test(entry.text);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr",
        gap: "12px",
        padding: "6px 0",
        borderBottom: "1px solid #111",
        alignItems: "start",
        opacity: 0.9,
        animation: index === -1 ? "none" : "fadeIn 0.3s ease",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          color: "#4b5563",
          fontVariantNumeric: "tabular-nums",
          paddingTop: "1px",
          flexShrink: 0,
        }}
      >
        {time}
      </span>
      <span
        style={{
          fontSize: "13px",
          lineHeight: "1.5",
          color: isFireCall ? "#fca5a5" : "#d1d5db",
          wordBreak: "break-word",
        }}
      >
        {entry.text}
      </span>
    </div>
  );
}
