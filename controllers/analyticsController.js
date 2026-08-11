import Sale from "../models/Sale.js";
import Purchase from "../models/Purchase.js";
import Product from "../models/Product.js";
import { getPnLData } from "./pnlData.js";

// Builds a Mongo date-range match stage from ?from=&to= query params.
// Returns {} (no filter) when neither is given.
function dateRangeMatch(field, from, to) {
  if (!from && !to) return {};
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    // Treat `to` as inclusive of the whole day.
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return { [field]: range };
}

// GET /api/analytics/summary?from=&to=
// Single endpoint that powers the whole dashboard: KPI cards, all three
// charts, and the product performance table. An optional from/to range
// (inclusive) scopes everything except the warehouse valuation, which is
// always a current, point-in-time snapshot.
export const getSummary = async (req, res) => {
  try {
    const { from, to } = req.query;
    const saleDateMatch = dateRangeMatch("orderDate", from, to);
    const purchaseDateMatch = dateRangeMatch("orderDate", from, to);

    const [
      revenueResult,
      expenseResult,
      warehouseValueResult,
      productPerformance,
      expenseBreakdown,
      monthlyRevenue,
      deliveryResult,
    ] = await Promise.all([
      // 1. Total Delivered Revenue — the actual charged total per line
      // (lineTotal), which already reflects any discount. Never
      // quantity × unitPrice, and never includes delivery fees.
      Sale.aggregate([
        { $match: { status: "Delivered", ...saleDateMatch } },
        { $group: { _id: null, total: { $sum: "$lineTotal" } } },
      ]),

      // 2. Total Expenses & Costs
      Purchase.aggregate([
        { $match: { ...purchaseDateMatch } },
        { $group: { _id: null, total: { $sum: "$cost" } } },
      ]),

      // 4. Warehouse Asset Valuation (always current, not date-scoped)
      Product.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: { $multiply: ["$currentStock", "$retailPrice"] } },
          },
        },
      ]),

      // 5. Product Performance Breakdown
      Sale.aggregate([
        { $match: { status: "Delivered", ...saleDateMatch } },
        {
          $group: {
            _id: "$product",
            unitsSold: { $sum: "$quantity" },
            revenue: { $sum: "$lineTotal" },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $project: {
            _id: 0,
            productId: "$product._id",
            name: "$product.name",
            sku: "$product.sku",
            type: "$product.type",
            unitsSold: 1,
            revenue: 1,
          },
        },
        { $sort: { revenue: -1 } },
      ]),

      // 6. Expense Breakdown by category
      Purchase.aggregate([
        { $match: { ...purchaseDateMatch } },
        { $group: { _id: "$category", total: { $sum: "$cost" } } },
        { $project: { _id: 0, category: { $ifNull: ["$_id", "Miscellaneous"] }, total: 1 } },
        { $sort: { total: -1 } },
      ]),

      // Monthly Revenue Trajectory (delivered orders, last 12 calendar months
      // within the selected range, if any)
      Sale.aggregate([
        { $match: { status: "Delivered", ...saleDateMatch } },
        {
          $group: {
            _id: { year: { $year: "$orderDate" }, month: { $month: "$orderDate" } },
            revenue: { $sum: "$lineTotal" },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        { $limit: 12 },
        {
          $project: {
            _id: 0,
            year: "$_id.year",
            month: "$_id.month",
            revenue: 1,
          },
        },
      ]),

      // Delivery fees collected from customers vs. actual cost paid to the
      // courier, on delivered orders. deliveryFeeCharged is null for
      // historical records where the customer fee was never recorded
      // separately — those are counted (and reported) apart from genuine
      // $0 fees, never silently treated as $0.
      Sale.aggregate([
        { $match: { status: "Delivered", ...saleDateMatch } },
        {
          $group: {
            _id: null,
            feesCollected: { $sum: { $ifNull: ["$deliveryFeeCharged", 0] } },
            costPaid: { $sum: { $ifNull: ["$deliveryCost", 0] } },
            unknownFeeCount: {
              $sum: { $cond: [{ $eq: ["$deliveryFeeCharged", null] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const totalDeliveredRevenue = revenueResult[0]?.total || 0;
    const totalExpenses = expenseResult[0]?.total || 0;
    const warehouseAssetValuation = warehouseValueResult[0]?.total || 0;
    const deliveryFeesCollected = deliveryResult[0]?.feesCollected || 0;
    const deliveryCostTotal = deliveryResult[0]?.costPaid || 0;
    const ordersWithUnknownDeliveryFee = deliveryResult[0]?.unknownFeeCount || 0;
    // Money actually moving: product revenue + delivery fees customers
    // paid, minus purchases/expenses and what was paid to couriers.
    const netCashFlow =
      totalDeliveredRevenue + deliveryFeesCollected - totalExpenses - deliveryCostTotal;

    res.json({
      totalDeliveredRevenue,
      totalExpenses,
      deliveryFeesCollected,
      deliveryCostTotal,
      ordersWithUnknownDeliveryFee,
      netCashFlow,
      warehouseAssetValuation,
      productPerformance,
      expenseBreakdown,
      monthlyRevenue,
      range: { from: from || null, to: to || null },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/analytics/pnl?from=&to=
// A proper accrual-style Profit & Loss statement:
//   Revenue (delivered sales)
//   - Cost of Goods Sold (units sold x each product's cost price)
//   = Gross Profit
//   - Operating Expenses (non-inventory purchase categories: Meta Ads,
//     Packaging, Shipping, Miscellaneous...)
//   = Net Profit
// Inventory purchases themselves are capitalized (they become COGS only
// once the units are actually sold), so they're reported separately as
// "inventory capitalized" rather than folded into operating expenses.
export const getPnL = async (req, res) => {
  try {
    const { from, to } = req.query;
    const pnl = await getPnLData({ from, to });
    res.json(pnl);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
