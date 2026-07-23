import {
  BOOK_COMPANION_JOURNEY_ITEM_KEY,
  buildCompanionJourney,
  getCompanionJourneyItemKey,
} from "./companionJourney.js";
import { getItem, KEYS } from "./storage.js";
import {
  getCompanionEvents,
  syncCompanionJourneyEvents,
} from "./companionEventStore.js";

export async function loadCompanionJourney({ bookId, planItems = [] } = {}) {
  if (!bookId) return [];

  const itemKeys = [...new Set(planItems.map(getCompanionJourneyItemKey).filter(Boolean))];
  const [guideEntries, chatStore, reflectionStore, notesStore] = await Promise.all([
    Promise.all(
      itemKeys.map(async (itemKey) => [
        itemKey,
        await getItem(KEYS.bookQuestions(bookId, itemKey), null).catch(() => null),
      ])
    ),
    getItem(KEYS.bookChat(bookId), {}).catch(() => ({})),
    getItem(KEYS.bookReflection(bookId), {}).catch(() => ({})),
    getItem(KEYS.bookNotes(bookId), {}).catch(() => ({})),
  ]);

  const journey = buildCompanionJourney({
    bookId,
    planItems,
    guidesByItemKey: Object.fromEntries(guideEntries.filter(([, guide]) => guide)),
    chatStore,
    reflectionStore,
    notesStore,
  });
  const events = await syncCompanionJourneyEvents(bookId, journey);
  const eventByPayload = new Map(
    events
      .filter((event) => event.payloadRef?.store)
      .map((event) => [payloadIdentity(event.payloadRef), event])
  );

  return journey.map((entry) => ({
    ...entry,
    event: eventByPayload.get(payloadIdentity(entry.payloadRef)) || null,
  }));
}

export async function loadBookCompanionJourney(book) {
  return loadCompanionJourney({
    bookId: book?.id,
    planItems: Array.isArray(book?.readingPlan?.items) ? book.readingPlan.items : [],
  });
}

export { BOOK_COMPANION_JOURNEY_ITEM_KEY };

export { getCompanionEvents };

function payloadIdentity(ref) {
  if (!ref?.store) return "";
  return [ref.store, ref.itemKey || "", ref.sourceId || ""].join("\u001f");
}
