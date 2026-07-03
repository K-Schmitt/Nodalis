import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { join, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

export function injectRuntimeConfig(html: string, apiBaseUrl: string): string {
  const script = `<script>window.__ARCHI_OS__=${JSON.stringify({ apiBaseUrl })};</script>`;
  return html.includes('</head>') ? html.replace('</head>', `${script}</head>`) : script + html;
}

export function resolveSafePath(distRoot: string, urlPath: string): string | null {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const abs = resolve(distRoot, rel);
  const rootWithSep = distRoot.endsWith(sep) ? distRoot : distRoot + sep;
  if (abs !== distRoot && !abs.startsWith(rootWithSep)) return null;
  return abs;
}

function ext(p: string): string { const i = p.lastIndexOf('.'); return i < 0 ? '' : p.slice(i); }

export function startStaticServer(args: {
  distRoot: string; apiBaseUrl: string; port: number; host?: string;
}): Promise<{ port: number; close(): void }> {
  const host = args.host ?? '127.0.0.1';
  const indexHtml = join(args.distRoot, 'index.html');

  const send = (res: ServerResponse, file: string): void => {
    if (ext(file) === '.html') {
      const html = injectRuntimeConfig(readFileSync(file, 'utf8'), args.apiBaseUrl);
      res.writeHead(200, { 'content-type': 'text/html' }).end(html);
      return;
    }
    res.writeHead(200, { 'content-type': MIME[ext(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  };

  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const safe = resolveSafePath(args.distRoot, url === '/' ? '/index.html' : url);
    if (!safe) { res.writeHead(403).end('Forbidden'); return; }
    if (existsSync(safe) && statSync(safe).isFile()) { send(res, safe); return; }
    send(res, indexHtml); // SPA fallback
  });

  return new Promise((res, rej) => {
    let attempt = args.port;
    const tryListen = (): void => {
      const onError = (e: NodeJS.ErrnoException): void => {
        if (e.code === 'EADDRINUSE' && attempt < args.port + 50) { attempt++; tryListen(); }
        else rej(e);
      };
      server.once('error', onError);
      server.listen(attempt, host, () => {
        server.removeListener('error', onError);
        res({ port: attempt, close: () => server.close() });
      });
    };
    tryListen();
  });
}
