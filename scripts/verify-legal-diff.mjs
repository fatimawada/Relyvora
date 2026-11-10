import fs from 'fs';
import { execSync } from 'child_process';
import ts from 'typescript';

function extractTextFromTsx(code) {
  const sourceFile = ts.createSourceFile('temp.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const words = [];

  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = node.getText(sourceFile).trim();
      if (text) {
        words.push(text);
      }
    } else if (ts.isStringLiteral(node)) {
      if (node.parent && ts.isJsxAttribute(node.parent)) {
        const attrName = node.parent.name?.text;
        if (['className', 'href', 'target', 'rel', 'id', 'role'].includes(attrName)) {
          // ignore styling/routing attributes
        } else {
          const text = node.text.trim();
          if (text) words.push(text);
        }
      } else if (node.parent && ts.isJsxExpression(node.parent)) {
        const text = node.text.trim();
        if (text) words.push(text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return words.join(' ').replace(/\s+/g, ' ');
}

const files = ['app/disputes/page.tsx', 'app/terms/page.tsx', 'app/privacy/page.tsx'];
let allPassed = true;

for (const f of files) {
  const orig = execSync(`git show HEAD:${f}`).toString('utf8');
  const current = fs.readFileSync(f, 'utf8');

  const textOrig = extractTextFromTsx(orig);
  const textCurr = extractTextFromTsx(current);

  if (textOrig === textCurr) {
    console.log(`[PASS] ${f}: Text is 100% IDENTICAL (${textOrig.length} chars)`);
  } else {
    console.error(`[FAIL] ${f}: Text MISMATCH!`);
    console.error(`Orig length: ${textOrig.length}, Curr length: ${textCurr.length}`);
    for (let i = 0; i < Math.max(textOrig.length, textCurr.length); i++) {
      if (textOrig[i] !== textCurr[i]) {
        console.error(`Mismatch at pos ${i}:`);
        console.error(`Orig: ${textOrig.slice(Math.max(0, i - 30), i + 30)}`);
        console.error(`Curr: ${textCurr.slice(Math.max(0, i - 30), i + 30)}`);
        break;
      }
    }
    allPassed = false;
  }
}

if (!allPassed) {
  process.exit(1);
} else {
  console.log('All legal pages verified: ZERO wording changes.');
}
