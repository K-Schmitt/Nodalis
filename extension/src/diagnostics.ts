import * as vscode from 'vscode';
import { validateDefinitionText } from './diagnostics-core';

const DEF_GLOB = /[/\\]definitions[/\\].*\.def\.json$/;

/** Wire onDidSave for definitions def.json: publish diagnostics, invoke onValidSave when clean. */
export function registerDiagnostics(
  context: vscode.ExtensionContext,
  onValidSave: (uri: vscode.Uri) => void,
): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection('nodalis');
  context.subscriptions.push(collection);

  let timer: ReturnType<typeof setTimeout> | undefined;

  const sub = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (!DEF_GLOB.test(doc.uri.fsPath)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const diags = validateDefinitionText(doc.getText()).map((d) => new vscode.Diagnostic(
        new vscode.Range(d.line, d.character, d.endLine, d.endCharacter),
        d.message,
        vscode.DiagnosticSeverity.Error,
      ));
      collection.set(doc.uri, diags);
      if (diags.length === 0) onValidSave(doc.uri);
      else void vscode.window.showWarningMessage(`Nodalis: ${doc.uri.path.split('/').pop()} has ${diags.length} rule error(s).`);
    }, 300);
  });

  context.subscriptions.push(sub);
  return sub;
}
