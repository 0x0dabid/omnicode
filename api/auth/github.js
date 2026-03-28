/**
 * GitHub OAuth handler for OmniCode
 *
 * Routes:
 *   GET /api/auth/github?code=XXX   -- OAuth callback, exchanges code for token + user info
 *   GET /api/auth/github/client      -- Returns { client_id } so frontend can build authorize URL
 *
 * Requires env vars on Vercel:
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 */

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  // Route: /api/auth/github/client -- return client_id for frontend
  if (req.url.includes("/client")) {
    if (!clientId) {
      return res.status(200).json({ error: "GITHUB_CLIENT_ID not set. Configure it in Vercel env vars.", client_id: null });
    }
    return res.status(200).json({ client_id: clientId });
  }

  // Route: /api/auth/github?code=XXX -- OAuth callback
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: "Missing code parameter" });
  }

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: "GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET env vars on Vercel.",
    });
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      return res.status(400).json({ error: tokenData.error_description || tokenData.error });
    }

    const accessToken = tokenData.access_token;

    // Fetch user profile
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const user = await userRes.json();
    if (user.message) return res.status(400).json({ error: user.message });

    // Fetch primary email (if not public)
    let email = user.email;
    if (!email) {
      try {
        const emailRes = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        const emails = await emailRes.json();
        const primary = emails.find(e => e.primary);
        if (primary) email = primary.email;
      } catch {}
    }

    // Build user data and redirect back to app
    const userData = JSON.stringify({
      name: user.name || user.login,
      login: user.login,
      email: email || "",
      avatar: user.avatar_url,
    });

    const origin = req.headers.origin || req.headers.referer?.split("/api")[0] || "";
    const redirectBase = origin || `https://${req.headers.host}`;
    const encoded = Buffer.from(userData).toString("base64url");

    res.setHeader("Location", `${redirectBase}/?auth=${encoded}`);
    return res.status(302).end();

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
