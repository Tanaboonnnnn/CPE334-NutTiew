#!/usr/bin/env python3
"""Minimal healthy HTTP fixture for offline smoke tests (GH-05).

Serves a valid NutTiew-like response:
  GET /            -> 200 text/html
  GET /api/ready   -> 200 application/json {"status":"ready"}

Prints the port it bound to on stdout, then serves forever.  Used by
run_release_negative_tests.sh so the REAL smoke_test.py can run against a local
healthy target (proving the smoke script executes and its exit code is real).
"""
import http.server
import socketserver
import sys


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path == "/api/ready":
            body = b'{"status":"ready"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
        else:
            body = b"<!doctype html><html>NutTiew</html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def main() -> int:
    port = 0
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    port_file = None
    if len(sys.argv) > 2:
        port_file = sys.argv[2]
    srv = socketserver.TCPServer(("127.0.0.1", port), Handler)
    chosen = srv.server_address[1]
    # Report the chosen port to the caller: stdout AND/OR a port file.
    print(chosen, flush=True)
    if port_file:
        with open(port_file, "w", encoding="utf-8") as fh:
            fh.write(str(chosen))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())