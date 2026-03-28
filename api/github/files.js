/**
 * GET /api/github/files?owner=X&repo=Y&path=Z - Browse repo files
 * Returns directory listing or single file content
 */
const GH_API = "https://api.github.com";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const { owner, repo, path, branch } = req.query;
  if (!token) return res.status(401).json({ error: "GitHub token required" });
  if (!owner || !repo) return res.status(400).json({ error: "owner and repo required" });

  const filePath = path || "";
  let url = `${GH_API}/repos/${owner}/${repo}/contents/${filePath}`;
  if (branch) url += `?ref=${branch}`;

  try {
    const r = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "OmniCode",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return res.status(r.status).json({ error: t.slice(0, 200) });
    }
    const data = await r.json();

    // Single file
    if (!Array.isArray(data)) {
      const content = data.content ? Buffer.from(data.content, "base64").toString("utf-8") : null;
      return res.status(200).json({
        type: "file",
        name: data.name,
        path: data.path,
        content,
        size: data.size,
        sha: data.sha,
      });
    }

    // Directory listing
    return res.status(200).json({
      type: "dir",
      files: data.map(f => ({
        name: f.name,
        path: f.path,
        type: f.type,
        size: f.size,
        sha: f.sha,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
