import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ExtContext } from '../config';
import type { ExtToWeb, Theme } from './bridge';

function nonce(): string {
  // Cryptographically secure 128-bit nonce for the CSP script-src.
  return randomBytes(16).toString('base64');
}

function currentTheme(): Theme {
  return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark';
}

export function postToWebview(panel: vscode.WebviewPanel, msg: ExtToWeb): void {
  void panel.webview.postMessage(msg);
}

/** Rewrite web/dist/index.html for the webview: asWebviewUri assets, CSP, nonce, runtime injection. */
function buildHtml(webview: vscode.Webview, distRoot: vscode.Uri, ctx: ExtContext): string {
  const n = nonce();
  const raw = readFileSync(join(distRoot.fsPath, 'index.html'), 'utf8');

  // Rewrite relative asset refs (./assets/...) to webview URIs.
  const html = raw.replace(/(src|href)="(\.\/[^"]+)"/g, (_m, attr: string, rel: string) => {
    const abs = vscode.Uri.joinPath(distRoot, rel.replace(/^\.\//, ''));
    return `${attr}="${webview.asWebviewUri(abs)}"`;
  });

  const apiBaseUrl = `http://localhost:${ctx.corePort}`;
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${n}'`,
    `connect-src ${apiBaseUrl} ws://localhost:${ctx.corePort}`,
    `font-src ${webview.cspSource}`,
  ].join('; ');

  const injection = `<script nonce="${n}">window.__ARCHI_OS__=${JSON.stringify({ apiBaseUrl })};</script>`;
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

  // Add nonce to every bundle <script>; inject CSP + runtime config into <head>.
  return html
    .replace(/<script /g, `<script nonce="${n}" `)
    .replace('</head>', `${cspMeta}${injection}</head>`);
}

export function openPanel(ctx: ExtContext, extensionUri: vscode.Uri): vscode.WebviewPanel {
  const distRoot = vscode.Uri.joinPath(extensionUri, 'web-dist');
  const panel = vscode.window.createWebviewPanel(
    'archiOs',
    'Nodalis',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [distRoot],
    },
  );

  panel.webview.html = buildHtml(panel.webview, distRoot, ctx);

  // Push theme changes to the webview.
  const themeSub = vscode.window.onDidChangeActiveColorTheme(() => {
    postToWebview(panel, { type: 'theme', payload: { theme: currentTheme() } });
  });
  panel.onDidDispose(() => themeSub.dispose());

  return panel;
}
