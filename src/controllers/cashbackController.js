const MIN_PURCHASE_PRICE = 50_00_000; // 50 Lakhs
const MAX_PURCHASE_PRICE = 5_00_00_000; // 5 Crores

const MIN_CASHBACK = 20_000;
const REF_PRICE = 1_00_00_000; // 1 Crore
const REF_CASHBACK = 50_000;

const CASHBACK_PER_RUPEE =
  (REF_CASHBACK - MIN_CASHBACK) / (REF_PRICE - MIN_PURCHASE_PRICE);

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const calculateCashback = (purchasePrice) => {
  const price = clamp(Number(purchasePrice) || 0, MIN_PURCHASE_PRICE, MAX_PURCHASE_PRICE);
  if (price <= MIN_PURCHASE_PRICE) return MIN_CASHBACK;
  return Math.round(MIN_CASHBACK + (price - MIN_PURCHASE_PRICE) * CASHBACK_PER_RUPEE);
};

const createCashback = (req, res) => {
  const { purchasePrice } = req.body || {};
  const numericPrice = clamp(
    Number(purchasePrice) || 0,
    MIN_PURCHASE_PRICE,
    MAX_PURCHASE_PRICE,
  );
  const cashback = calculateCashback(numericPrice);

  res.json({
    purchasePrice: numericPrice,
    cashback,
  });
};

module.exports = {
  createCashback,
};

