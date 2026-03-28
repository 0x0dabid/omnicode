/**
 * GET /api/github/tree?owner=X&repo=Y&branch=Z
 * Returns the full recursive file tree of a repo in one call
 */
const GH_API = "https://api.github.com";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const { owner, repo, branch } = req.query;
  if (!token) return res.status(401).json({ error: "GitHub token required" });
  if (!owner || !repo) return res.status(400).json({ error: "owner and repo required" });

  const ref = branch || "HEAD";

  try {
    // Get the tree recursively
    const url = `${GH_API}/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
    const r = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "OmniCode",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return res.status(r.status).json({ error: t.slice(0, 200) });
    }

    const data = await r.json();

    // Filter to just files (not dirs), limit to 500 entries
    const files = (data.tree || [])
      .filter(f => f.type === "blob")
      .slice(0, 500)
      .map(f => ({ path: f.path, size: f.size }));

    // Identify key files to read contents for
    const keyFilePatterns = [
      'package.json', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml',
      'README.md', 'README', '.env.example', 'docker-compose.yml', 'Dockerfile',
      'tsconfig.json', 'vite.config.', 'next.config.', 'vercel.json',
      'index.html', 'main.py', 'app.py', 'main.js', 'index.js', 'index.ts',
      'src/App.', 'src/main.', 'src/index.', 'app/page.',
    ];

    const keyFiles = files.filter(f =>
      keyFilePatterns.some(p => f.path === p || f.path.endsWith(p) || f.path.includes(p.replace('.', '.')))
    ).slice(0, 15);

    // Fetch key file contents in parallel
    const contents = {};
    if (keyFiles.length > 0) {
      const fetches = keyFiles.map(async f => {
        try {
          const cr = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${f.path}?ref=${ref}`, {
            headers: {
              Authorization: `token ${token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "OmniCode",
            },
            signal: AbortSignal.timeout(5000),
          });
          if (cr.ok) {
            const cd = await cr.json();
            if (cd.content) {
              let content = Buffer.from(cd.content, "base64").toString("utf-8");
              // Truncate large files
              if (content.length > 3000) content = content.slice(0, 3000) + '\n... (truncated)';
              contents[f.path] = content;
            }
          }
        } catch {}
      });
      await Promise.all(fetches);
    }

    return res.status(200).json({
      fileCount: files.length,
      files,
      keyFiles: contents,
      truncated: data.truncated || false,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
