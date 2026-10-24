export type LiveEventType =
  | 'cap_updated'
  | 'assignment_created'
  | 'application_created';

export interface LiveEvent {
  type: LiveEventType;
  contributor?: string | null;
  data: Record<string, unknown>;
}

type Subscriber = (event: LiveEvent) => void;

const subscribers = new Set<Subscriber>();

const CONTRIBUTOR_CONTRACT_EVENTS = new Set([
  'applied',
  'withdrew',
  'assigned',
  'completed',
  'revoked',
]);

export function subscribeToLiveEvents(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function subscribeToContributorEvents(
  address: string,
  subscriber: Subscriber,
): () => void {
  return subscribeToLiveEvents((event) => {
    const eventContributor =
      event.contributor ??
      (typeof event.data?.contributor === 'string' ? event.data.contributor : null);
    if (eventContributor !== address) {
      return;
    }

    const rawEventType = event.data?.eventType ?? event.data?.event_type;
    if (
      typeof rawEventType === 'string' &&
      !CONTRIBUTOR_CONTRACT_EVENTS.has(rawEventType)
    ) {
      return;
    }

    subscriber(event);
  });
}

export function publishLiveEvent(event: LiveEvent): void {
  for (const subscriber of subscribers) subscriber(event);
}