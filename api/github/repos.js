/**
 * GET /api/github/repos - List user's GitHub repos
 * Headers: Authorization: Bearer <github_token>
 */
const GH_API = "https://api.github.com";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "GitHub token required" });

  try {
    const r = await fetch(`${GH_API}/user/repos?sort=updated&per_page=50&type=all`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "OmniCode",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return res.status(r.status).json({ error: "GitHub auth failed", details: t.slice(0, 200) });
    }
    const repos = await r.json();
    return res.status(200).json(repos.map(r => ({
      full_name: r.full_name,
      name: r.name,
      description: r.description,
      language: r.language,
      private: r.private,
      updated_at: r.updated_at,
      default_branch: r.default_branch,
      html_url: r.html_url,
    })));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
