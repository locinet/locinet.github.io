import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';

const buf = readFileSync('C:/Users/jfhut/locinet/_cache/ockham-ord-i2-3.pdf');
const data = new Uint8Array(buf);

const pdf = await getDocument({ data, verbosity: 0 }).promise;
console.log('Total pages:', pdf.numPages);

const startPage = 40;
const endPage = Math.min(63, pdf.numPages);

for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
  const page = await pdf.getPage(pageNum);
  const textContent = await page.getTextContent();
  const lines = [];
  let lastY = null;
  let currentLine = '';
  
  for (const item of textContent.items) {
    if (!item.str) continue;
    const y = item.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 2) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = item.str;
    } else {
      currentLine += item.str;
    }
    lastY = y;
  }
  if (currentLine.trim()) lines.push(currentLine.trim());
  
  console.log(`\n========== PAGE ${pageNum} ==========`);
  for (const line of lines.reverse()) {  // PDF y-coords go bottom to top
    console.log(line);
  }
}
