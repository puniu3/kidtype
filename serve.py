#!/usr/bin/env python3
# 開発用サーバ: キャッシュ無効化ヘッダを付けて配信する。
# iPad 等のブラウザが ES モジュールをキャッシュして「変更が反映されない」のを防ぐ。
#   python3 serve.py [PORT]   (既定 8000, 0.0.0.0 で待受)
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass  # 静かに


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('0.0.0.0', PORT), NoCacheHandler) as httpd:
    print(f'serving (no-cache) on http://0.0.0.0:{PORT}')
    httpd.serve_forever()
