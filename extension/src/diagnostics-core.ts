import { DefinitionSchema } from '@archi-os/core/schema';
import { parseTree, findNodeAtLocation, type Node, type Segment } from 'jsonc-parser';

export type PlainDiagnostic = {
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  message: string;
};

function offsetToPos(text: string, offset: number): { line: number; character: number } {
  let line = 0;
  let last = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') { line++; last = i; }
  }
  return { line, character: offset - last - 1 };
}

function nodeRange(text: string, root: Node | undefined, path: Segment[]): { s: number; e: number } {
  const node = root ? findNodeAtLocation(root, path) : undefined;
  if (node) return { s: node.offset, e: node.offset + node.length };
  return { s: 0, e: Math.min(1, text.length) };
}

/** Validate def.json text against DefinitionSchema; return plain, position-mapped diagnostics. */
export function validateDefinitionText(text: string): PlainDiagnostic[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return [{ line: 0, character: 0, endLine: 0, endCharacter: 1, message: `Invalid JSON: ${(err as Error).message}` }];
  }

  const result = DefinitionSchema.safeParse(json);
  if (result.success) return [];

  const root = parseTree(text);
  return result.error.issues.map((issue) => {
    const { s, e } = nodeRange(text, root, issue.path as Segment[]);
    const start = offsetToPos(text, s);
    const end = offsetToPos(text, e);
    const where = issue.path.length ? issue.path.join('.') : '(root)';
    return {
      line: start.line,
      character: start.character,
      endLine: end.line,
      endCharacter: end.character,
      message: `${where}: ${issue.message}`,
    };
  });
}
