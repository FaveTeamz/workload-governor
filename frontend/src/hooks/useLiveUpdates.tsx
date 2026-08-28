import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type LiveStatus = "connected" | "reconnecting" | "polling";

export interface LiveEvent {
  eventType?: string;
  event_type?: string;
  orgId?: string;
  org_id?: string;
}

interface CapState {
  globalApplications: number;
  orgCounts: Array<{ org: string; assignments: number }>;
}

interface LiveUpdatesValue extends CapState {
  liveStatus: LiveStatus;
}

const initialState: CapState = { globalApplications: 0, orgCounts: [] };
const LiveUpdatesContext = createContext<LiveUpdatesValue | null>(null);

function updateCounts(state: CapState, event: LiveEvent): CapState {
  if (event.eventType !== "applied" && event.eventType !== "assigned") return state;
  const globalApplications = event.eventType === "applied"
    ? state.globalApplications + 1
    : Math.max(state.globalApplications - 1, 0);
  if (!event.orgId || event.eventType !== "assigned") return { ...state, globalApplications };

  const existing = state.orgCounts.find((count) => count.org === event.orgId);
  if (existing) {
    return {
      globalApplications,
      orgCounts: state.orgCounts.map((count) =>
        count.org === event.orgId ? { ...count, assignments: count.assignments + 1 } : count,
      ),
    };
  }
  return { globalApplications, orgCounts: [...state.orgCounts, { org: event.orgId, assignments: 1 }] };
}

async function pollEvents(setState: (state: CapState) => CapState) {
  const response = await fetch("/api/events?limit=1000");
  if (!response.ok) throw new Error(`Event polling failed: ${response.status}`);
  const body = await response.json() as { events?: LiveEvent[] };
  const events = (body.events ?? []).map((event) => ({
    eventType: event.eventType ?? event.event_type,
    orgId: event.orgId ?? event.org_id,
  }));
  const applications = events.filter((event) => event.eventType === "applied").length;
  const assignments = events.filter((event) => event.eventType === "assigned");
  const orgCounts = assignments.reduce<Array<{ org: string; assignments: number }>>((counts, event) => {
    if (!event.orgId) return counts;
    const existing = counts.find((count) => count.org === event.orgId);
    if (existing) existing.assignments += 1;
    else counts.push({ org: event.orgId, assignments: 1 });
    return counts;
  }, []);
  setState(() => ({ globalApplications: Math.max(applications - assignments.length, 0), orgCounts }));
}

export function LiveUpdatesProvider({ children }: { children: ReactNode }) {
  const [capState, setCapState] = useState(initialState);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("reconnecting");

  useEffect(() => {
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let retryCount = 0;
    let stopped = false;

    const startPolling = () => {
      if (stopped || pollTimer) return;
      setLiveStatus("polling");
      void pollEvents(setCapState).catch(() => undefined);
      pollTimer = setInterval(() => void pollEvents(setCapState).catch(() => undefined), 30000);
    };

    const connect = () => {
      if (stopped) return;
      setLiveStatus("reconnecting");
      source = new EventSource("/api/events/stream");
      const handleEvent = (event: MessageEvent<string>) => {
        const data = JSON.parse(event.data) as LiveEvent;
        setCapState((state) => updateCounts(state, data));
      };
      source.addEventListener("cap_updated", handleEvent);
      source.addEventListener("assignment_created", handleEvent);
      source.addEventListener("application_created", handleEvent);
      source.onopen = () => {
        retryCount = 0;
        setLiveStatus("connected");
      };
      source.onerror = () => {
        source?.close();
        if (retryCount >= 3) {
          startPolling();
          return;
        }
        const delay = Math.min(1000 * 2 ** retryCount, 30000);
        retryCount += 1;
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      source?.close();
      if (retryTimer) clearTimeout(retryTimer);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  return <LiveUpdatesContext.Provider value={{ ...capState, liveStatus }}>{children}</LiveUpdatesContext.Provider>;
}

export function useLiveUpdates(): LiveUpdatesValue {
  const value = useContext(LiveUpdatesContext);
  if (!value) throw new Error("useLiveUpdates must be used within LiveUpdatesProvider");
  return value;
}