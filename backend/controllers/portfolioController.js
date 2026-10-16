const supabase = require('../config/supabase');
const { fetchPriceForHolding, MANUAL_ONLY_TYPES } = require('../services/marketPrices');

const ASSET_TYPES = ['stock', 'etf', 'crypto', 'mutual_fund', 'gold'];

function withComputedFields(holding) {
  const quantity = parseFloat(holding.quantity);
  const averageCost = parseFloat(holding.average_cost);
  const currentPrice = holding.current_price !== null ? parseFloat(holding.current_price) : null;
  const costBasis = quantity * averageCost;
  // Falls back to cost basis when there's no price yet (a brand-new manual-only
  // holding, or a live price that's never been fetched) -- market_value is
  // never null, so the frontend can always sum it without a branch.
  const marketValue = currentPrice !== null ? quantity * currentPrice : costBasis;
  const gain = marketValue - costBasis;
  return {
    ...holding,
    cost_basis: costBasis,
    market_value: marketValue,
    gain,
    gain_percent: costBasis > 0 ? (gain / costBasis) * 100 : 0,
  };
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

const portfolioController = {
  async getPortfolio(req, res) {
    try {
      const { line_user_id } = req.params;

      const { data: holdings, error } = await supabase
        .from('asset_holdings')
        .select('*')
        .eq('line_user_id', line_user_id)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const computed = (holdings || []).map(withComputedFields);
      const totalValue = computed.reduce((sum, h) => sum + h.market_value, 0);
      const totalCostBasis = computed.reduce((sum, h) => sum + h.cost_basis, 0);

      const allocationByType = {};
      for (const h of computed) {
        allocationByType[h.asset_type] = (allocationByType[h.asset_type] || 0) + h.market_value;
      }
      for (const type of Object.keys(allocationByType)) {
        allocationByType[type] = totalValue > 0 ? (allocationByType[type] / totalValue) * 100 : 0;
      }

      const emergencyFund = await fetchEmergencyFundStatus(line_user_id);

      res.json({
        success: true,
        holdings: computed,
        totals: { total_value: totalValue, total_cost_basis: totalCostBasis, total_gain: totalValue - totalCostBasis },
        allocation_by_type: allocationByType,
        emergency_fund: emergencyFund,
      });
    } catch (error) {
      console.error('Error in getPortfolio:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async createHolding(req, res) {
    try {
      const { line_user_id } = req.params;
      const { asset_type, symbol, name, quantity, average_cost, current_price } = req.body;

      if (!asset_type || !symbol || !quantity || average_cost === undefined) {
        return res.status(400).json({ error: 'asset_type, symbol, quantity, and average_cost are required' });
      }
      if (!ASSET_TYPES.includes(asset_type)) {
        return res.status(400).json({ error: `asset_type must be one of: ${ASSET_TYPES.join(', ')}` });
      }
      if (quantity <= 0 || average_cost < 0) {
        return res.status(400).json({ error: 'quantity must be positive and average_cost must be non-negative' });
      }

      const { data: holding, error } = await supabase
        .from('asset_holdings')
        .insert({
          line_user_id,
          asset_type,
          symbol,
          name: name || null,
          quantity,
          average_cost,
          current_price: current_price !== undefined ? current_price : null,
          priced_at: current_price !== undefined ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw error;

      res.status(201).json({ success: true, holding: withComputedFields(holding) });
    } catch (error) {
      console.error('Error in createHolding:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async updateHolding(req, res) {
    try {
      const { line_user_id, holding_id } = req.params;
      const { name, quantity, average_cost, current_price } = req.body;

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (quantity !== undefined) {
        if (quantity <= 0) return res.status(400).json({ error: 'quantity must be positive' });
        updateData.quantity = quantity;
      }
      if (average_cost !== undefined) {
        if (average_cost < 0) return res.status(400).json({ error: 'average_cost must be non-negative' });
        updateData.average_cost = average_cost;
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
      if (error) throw error;

      res.json({ success: true, holding: withComputedFields(holding) });
    } catch (error) {
      console.error('Error in updateHolding:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async deleteHolding(req, res) {
    try {
      const { line_user_id, holding_id } = req.params;
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

      const { data: holding, error: fetchError } = await supabase
        .from('asset_holdings')
        .select('*')
        .eq('id', holding_id)
        .eq('line_user_id', line_user_id)
        .single();
      if (fetchError || !holding) return res.status(404).json({ error: 'Holding not found' });

      const price = await fetchPriceForHolding(holding.asset_type, holding.symbol);

      const { data: updated, error } = await supabase
        .from('asset_holdings')
        .update({ current_price: price, priced_at: new Date().toISOString() })
        .eq('id', holding_id)
        .select()
        .single();
      if (error) throw error;

      res.json({ success: true, holding: withComputedFields(updated) });
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
            const price = await fetchPriceForHolding(holding.asset_type, holding.symbol);
            await supabase.from('asset_holdings').update({ current_price: price, priced_at: new Date().toISOString() }).eq('id', holding.id);
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
};

module.exports = portfolioController;
