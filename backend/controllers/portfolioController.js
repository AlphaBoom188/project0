const supabase = require('../config/supabase');
const { fetchQuoteForHolding, MANUAL_ONLY_TYPES } = require('../services/marketPrices');
const { getUsdThbRate } = require('../services/fxRates');
const { computeLotSummary, sortLots, lotTotal, LotValidationError, round6 } = require('../services/lotMath');
const { getBangkokYmd } = require('../services/bangkokDay');

const ASSET_TYPES = ['stock', 'etf', 'crypto', 'mutual_fund', 'gold'];
const CURRENCIES = ['THB', 'USD'];

// Thai listings (.BK), mutual funds and gold are THB; everything else (US
// stocks/ETFs, crypto) is USD -- same rule migration 015 backfilled with.
function defaultCurrency(assetType, symbol) {
  return /\.BK$/i.test(symbol) || MANUAL_ONLY_TYPES.includes(assetType) ? 'THB' : 'USD';
}

// trade_date is an Asia/Bangkok calendar date; a future one would replay the
// lot history out of order with trades that haven't happened yet.
function validateTradeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new LotValidationError('trade_date must be a valid YYYY-MM-DD date');
  }
  if (value > getBangkokYmd()) throw new LotValidationError('trade_date cannot be in the future');
  return value;
}

const isBlank = (value) => value === undefined || value === null || value === '';

// Validates a lot body. With `base` (an existing lot, for PUT), any field the
// body leaves out keeps its current value. Throws LotValidationError -> 400.
function parseLotInput(body, base = null) {
  const pick = (key) => (body[key] !== undefined ? body[key] : base ? base[key] : undefined);

  const side = pick('side');
  if (!['buy', 'sell'].includes(side)) throw new LotValidationError("side must be 'buy' or 'sell'");

  const quantity = Number(pick('quantity'));
  if (isBlank(pick('quantity')) || !Number.isFinite(quantity) || Math.round(quantity * 1e6) <= 0) {
    throw new LotValidationError('quantity must be a positive number (up to 6 decimals)');
  }
  const price = Number(pick('price'));
  if (isBlank(pick('price')) || !Number.isFinite(price) || price < 0) {
    throw new LotValidationError('price must be a non-negative number');
  }
  const fee = isBlank(pick('fee')) ? 0 : Number(pick('fee'));
  if (!Number.isFinite(fee) || fee < 0) throw new LotValidationError('fee must be a non-negative number');

  const tradeDate = validateTradeDate(isBlank(pick('trade_date')) ? getBangkokYmd() : pick('trade_date'));

  const comment = pick('comment');
  if (!isBlank(comment) && (typeof comment !== 'string' || comment.length > 200)) {
    throw new LotValidationError('comment must be text of at most 200 characters');
  }

  return { side, quantity: round6(quantity), price, fee, trade_date: tradeDate, comment: isBlank(comment) ? null : comment.trim() || null };
}

// Everything the app shows about a holding, derived from its lots on every
// read (nothing here is stored except the quantity/average_cost cache).
// Figures are in the holding's own currency; the *_thb versions use `fxRate`
// for USD holdings and are null when no rate is available.
function withComputedFields(holding, lots, fxRate) {
  const s = computeLotSummary(lots);
  const currentPrice = holding.current_price !== null ? parseFloat(holding.current_price) : null;
  const previousClose = holding.previous_close !== null && holding.previous_close !== undefined ? parseFloat(holding.previous_close) : null;
  // Falls back to cost basis when there's no price yet (a brand-new manual-only
  // holding, or a live price that's never been fetched) -- market_value is
  // never null, so the frontend can always sum it without a branch.
  const marketValue = currentPrice !== null ? round6(s.quantity * currentPrice) : s.cost_basis;
  const unrealizedGain = round6(marketValue - s.cost_basis);
  const totalGain = round6(unrealizedGain + s.realized_gain);
  const hasDayGain = currentPrice !== null && previousClose !== null;
  const dayGain = hasDayGain ? round6((currentPrice - previousClose) * s.quantity) : null;

  const rate = holding.currency === 'THB' ? 1 : fxRate;
  const thb = (value) => (value === null || rate === null || rate === undefined ? null : round6(value * rate));
  const percent = (value, base) => (base > 0 ? round6((value / base) * 100) : 0);

  return {
    ...holding,
    quantity: s.quantity,
    average_cost: s.average_cost,
    cost_basis: s.cost_basis,
    market_value: marketValue,
    // gain / gain_percent predate lots and stay as the unrealized figures.
    gain: unrealizedGain,
    gain_percent: percent(unrealizedGain, s.cost_basis),
    unrealized_gain: unrealizedGain,
    unrealized_gain_percent: percent(unrealizedGain, s.cost_basis),
    realized_gain: s.realized_gain,
    fees: s.fees,
    day_gain: dayGain,
    day_gain_percent: hasDayGain && previousClose > 0 ? round6(((currentPrice - previousClose) / previousClose) * 100) : null,
    total_gain: totalGain,
    // Every buy's cost is either still open or matched to a sell, so total
    // buy cost is the whole amount ever invested in this holding.
    total_gain_percent: percent(totalGain, s.total_buy_cost),
    win_rate: s.win_rate,
    lots_open: s.lots_open,
    lots_closed: s.lots_closed,
    market_value_thb: thb(marketValue),
    cost_basis_thb: thb(s.cost_basis),
    unrealized_gain_thb: thb(unrealizedGain),
    realized_gain_thb: thb(s.realized_gain),
    total_gain_thb: thb(totalGain),
    day_gain_thb: thb(dayGain),
    fees_thb: thb(s.fees),
  };
}

// For single-holding responses: THB fields are a nice-to-have there, so a
// missing rate leaves them null instead of failing the write that just happened.
const optionalFxRate = () => getUsdThbRate().catch(() => null);

async function fetchOwnedHolding(lineUserId, holdingId) {
  const { data, error } = await supabase
    .from('asset_holdings')
    .select('*')
    .eq('id', holdingId)
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchHoldingLots(holdingId) {
  const { data, error } = await supabase.from('asset_lots').select('*').eq('holding_id', holdingId);
  if (error) throw error;
  return data || [];
}

// asset_holdings.quantity/average_cost are a cache of the open position, so
// every lot write refreshes them from the summary it was validated with.
async function saveHoldingCache(holdingId, summary) {
  const { data, error } = await supabase
    .from('asset_holdings')
    .update({ quantity: summary.quantity, average_cost: summary.average_cost })
    .eq('id', holdingId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Per-lot state for one holding's lot list, newest trade first.
function lotsWithState(lots) {
  const { per_lot: perLot } = computeLotSummary(lots);
  return sortLots(lots)
    .reverse()
    .map((lot) => ({ ...lot, total: lotTotal(lot), ...perLot[lot.id] }));
}

async function fetchEmergencyFundStatus(lineUserId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('emergency_fund_goal_amount, emergency_fund_account_id, accounts:emergency_fund_account_id ( id, account_name, balance )')
    .eq('line_user_id', lineUserId)
    .single();
  if (error || !user) return null;

  const goalAmount = user.emergency_fund_goal_amount !== null ? parseFloat(user.emergency_fund_goal_amount) : null;
  const currentAmount = user.accounts ? parseFloat(user.accounts.balance) : null;

  return {
    goal_amount: goalAmount,
    account_id: user.emergency_fund_account_id,
    account_name: user.accounts ? user.accounts.account_name : null,
    current_amount: currentAmount,
    percent_funded: goalAmount && currentAmount !== null ? Math.min(100, (currentAmount / goalAmount) * 100) : null,
  };
}

// Lot writes: validation failures are 400s, anything else a 500.
function sendLotError(res, where, error) {
  if (error instanceof LotValidationError) return res.status(400).json({ error: error.message });
  console.error(`Error in ${where}:`, error);
  return res.status(500).json({ error: error.message });
}

async function saveQuote(holding) {
  const quote = await fetchQuoteForHolding(holding.asset_type, holding.symbol, holding.currency);
  const { data, error } = await supabase
    .from('asset_holdings')
    .update({ current_price: quote.price, previous_close: quote.previousClose, priced_at: new Date().toISOString() })
    .eq('id', holding.id)
    .select()
    .single();
  if (error) throw error;
  return { updated: data, price: quote.price };
}

const portfolioController = {
  async getPortfolio(req, res) {
    try {
      const { line_user_id } = req.params;

      const [{ data: holdings, error }, { data: lots, error: lotsError }] = await Promise.all([
        supabase.from('asset_holdings').select('*').eq('line_user_id', line_user_id).order('created_at', { ascending: true }),
        supabase.from('asset_lots').select('*').eq('line_user_id', line_user_id),
      ]);
      if (error) throw error;
      if (lotsError) throw lotsError;

      // Totals are in THB, so a USD holding without a rate can't be summed --
      // that's a clear error, never a silent 1:1. Without USD holdings the
      // rate is only informational.
      const hasUsd = (holdings || []).some((h) => h.currency !== 'THB');
      let fxRate = null;
      try {
        fxRate = await getUsdThbRate();
      } catch (fxError) {
        if (hasUsd) return res.status(502).json({ error: fxError.message });
      }

      const lotsByHolding = {};
      for (const lot of lots || []) (lotsByHolding[lot.holding_id] = lotsByHolding[lot.holding_id] || []).push(lot);
      const computed = (holdings || []).map((h) => withComputedFields(h, lotsByHolding[h.id] || [], fxRate));

      const sum = (key) => round6(computed.reduce((acc, h) => acc + h[key], 0));
      const totalValue = sum('market_value_thb');
      const totalCostBasis = sum('cost_basis_thb');
      const unrealizedGain = sum('unrealized_gain_thb');
      const realizedGain = sum('realized_gain_thb');
      const dayGains = computed.filter((h) => h.day_gain_thb !== null);
      const dayGain = dayGains.length > 0 ? round6(dayGains.reduce((acc, h) => acc + h.day_gain_thb, 0)) : null;

      const allocationByType = {};
      for (const h of computed) {
        allocationByType[h.asset_type] = (allocationByType[h.asset_type] || 0) + h.market_value_thb;
      }
      for (const type of Object.keys(allocationByType)) {
        allocationByType[type] = totalValue > 0 ? (allocationByType[type] / totalValue) * 100 : 0;
      }

      const emergencyFund = await fetchEmergencyFundStatus(line_user_id);

      res.json({
        success: true,
        holdings: computed,
        fx_usd_thb: fxRate,
        // All in THB. total_gain = unrealized + realized (closed positions count).
        totals: {
          currency: 'THB',
          total_value: totalValue,
          total_cost_basis: totalCostBasis,
          unrealized_gain: unrealizedGain,
          realized_gain: realizedGain,
          total_gain: round6(unrealizedGain + realizedGain),
          day_gain: dayGain,
          fees: sum('fees_thb'),
        },
        allocation_by_type: allocationByType,
        emergency_fund: emergencyFund,
      });
    } catch (error) {
      console.error('Error in getPortfolio:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Still takes the pre-lots body (quantity + average_cost): the holding is
  // created with one opening buy lot for it, dated trade_date (default today).
  async createHolding(req, res) {
    try {
      const { line_user_id } = req.params;
      const { asset_type, symbol, name, quantity, average_cost, current_price, currency, trade_date } = req.body;

      if (!asset_type || !symbol || !quantity || average_cost === undefined) {
        return res.status(400).json({ error: 'asset_type, symbol, quantity, and average_cost are required' });
      }
      if (!ASSET_TYPES.includes(asset_type)) {
        return res.status(400).json({ error: `asset_type must be one of: ${ASSET_TYPES.join(', ')}` });
      }
      if (quantity <= 0 || average_cost < 0) {
        return res.status(400).json({ error: 'quantity must be positive and average_cost must be non-negative' });
      }
      if (currency !== undefined && !CURRENCIES.includes(currency)) {
        return res.status(400).json({ error: `currency must be one of: ${CURRENCIES.join(', ')}` });
      }
      const opening = parseLotInput({ side: 'buy', quantity, price: average_cost, trade_date });

      const { data: holding, error } = await supabase
        .from('asset_holdings')
        .insert({
          line_user_id,
          asset_type,
          symbol,
          name: name || null,
          currency: currency || defaultCurrency(asset_type, symbol),
          quantity: opening.quantity,
          average_cost,
          current_price: current_price !== undefined ? current_price : null,
          priced_at: current_price !== undefined ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw error;

      const { data: lot, error: lotError } = await supabase
        .from('asset_lots')
        .insert({ ...opening, line_user_id, holding_id: holding.id })
        .select()
        .single();
      if (lotError) {
        // A holding without its opening lot would read as 0 shares -- undo it.
        await supabase.from('asset_holdings').delete().eq('id', holding.id);
        throw lotError;
      }

      res.status(201).json({ success: true, holding: withComputedFields(holding, [lot], await optionalFxRate()) });
    } catch (error) {
      sendLotError(res, 'createHolding', error);
    }
  },

  // name / current_price / currency only: quantity and average_cost are the
  // lots' cache now, so changing them means adding or editing a lot.
  async updateHolding(req, res) {
    try {
      const { line_user_id, holding_id } = req.params;
      const { name, quantity, average_cost, current_price, currency } = req.body;

      if (quantity !== undefined || average_cost !== undefined) {
        return res.status(400).json({ error: 'quantity and average_cost come from the holding\'s lots -- add or edit a lot instead' });
      }
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (currency !== undefined) {
        if (!CURRENCIES.includes(currency)) return res.status(400).json({ error: `currency must be one of: ${CURRENCIES.join(', ')}` });
        updateData.currency = currency;
      }
      if (current_price !== undefined) {
        updateData.current_price = current_price;
        updateData.priced_at = new Date().toISOString();
      }

      const { data: holding, error } = await supabase
        .from('asset_holdings')
        .update(updateData)
        .eq('id', holding_id)
        .eq('line_user_id', line_user_id)
        .select()
        .single();
      if (error) {
        // .single() on zero matched rows (unknown id, or not this user's) -> PGRST116
        if (error.code === 'PGRST116') return res.status(404).json({ error: 'Holding not found' });
        throw error;
      }

      res.json({ success: true, holding: withComputedFields(holding, await fetchHoldingLots(holding_id), await optionalFxRate()) });
    } catch (error) {
      console.error('Error in updateHolding:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async deleteHolding(req, res) {
    try {
      const { line_user_id, holding_id } = req.params;
      // asset_lots rows go with it (ON DELETE CASCADE).
      const { error } = await supabase.from('asset_holdings').delete().eq('id', holding_id).eq('line_user_id', line_user_id);
      if (error) throw error;
      res.json({ success: true, message: 'Holding deleted' });
    } catch (error) {
      console.error('Error in deleteHolding:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async refreshHoldingPrice(req, res) {
    try {
      const { line_user_id, holding_id } = req.params;

      const holding = await fetchOwnedHolding(line_user_id, holding_id);
      if (!holding) return res.status(404).json({ error: 'Holding not found' });

      const { updated } = await saveQuote(holding);
      res.json({ success: true, holding: withComputedFields(updated, await fetchHoldingLots(holding_id), await optionalFxRate()) });
    } catch (error) {
      console.error('Error in refreshHoldingPrice:', error);
      res.status(400).json({ error: error.message });
    }
  },

  // Refreshes every stock/etf/crypto holding for this user. One holding's
  // upstream failure (unofficial, keyless APIs -- expected to happen
  // sometimes) doesn't block the rest; failures are reported back per-symbol
  // rather than silently dropped.
  async refreshAllPrices(req, res) {
    try {
      const { line_user_id } = req.params;

      const { data: holdings, error } = await supabase
        .from('asset_holdings')
        .select('*')
        .eq('line_user_id', line_user_id)
        .not('asset_type', 'in', `(${MANUAL_ONLY_TYPES.join(',')})`);
      if (error) throw error;

      const results = await Promise.all(
        (holdings || []).map(async (holding) => {
          try {
            const { price } = await saveQuote(holding);
            return { symbol: holding.symbol, success: true, price };
          } catch (err) {
            return { symbol: holding.symbol, success: false, error: err.message };
          }
        })
      );

      res.json({ success: true, results });
    } catch (error) {
      console.error('Error in refreshAllPrices:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // ---- Lots ----

  // Every lot the user has, newest trade first, with its holding's symbol /
  // name / currency / asset_type (the Transactions tab's "Investments" view).
  async listAllLots(req, res) {
    try {
      const { line_user_id } = req.params;
      const { data, error } = await supabase
        .from('asset_lots')
        .select('*, holding:asset_holdings ( symbol, name, currency, asset_type )')
        .eq('line_user_id', line_user_id)
        .order('trade_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, lots: (data || []).map((lot) => ({ ...lot, total: lotTotal(lot) })) });
    } catch (error) {
      console.error('Error in listAllLots:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async listHoldingLots(req, res) {
    try {
      const { line_user_id, holding_id } = req.params;
      const holding = await fetchOwnedHolding(line_user_id, holding_id);
      if (!holding) return res.status(404).json({ error: 'Holding not found' });

      const lots = await fetchHoldingLots(holding_id);
      res.json({ success: true, holding: withComputedFields(holding, lots, await optionalFxRate()), lots: lotsWithState(lots) });
    } catch (error) {
      console.error('Error in listHoldingLots:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Each lot write replays the holding's whole history with the change applied
  // first; only if that history is still valid (no sell exceeding what was
  // held at the time) is anything written, then the holding cache refreshed.
  // Read-validate-write rather than a transaction -- fine at one user per
  // line_user_id, same tradeoff as services/accountBalance.js.
  async createLot(req, res) {
    try {
      const { line_user_id, holding_id } = req.params;
      const holding = await fetchOwnedHolding(line_user_id, holding_id);
      if (!holding) return res.status(404).json({ error: 'Holding not found' });

      const input = parseLotInput(req.body);
      const lots = await fetchHoldingLots(holding_id);
      const summary = computeLotSummary([...lots, input]);

      const { data: lot, error } = await supabase
        .from('asset_lots')
        .insert({ ...input, line_user_id, holding_id })
        .select()
        .single();
      if (error) throw error;
      const cached = await saveHoldingCache(holding_id, summary);

      const allLots = [...lots, lot];
      res.status(201).json({
        success: true,
        lot: { ...lot, total: lotTotal(lot) },
        holding: withComputedFields(cached, allLots, await optionalFxRate()),
        lots: lotsWithState(allLots),
      });
    } catch (error) {
      sendLotError(res, 'createLot', error);
    }
  },

  async updateLot(req, res) {
    try {
      const { line_user_id, lot_id } = req.params;
      const { data: existing, error: fetchError } = await supabase
        .from('asset_lots')
        .select('*')
        .eq('id', lot_id)
        .eq('line_user_id', line_user_id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!existing) return res.status(404).json({ error: 'Lot not found' });

      const input = parseLotInput(req.body, existing);
      const lots = await fetchHoldingLots(existing.holding_id);
      const summary = computeLotSummary(lots.map((l) => (l.id === lot_id ? { ...l, ...input } : l)));

      const { data: lot, error } = await supabase.from('asset_lots').update(input).eq('id', lot_id).select().single();
      if (error) throw error;
      const cached = await saveHoldingCache(existing.holding_id, summary);

      const allLots = lots.map((l) => (l.id === lot_id ? lot : l));
      res.json({
        success: true,
        lot: { ...lot, total: lotTotal(lot) },
        holding: withComputedFields(cached, allLots, await optionalFxRate()),
        lots: lotsWithState(allLots),
      });
    } catch (error) {
      sendLotError(res, 'updateLot', error);
    }
  },

  async deleteLot(req, res) {
    try {
      const { line_user_id, lot_id } = req.params;
      const { data: existing, error: fetchError } = await supabase
        .from('asset_lots')
        .select('*')
        .eq('id', lot_id)
        .eq('line_user_id', line_user_id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!existing) return res.status(404).json({ error: 'Lot not found' });

      const remaining = (await fetchHoldingLots(existing.holding_id)).filter((l) => l.id !== lot_id);
      const summary = computeLotSummary(remaining); // e.g. deleting a buy that a later sell depends on -> 400

      const { error } = await supabase.from('asset_lots').delete().eq('id', lot_id);
      if (error) throw error;
      const cached = await saveHoldingCache(existing.holding_id, summary);

      res.json({
        success: true,
        message: 'Lot deleted',
        holding: withComputedFields(cached, remaining, await optionalFxRate()),
        lots: lotsWithState(remaining),
      });
    } catch (error) {
      sendLotError(res, 'deleteLot', error);
    }
  },
};

module.exports = portfolioController;
