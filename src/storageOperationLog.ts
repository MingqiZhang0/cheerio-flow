import { useCallback, useRef, useState } from "react";
import type { StorageEvent } from "./types";

export const DEFAULT_STORAGE_EVENT_CAPACITY = 512;

export type StorageEventDraft = Omit<StorageEvent, "id" | "timestamp"> & Partial<Pick<StorageEvent, "id" | "timestamp">>;

export function formatStorageEventForCopy(event: StorageEvent) {
  const parts = [
    event.timestamp,
    `[${event.severity}]`,
    `${event.operation}/${event.phase}`,
    event.message,
  ];
  if (event.relatedPath) parts.push(`related=${event.relatedPath}`);
  if (event.errorKind) parts.push(`errorKind=${event.errorKind}`);
  if (event.dataVersion !== undefined) parts.push(`dataVersion=${event.dataVersion}`);
  if (event.workspaceId) parts.push(`workspace=${event.workspaceId}`);
  if (event.details) parts.push(`details=${event.details.replace(/\s+/g, " ").trim()}`);
  return parts.join(" ");
}

export function formatStorageEventsForCopy(events: StorageEvent[]) {
  return events.map(formatStorageEventForCopy).join("\n");
}

function createStorageEventId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `storage-event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeCapacity(capacity: number) {
  return Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : DEFAULT_STORAGE_EVENT_CAPACITY;
}

function materializeStorageEvent(draft: StorageEventDraft): StorageEvent {
  return {
    ...draft,
    id: draft.id ?? createStorageEventId(),
    timestamp: draft.timestamp ?? new Date().toISOString(),
  };
}

export function useStorageOperationLog(capacity = DEFAULT_STORAGE_EVENT_CAPACITY) {
  const maxEvents = normalizeCapacity(capacity);
  const eventsRef = useRef<StorageEvent[]>([]);
  const [events, setEvents] = useState<StorageEvent[]>([]);

  const append = useCallback(
    (draft: StorageEventDraft) => {
      const event = materializeStorageEvent(draft);
      setEvents((current) => {
        const next = [...current, event].slice(-maxEvents);
        eventsRef.current = next;
        return next;
      });
      return event;
    },
    [maxEvents],
  );

  const clear = useCallback(() => {
    eventsRef.current = [];
    setEvents([]);
  }, []);

  const copyText = useCallback(() => formatStorageEventsForCopy(eventsRef.current), []);

  return { events, append, clear, copyText };
}
