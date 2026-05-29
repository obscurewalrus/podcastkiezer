import {
  availableSlots,
  ensureVoterId,
  fetchPoll,
  getVoterStatus,
  isValidDate,
  isValidSlot,
  json,
  newestSlot,
  noPollMessage,
  shapePoll,
  todayInAmsterdam,
} from "../_shared.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const queryDate = url.searchParams.get("date");
  const querySlot = url.searchParams.get("slot");
  const today = todayInAmsterdam();
  const date = queryDate || today;

  if (!isValidDate(date)) {
    return json({ error: "Ongeldige datum." }, { status: 400 });
  }
  if (querySlot && !isValidSlot(querySlot)) {
    return json({ error: "Ongeldig slot." }, { status: 400 });
  }

  const slots = await availableSlots(env, date);
  // Expliciet gevraagd slot wint; anders het nieuwste beschikbare slot.
  const slot = querySlot || newestSlot(slots);

  if (!slot) {
    const ctx = noPollMessage(date, today, querySlot || null);
    return json(
      { error: "Geen poll voor deze datum.", date, available_slots: [], ...ctx },
      { status: 404 }
    );
  }

  const poll = await fetchPoll(env, date, slot);
  if (!poll) {
    const ctx = noPollMessage(date, today, slot);
    return json(
      { error: "Geen poll voor dit slot.", date, slot, available_slots: slots, ...ctx },
      { status: 404 }
    );
  }

  const { voterId, extraHeaders } = ensureVoterId(request);

  const isToday = date === today;
  const status = await getVoterStatus(env, date, slot, voterId);
  const shaped = shapePoll(poll, {
    isToday,
    revealed: status.revealed,
    yourVote: status.vote,
    availableSlots: slots,
  });

  return json(shaped, { headers: extraHeaders });
}
