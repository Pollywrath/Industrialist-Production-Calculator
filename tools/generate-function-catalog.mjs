import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excludedDirs = new Set(['node_modules', 'dist', '.git', '.tmp']);
const includedRoots = ['src', 'functions', 'tools'];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) files.push(...walk(path.join(directory, entry.name)));
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

const files = [
  ...includedRoots.flatMap((directory) => walk(path.join(root, directory))),
  path.join(root, 'vite.config.ts'),
].filter((file) => fs.existsSync(file));
const options = {
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  allowJs: true,
  checkJs: false,
  resolveJsonModule: true,
  skipLibCheck: true,
  noResolve: false,
};
const program = ts.createProgram(files, options);
const checker = program.getTypeChecker();
const records = [];
const nodeToRecord = new WeakMap();
const symbolToRecord = new Map();

function unwrapFunction(node) {
  return node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function nameFor(node, parent) {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.name) {
    return node.name.getText();
  }
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (parent && ts.isPropertyAssignment(parent)) return parent.name.getText();
  if (parent && ts.isPropertyDeclaration(parent) && parent.name) return parent.name.getText();
  return undefined;
}

function functionNodeFor(recordNode) {
  if (ts.isVariableDeclaration(recordNode)) return recordNode.initializer;
  if (ts.isPropertyAssignment(recordNode)) return recordNode.initializer;
  if (ts.isPropertyDeclaration(recordNode)) return recordNode.initializer;
  return recordNode;
}

function define(nameNode, recordNode, kind) {
  const name = nameFor(functionNodeFor(recordNode), recordNode.parent) ?? nameNode?.getText();
  if (!name) return;
  const source = recordNode.getSourceFile();
  const start = ts.getLineAndCharacterOfPosition(source, recordNode.getStart(source)).line + 1;
  const end = ts.getLineAndCharacterOfPosition(source, recordNode.end).line + 1;
  const relative = path.relative(root, source.fileName).replaceAll(path.sep, '/');
  const symbol = nameNode ? checker.getSymbolAtLocation(nameNode) : undefined;
  const record = {
    name,
    kind,
    relative,
    start,
    end,
    exported: Boolean(recordNode.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ||
      recordNode.parent?.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)),
    symbol,
    calls: new Map(),
    references: new Map(),
  };
  records.push(record);
  nodeToRecord.set(functionNodeFor(recordNode), record);
  nodeToRecord.set(recordNode, record);
  if (symbol) {
    let resolved = symbol;
    if (symbol.flags & ts.SymbolFlags.Alias) {
      try { resolved = checker.getAliasedSymbol(symbol); } catch {}
    }
    if (!symbolToRecord.has(resolved)) symbolToRecord.set(resolved, []);
    symbolToRecord.get(resolved).push(record);
  }
}

function visitDefinitions(node) {
  if (ts.isFunctionDeclaration(node) && node.name) define(node.name, node, 'function');
  else if (ts.isMethodDeclaration(node) && node.name) define(node.name, node, 'method');
  else if (ts.isConstructorDeclaration(node)) define(undefined, node, 'constructor');
  else if ((ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.name) define(node.name, node, 'accessor');
  else if (ts.isVariableDeclaration(node) && unwrapFunction(node.initializer) && ts.isIdentifier(node.name)) define(node.name, node, 'function value');
  else if (ts.isPropertyAssignment(node) && unwrapFunction(node.initializer)) define(node.name, node, 'object function');
  else if (ts.isPropertyDeclaration(node) && unwrapFunction(node.initializer)) define(node.name, node, 'class function');
  ts.forEachChild(node, visitDefinitions);
}

for (const source of program.getSourceFiles()) {
  const relative = path.relative(root, source.fileName);
  if (!relative || relative.startsWith('..') || relative.includes(`${path.sep}node_modules${path.sep}`)) continue;
  if (!files.some((file) => path.resolve(file) === path.resolve(source.fileName))) continue;
  visitDefinitions(source);
}

function resolveRecord(symbol) {
  if (!symbol) return undefined;
  let resolved = symbol;
  if (symbol.flags & ts.SymbolFlags.Alias) {
    try { resolved = checker.getAliasedSymbol(symbol); } catch { return undefined; }
  }
  const candidates = symbolToRecord.get(resolved);
  return candidates?.length === 1 ? candidates[0] : undefined;
}

function lineOf(node) {
  return ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart()).line + 1;
}

function enclosingCaller(node) {
  for (let current = node.parent; current; current = current.parent) {
    const record = nodeToRecord.get(current);
    if (record) return `${record.name} (${record.relative}:${record.start})`;
    if (ts.isSourceFile(current)) return `module initialization (${path.relative(root, current.fileName).replaceAll(path.sep, '/')})`;
  }
  return 'module initialization';
}

function registerUse(target, node, direct) {
  const source = node.getSourceFile();
  const relative = path.relative(root, source.fileName).replaceAll(path.sep, '/');
  const line = lineOf(node);
  const caller = enclosingCaller(node);
  const key = `${caller}|${relative}:${line}`;
  (direct ? target.calls : target.references).set(key, { caller, relative, line });
}

function useSymbol(node) {
  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) return checker.getSymbolAtLocation(node);
  return undefined;
}

function visitUses(node) {
  if (ts.isCallExpression(node)) {
    const target = resolveRecord(useSymbol(node.expression));
    if (target) registerUse(target, node, true);
  } else if (ts.isNewExpression(node)) {
    const target = resolveRecord(useSymbol(node.expression));
    if (target) registerUse(target, node, true);
  } else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const target = resolveRecord(useSymbol(node.tagName));
    if (target) registerUse(target, node, true);
  } else if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
    const parent = node.parent;
    const isCallTarget = (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node;
    const isJsxTarget = (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) && parent.tagName === node;
    const isDeclarationName = (ts.isDeclaration(parent) && parent.name === node) ||
      ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) ||
      ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isImportDeclaration(parent.parent);
    if (!isCallTarget && !isJsxTarget && !isDeclarationName) {
      const target = resolveRecord(useSymbol(node));
      if (target) registerUse(target, node, false);
    }
  }
  ts.forEachChild(node, visitUses);
}
for (const source of program.getSourceFiles()) {
  if (files.some((file) => path.resolve(file) === path.resolve(source.fileName))) visitUses(source);
}

const sortUse = (a, b) => a.relative.localeCompare(b.relative) || a.line - b.line || a.caller.localeCompare(b.caller);
function compactUses(uses) {
  const grouped = new Map();
  for (const use of uses) {
    const key = use.caller;
    if (!grouped.has(key)) grouped.set(key, { ...use, lines: [] });
    grouped.get(key).lines.push(use.line);
  }
  return [...grouped.values()].sort(sortUse).map((use) => {
    const lineNumbers = [...new Set(use.lines)].sort((a, b) => a - b);
    const lineList = lineNumbers.join(', ');
    return `${use.caller} at [${'`'}${use.relative}:${lineList}${'`'}](${use.relative}#L${lineNumbers[0]})`;
  });
}
const group = new Map();
for (const record of records) {
  record.calls = [...record.calls.values()].sort(sortUse);
  record.references = [...record.references.values()].sort(sortUse);
  if (!group.has(record.relative)) group.set(record.relative, []);
  group.get(record.relative).push(record);
}
for (const list of group.values()) list.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));

const link = (file, line) => `[${'`'}${file}:${line}${'`'}](${file}#L${line})`;
const lines = [
  '# Function Catalog',
  '',
  '> Generated by `node tools/generate-function-catalog.mjs`. Regenerate after changing function definitions or call sites.',
  '',
  `Generated: ${new Date().toISOString().slice(0, 10)}  `,
  `Indexed ${records.length} named functions, methods, constructors, and function-valued members across ${group.size} source files.`,
  '',
  '## How to use this catalog',
  '',
  '- Start with **Frequently reused** to find functions called from multiple files. Check the definition and caller list before extracting or changing shared behavior.',
  '- The per-file listings are the full index. A caller is the nearest named function or component containing a direct call, constructor use, or JSX component use.',
  '- The caller summary counts direct calls, constructor uses, and JSX component uses. **Referenced by** separately lists functions passed as values, including event handlers and callbacks.',
  '- Static analysis cannot see runtime dispatch through strings, reflection, or callbacks invoked by external libraries. React hooks and event handlers may be invoked by the framework rather than by an in-repo direct call.',
  '- Generated/vendor code under `public/` and data-only files are excluded. Handwritten code under `src/`, `functions/`, and `tools/`, plus `vite.config.ts`, is indexed.',
  '',
  '## Frequently reused',
  '',
];

const reusable = records.filter((record) => {
  const callerFiles = new Set(record.calls.map((call) => call.relative));
  return record.exported || callerFiles.size >= 2;
}).sort((a, b) => {
  const score = (record) => new Set(record.calls.map((call) => call.relative)).size;
  return score(b) - score(a) || a.relative.localeCompare(b.relative) || a.start - b.start;
});

lines.push('| Function | Definition | Called from | Reuse signal |', '| --- | --- | --- | --- |');
for (const record of reusable) {
  const callerFiles = new Set(record.calls.map((call) => call.relative));
  const callers = record.calls.length
    ? [...callerFiles].sort().map((file) => `${file} (${record.calls.filter((call) => call.relative === file).length} call sites)`).join('<br>')
    : 'No direct call found (may be public API, callback, hook, or entry point)';
  const signal = callerFiles.size >= 2 ? `${callerFiles.size} caller files` : record.exported ? 'exported' : 'single file';
  lines.push(`| \`${record.name}\` (${record.kind}) | ${link(record.relative, record.start)} | ${callers} | ${signal} |`);
}

lines.push('', '## Full function index', '');
for (const [file, list] of [...group.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`### ${file}`, '', '| Function | Definition | Kind | Direct callers | Referenced by |', '| --- | --- | --- | --- | --- |');
  for (const record of list) {
    const callers = record.calls.length
      ? compactUses(record.calls).join('<br>')
      : '—';
    const references = record.references.length
      ? compactUses(record.references).join('<br>')
      : '—';
    const flags = [record.kind, record.exported ? 'exported' : undefined].filter(Boolean).join(', ');
    lines.push(`| \`${record.name}\` | ${link(record.relative, record.start)}–${link(record.relative, record.end)} | ${flags} | ${callers} | ${references} |`);
  }
  lines.push('');
}

fs.writeFileSync(path.join(root, 'FUNCTION_CATALOG.md'), `${lines.join('\n')}\n`);
console.log(`Wrote FUNCTION_CATALOG.md with ${records.length} functions across ${group.size} source files.`);
