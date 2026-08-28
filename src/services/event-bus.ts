export type LiveEventType =
  | 'cap_updated'
  | 'assignment_created'
  | 'application_created';

export interface LiveEvent {
  type: LiveEventType;
  data: Record<string, unknown>;
}

type Subscriber = (event: LiveEvent) => void;

const subscribers = new Set<Subscriber>();

export function subscribeToLiveEvents(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function publishLiveEvent(event: LiveEvent): void {
  for (const subscriber of subscribers) subscriber(event);
}