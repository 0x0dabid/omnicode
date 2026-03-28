/**
 * POST /api/github/commit - Commit a file to GitHub
 * Body: { owner, repo, path, content, message, branch, sha? }
 */
const GH_API = "https://api.github.com";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const { owner, repo, path, content, message, branch, sha } = req.body;
  if (!token) return res.status(401).json({ error: "GitHub token required" });
  if (!owner || !repo || !path || content === undefined) {
    return res.status(400).json({ error: "owner, repo, path, content required" });
  }

  const url = `${GH_API}/repos/${owner}/${repo}/contents/${path}`;
  const body = {
    message: message || `Update ${path}`,
    content: Buffer.from(content).toString("base64"),
    ...(branch ? { branch } : {}),
    ...(sha ? { sha } : {}),
  };

  try {
    const r = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "OmniCode",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message || "Commit failed" });
    return res.status(200).json({
      success: true,
      commit: data.commit?.sha,
      url: data.content?.html_url,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
