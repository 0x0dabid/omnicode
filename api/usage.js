/**
 * Z.ai Usage API proxy for OmniCode
 * Fetches live subscription and usage data from Z.ai's billing endpoints.
 *
 * POST /api/usage
 * Body: { api_key: string }
 *
 * Tries multiple Z.ai/Zhipu billing endpoints and returns whatever we can get.
 */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { api_key } = req.body;
  if (!api_key) return res.status(400).json({ error: "API key required" });

  const now = new Date();
  const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);

  const fmtDate = (d) => d.toISOString().split("T")[0];
  const fmtMs = (d) => d.getTime();

  const headers = {
    "Authorization": `Bearer ${api_key}`,
    "Content-Type": "application/json",
  };

  // Try multiple possible Z.ai billing/usage endpoints
  const attempts = [
    // Zhipu AI official billing usage endpoint
    {
      name: "billing_usage",
      url: `https://open.bigmodel.cn/api/paas/v4/billing/usage?start_time=${fmtDate(weekStart)}&end_time=${fmtDate(now)}`,
      headers,
    },
    // Z.ai domain variant
    {
      name: "zai_billing",
      url: `https://api.z.ai/api/paas/v4/billing/usage?start_time=${fmtDate(weekStart)}&end_time=${fmtDate(now)}`,
      headers,
    },
    // Try subscription/info endpoint
    {
      name: "subscription",
      url: `https://open.bigmodel.cn/api/paas/v4/billing/subscription`,
      headers,
    },
    // Try the z.ai coding variant
    {
      name: "coding_usage",
      url: `https://api.z.ai/api/coding/paas/v4/billing/usage?start_time=${fmtDate(weekStart)}&end_time=${fmtDate(now)}`,
      headers,
    },
    // User info / quota endpoint
    {
      name: "user_info",
      url: `https://open.bigmodel.cn/api/paas/v4/user/info`,
      headers,
    },
  ];

  const results = {};
  let anySuccess = false;

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        method: "GET",
        headers: attempt.headers,
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const data = await response.json();
        results[attempt.name] = data;
        anySuccess = true;
      } else {
        const text = await response.text().catch(() => "");
        results[attempt.name] = { error: true, status: response.status, body: text.substring(0, 200) };
      }
    } catch (e) {
      results[attempt.name] = { error: true, message: e.message };
    }
  }

  // Parse results into a clean structure for the frontend
  const usage = {
    live: anySuccess,
    balance: null,
    totalTokens: null,
    totalRequests: null,
    subscription: null,
    weeklyTokens: null,
    weeklyRequests: null,
    fiveHourTokens: null,
    fiveHourRequests: null,
    raw: results,
  };

  // Extract data from whatever endpoints responded
  for (const [key, data] of Object.entries(results)) {
    if (data.error) continue;

    // Common Zhipu billing response formats
    if (data.data) {
      const d = data.data;

      // Total balance/quota
      if (d.total_balance !== undefined) usage.balance = d.total_balance;
      if (d.balance !== undefined) usage.balance = d.balance;
      if (d.gift_balance !== undefined) usage.balance = (usage.balance || 0) + d.gift_balance;

      // Usage data arrays
      if (Array.isArray(d)) {
        // Might be daily usage entries
        const totalTokens = d.reduce((s, e) => s + (e.usage || e.tokens || e.total_tokens || 0), 0);
        const totalReqs = d.reduce((s, e) => s + (e.count || e.requests || e.num_requests || 0), 0);
        if (totalTokens) usage.weeklyTokens = totalTokens;
        if (totalReqs) usage.weeklyRequests = totalReqs;

        // Filter for 5-hour window
        const fiveHourMs = fiveHoursAgo.getTime();
        const recent = d.filter(e => {
          const ts = new Date(e.date || e.time || e.start_time || 0).getTime();
          return ts > fiveHourMs;
        });
        if (recent.length > 0) {
          usage.fiveHourTokens = recent.reduce((s, e) => s + (e.usage || e.tokens || e.total_tokens || 0), 0);
          usage.fiveHourRequests = recent.reduce((s, e) => s + (e.count || e.requests || e.num_requests || 0), 0);
        }

        usage.dailyData = d;
      }
    }

    // Subscription info
    if (data.subscription || data.plan) {
      usage.subscription = data.subscription || data.plan;
    }

    // Direct fields
    if (data.total_usage !== undefined) usage.totalTokens = data.total_usage;
    if (data.total_tokens !== undefined) usage.totalTokens = data.total_tokens;
    if (data.total_requests !== undefined) usage.totalRequests = data.total_requests;
    if (data.balance !== undefined && usage.balance === null) usage.balance = data.balance;
    if (data.quota !== undefined) usage.balance = data.quota;
  }

  return res.status(200).json(usage);
}
