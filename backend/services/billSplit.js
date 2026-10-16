// Cent-accurate split math -- floating point addition on currency amounts
// drifts, so every computation here works in integer cents and only converts
// back to a decimal at the very end.

function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

function fromCents(cents) {
  return Math.round(cents) / 100;
}

// Splits totalCents across n slots as evenly as possible; the first
// (totalCents % n) slots get one extra cent so the slots sum to exactly
// totalCents regardless of division remainder.
function distributeCents(totalCents, n) {
  const base = Math.floor(totalCents / n);
  const remainder = totalCents % n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

// Equal split: totalAmount is divided among the creator + every participant.
// The creator's own slot is computed but intentionally dropped -- this app
// only tracks what OTHER people owe the creator, not the creator's own share.
function computeEqualSplit(totalAmount, participantCount) {
  const slots = distributeCents(toCents(totalAmount), participantCount + 1);
  // Creator is always the last slot and (by construction, since remainder < n)
  // never the one absorbing the extra cent -- friends do.
  return slots.slice(0, participantCount).map(fromCents);
}

// Custom split: the creator names each participant's amount directly: no
// requirement that the amounts sum to totalAmount, since "you owe me 200,
// you owe me nothing" is a perfectly normal custom split.
function validateCustomAmounts(amounts) {
  for (const amount of amounts) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return 'Each participant amount_owed must be a non-negative number';
    }
  }
  return null;
}

// Itemized split: each item is either assigned to one participant (they owe
// its full amount) or left unassigned/shared (split evenly across everyone,
// creator included -- same dropped-creator-slot rule as the equal split).
// participantCount excludes the creator. Returns { amounts, error } where
// amounts is indexed the same as the participants array.
function computeItemizedSplit(items, participantCount) {
  const n = participantCount + 1;
  const totals = new Array(participantCount).fill(0);

  for (const item of items) {
    const cents = toCents(item.amount);
    if (item.participant_index === null || item.participant_index === undefined) {
      const slots = distributeCents(cents, n);
      for (let i = 0; i < participantCount; i++) totals[i] += slots[i];
      continue;
    }
    const idx = item.participant_index;
    if (!Number.isInteger(idx) || idx < 0 || idx >= participantCount) {
      return { error: `Item "${item.name}" has an invalid participant_index` };
    }
    totals[idx] += cents;
  }

  return { amounts: totals.map(fromCents) };
}

function sumItemCents(items) {
  return items.reduce((sum, item) => sum + toCents(item.amount), 0);
}

module.exports = { toCents, fromCents, distributeCents, computeEqualSplit, validateCustomAmounts, computeItemizedSplit, sumItemCents };
