import fs from 'fs';
import ts from 'typescript';

export function extractTextFromTsx(code) {
  const sourceFile = ts.createSourceFile('temp.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const words = [];

  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = node.getText(sourceFile).trim();
      if (text) {
        words.push(text);
      }
    } else if (ts.isStringLiteral(node) && (ts.isJsxAttribute(node.parent) || ts.isJsxExpression(node.parent))) {
      // If it's an attribute value like title or aria-label or children inside {"..."}, check if it's text
      if (node.parent.name && (node.parent.name.text === 'className' || node.parent.name.text === 'href' || node.parent.name.text === 'target' || node.parent.name.text === 'rel')) {
        // Skip markup attributes
      } else {
        const text = node.text.trim();
        if (text) words.push(text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return words.join(' ').replace(/\s+/g, ' ');
}

// Test with disputes
if (process.argv[1]?.endsWith('extract-jsx-text.mjs')) {
  const disputes = fs.readFileSync('app/disputes/page.tsx', 'utf8');
  const extracted = extractTextFromTsx(disputes);
  console.log('Total extracted words length:', extracted.length);
  console.log('Sample:', extracted.slice(0, 200));
}
