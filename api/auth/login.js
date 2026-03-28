/**
 * GitHub OAuth login redirect
 * GET /api/auth/login -> redirects to GitHub authorize page
 *
 * Requires env var: GITHUB_CLIENT_ID
 */

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).end();
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: "GITHUB_CLIENT_ID not set in Vercel env vars." });
  }

  const origin = req.headers.origin || req.headers.referer?.split("/api")[0] || "";
  const redirectBase = origin || `https://${req.headers.host}`;
  const redirectUri = `${redirectBase}/api/auth/github`;
  const scope = "read:user user:email";

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

  res.setHeader("Location", url);
  return res.status(302).end();
}
