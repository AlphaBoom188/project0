// Pure FIFO lot math for the investment portfolio (no DB access) -- lots are
// the source of truth for a holding, and asset_holdings.quantity/average_cost
// are only a cache of what computeLotSummary() says about the open position.
//
// Rules (decided with the owner, see migration 015's header comment):
//   * Lots are replayed in trade order: trade_date, then created_at.
//   * Sells consume buys FIFO. A buy's fee adds to its cost basis; a sell's
//     fee reduces its proceeds. Realized gain = proceeds - matched FIFO cost.
//   * A buy lot is "closed" once sells have fully consumed it. Win rate =
//     closed lots with a positive realized gain / closed lots (null with none).
//   * A sell larger than the shares held at that point is invalid.
//
// Quantities are tracked in integer micro-shares (6 decimals, matching the
// NUMERIC(18, 6) column) so FIFO matching never drifts on float error.

const QTY_SCALE = 1e6;
const toUnits = (quantity) => Math.round(parseFloat(quantity) * QTY_SCALE);
const round6 = (value) => Math.round(value * 1e6) / 1e6;

class LotValidationError extends Error {}

// Trade order. A lot without created_at (one being validated before it is
// inserted) sorts last within its day, which is where the insert will put it.
function sortLots(lots) {
  return [...lots].sort((a, b) => {
    if (a.trade_date !== b.trade_date) return a.trade_date < b.trade_date ? -1 : 1;
    const ta = a.created_at ? new Date(a.created_at).getTime() : Infinity;
    const tb = b.created_at ? new Date(b.created_at).getTime() : Infinity;
    return ta - tb;
  });
}

// What a lot moved in cash, in the holding's currency: a buy cost
// shares x price + fee, a sell brought in shares x price - fee.
function lotTotal(lot) {
  const gross = parseFloat(lot.quantity) * parseFloat(lot.price);
  const fee = parseFloat(lot.fee || 0);
  return round6(lot.side === 'buy' ? gross + fee : gross - fee);
}

// Replays the lots FIFO. Throws LotValidationError (message safe to show the
// user) when a sell exceeds the shares held at that point in the history.
// Returns the open-position figures plus per-lot state keyed by lot id
// (lots without an id are still validated, just not reported per lot).
function computeLotSummary(lots) {
  const buys = []; // FIFO queue: { lot, units, remaining, cost, proceeds }
  const perLot = {};
  let realizedGain = 0;
  let fees = 0;
  let totalBuyCost = 0;

  for (const lot of sortLots(lots)) {
    const units = toUnits(lot.quantity);
    const fee = parseFloat(lot.fee || 0);
    fees += fee;

    if (lot.side === 'buy') {
      const cost = parseFloat(lot.quantity) * parseFloat(lot.price) + fee;
      totalBuyCost += cost;
      buys.push({ lot, units, remaining: units, cost, proceeds: 0 });
      continue;
    }

    const available = buys.reduce((sum, b) => sum + b.remaining, 0);
    if (units > available) {
      throw new LotValidationError(
        `Sell of ${units / QTY_SCALE} on ${lot.trade_date} exceeds the ${available / QTY_SCALE} shares held at that date`
      );
    }

    const proceeds = parseFloat(lot.quantity) * parseFloat(lot.price) - fee;
    let need = units;
    let matchedCost = 0;
    for (const buy of buys) {
      if (need === 0) break;
      if (buy.remaining === 0) continue;
      const take = Math.min(buy.remaining, need);
      const takeCost = (buy.cost * take) / buy.units;
      matchedCost += takeCost;
      buy.proceeds += (proceeds * take) / units;
      buy.remaining -= take;
      need -= take;
    }
    realizedGain += proceeds - matchedCost;
    if (lot.id) perLot[lot.id] = { realized_gain: round6(proceeds - matchedCost) };
  }

  let openUnits = 0;
  let openCostBasis = 0;
  let lotsOpen = 0;
  let lotsClosed = 0;
  let wins = 0;
  for (const buy of buys) {
    const consumedCost = (buy.cost * (buy.units - buy.remaining)) / buy.units;
    const closed = buy.remaining === 0;
    if (closed) {
      lotsClosed++;
      if (buy.proceeds - buy.cost > 0) wins++;
    } else {
      lotsOpen++;
      openUnits += buy.remaining;
      openCostBasis += (buy.cost * buy.remaining) / buy.units;
    }
    if (buy.lot.id) {
      perLot[buy.lot.id] = {
        remaining_quantity: buy.remaining / QTY_SCALE,
        is_closed: closed,
        // Realized on the part of this buy that sells have consumed so far.
        realized_gain: round6(buy.proceeds - consumedCost),
      };
    }
  }

  const quantity = openUnits / QTY_SCALE;
  return {
    quantity,
    cost_basis: round6(openCostBasis),
    average_cost: quantity > 0 ? round6(openCostBasis / quantity) : 0,
    realized_gain: round6(realizedGain),
    fees: round6(fees),
    total_buy_cost: round6(totalBuyCost),
    lots_open: lotsOpen,
    lots_closed: lotsClosed,
    win_rate: lotsClosed > 0 ? round6((wins / lotsClosed) * 100) : null,
    per_lot: perLot,
  };
}

module.exports = { computeLotSummary, sortLots, lotTotal, LotValidationError, round6 };
