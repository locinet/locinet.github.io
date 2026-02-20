import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync } from 'fs';

const buf = readFileSync('C:/Users/jfhut/locinet/_cache/ockham-ord-i2-3.pdf');
const data = new Uint8Array(buf);

const pdf = await getDocument({ data, verbosity: 0 }).promise;

const startPage = 1;
const endPage = pdf.numPages;
let output = `Total pages: ${pdf.numPages}\n`;

for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
  const page = await pdf.getPage(pageNum);
  const textContent = await page.getTextContent();
  
  // Collect items with their y positions
  const items = textContent.items.filter(i => i.str && i.str.trim());
  
  // Group by y position (within 2 units = same line)
  const lineMap = new Map();
  for (const item of items) {
    const y = Math.round(item.transform[5]);
    const x = item.transform[4];
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push({ x, str: item.str });
  }
  
  // Sort lines by y descending (top to bottom in PDF)
  const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
  
  output += `\n========== PAGE ${pageNum} ==========\n`;
  for (const y of sortedYs) {
    const lineItems = lineMap.get(y).sort((a, b) => a.x - b.x);
    const lineText = lineItems.map(i => i.str).join('');
    if (lineText.trim()) output += lineText + '\n';
  }
}

writeFileSync('C:/Users/jfhut/locinet/_cache/pages-all.txt', output, 'utf8');
console.log('Done! Written to pages-all.txt');
