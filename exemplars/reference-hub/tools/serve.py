#!/usr/bin/env python3
"""hub-workspace reference · preview server — Cloudflare-Pages-style routing so a local preview is faithful.
  /foo      -> foo.html        /foo/ -> foo/index.html        missing -> 404 listing what was tried
Serves _site/ (run tools/stage.sh first, or use `make preview`, which stages then serves).
Run: python3 tools/serve.py [port]   (default 8000)
"""
import http.server, socketserver, sys
from pathlib import Path
SITE = Path(__file__).resolve().parent.parent / "_site"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

class PagesHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(SITE), **k)
    def translate_path(self, path):
        resolved = super().translate_path(path); p = Path(resolved)
        if p.is_file(): return resolved
        if p.is_dir() and (p / "index.html").is_file(): return str(p / "index.html")
        if not p.suffix and p.with_suffix(".html").is_file(): return str(p.with_suffix(".html"))
        return resolved
    def send_error(self, code, message=None, explain=None):
        if code == 404:
            p = Path(super().translate_path(self.path.split('?')[0]))
            tried = [str(p), str(p / "index.html"), str(p.with_suffix(".html"))]
            explain = "Tried:\n" + "\n".join(tried)
        super().send_error(code, message, explain)
    def log_message(self, fmt, *args): sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

class Server(socketserver.TCPServer): allow_reuse_address = True
if __name__ == "__main__":
    if not SITE.is_dir():
        sys.exit("_site/ missing — run tools/stage.sh first (or `make preview`).")
    with Server(("127.0.0.1", PORT), PagesHandler) as httpd:
        print(f"Preview: http://127.0.0.1:{PORT}/  (serving {SITE})"); httpd.serve_forever()
