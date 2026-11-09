import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const mdPath = resolve(rootDir, 'docs/deliverables/deliverable-1.md');
const pdfPath = resolve(rootDir, 'docs/deliverables/CPE334_Deliverable1_NutTiew.pdf');

function parseMarkdown(md) {
  let html = '';
  const lines = md.split('\n');
  let inCode = false;
  let codeLang = '';
  let inTable = false;
  let tableHeaderParsed = false;
  let inList = false;
  let listType = 'ul';

  const closeListIfNeeded = () => {
    if (inList) {
      html += `</${listType}>\n`;
      inList = false;
    }
  };

  const closeTableIfNeeded = () => {
    if (inTable) {
      html += '</tbody></table></div>\n';
      inTable = false;
      tableHeaderParsed = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Code blocks
    if (line.trim().startsWith('```')) {
      closeListIfNeeded();
      closeTableIfNeeded();
      if (!inCode) {
        inCode = true;
        codeLang = line.trim().slice(3);
        html += `<pre><code class="language-${codeLang}">`;
      } else {
        inCode = false;
        html += '</code></pre>\n';
      }
      continue;
    }

    if (inCode) {
      html += line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;') + '\n';
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      closeListIfNeeded();
      closeTableIfNeeded();
      html += '<hr />\n';
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeListIfNeeded();
      closeTableIfNeeded();
      const level = headingMatch[1].length;
      const text = inlineFormat(headingMatch[2]);
      const id = headingMatch[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      html += `<h${level} id="${id}">${text}</h${level}>\n`;
      continue;
    }

    // Tables
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      closeListIfNeeded();
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      
      // Delimiter row
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        tableHeaderParsed = true;
        continue;
      }

      if (!inTable) {
        inTable = true;
        html += '<div class="table-container"><table><thead><tr>';
        cells.forEach(c => {
          html += `<th>${inlineFormat(c)}</th>`;
        });
        html += '</tr></thead><tbody>\n';
        continue;
      } else {
        html += '<tr>';
        cells.forEach(c => {
          html += `<td>${inlineFormat(c)}</td>`;
        });
        html += '</tr>\n';
        continue;
      }
    } else {
      closeTableIfNeeded();
    }

    // Blockquotes
    if (line.trim().startsWith('>')) {
      closeListIfNeeded();
      closeTableIfNeeded();
      const content = inlineFormat(line.replace(/^>\s?/, ''));
      html += `<blockquote>${content}</blockquote>\n`;
      continue;
    }

    // Lists (unordered)
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (ulMatch) {
      closeTableIfNeeded();
      if (!inList || listType !== 'ul') {
        closeListIfNeeded();
        inList = true;
        listType = 'ul';
        html += '<ul>\n';
      }
      let content = ulMatch[2];
      // Checkbox support
      if (content.startsWith('[x] ') || content.startsWith('[X] ')) {
        content = '<input type="checkbox" checked disabled /> ' + content.slice(4);
      } else if (content.startsWith('[ ] ')) {
        content = '<input type="checkbox" disabled /> ' + content.slice(4);
      }
      html += `<li>${inlineFormat(content)}</li>\n`;
      continue;
    }

    // Lists (ordered)
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (olMatch) {
      closeTableIfNeeded();
      if (!inList || listType !== 'ol') {
        closeListIfNeeded();
        inList = true;
        listType = 'ol';
        html += '<ol>\n';
      }
      html += `<li>${inlineFormat(olMatch[2])}</li>\n`;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      closeListIfNeeded();
      closeTableIfNeeded();
      continue;
    }

    // Paragraph
    closeListIfNeeded();
    closeTableIfNeeded();
    html += `<p>${inlineFormat(line)}</p>\n`;
  }

  closeListIfNeeded();
  closeTableIfNeeded();
  return html;
}

function inlineFormat(text) {
  let res = text
    // Images: ![alt](url)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
      let resolvedSrc = src;
      if (src.startsWith('../evidence/')) {
        resolvedSrc = resolve(rootDir, 'docs', src.replace('../', ''));
      }
      return `<figure class="doc-image"><img src="file:///${resolvedSrc.replace(/\\/g, '/')}" alt="${alt}" /><figcaption>${alt}</figcaption></figure>`;
    })
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Bold italic
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Math display $$ ... $$
    .replace(/\$\$([^$]+)\$\$/g, '<div class="math-display"><code>$1</code></div>')
    // Math inline $ ... $
    .replace(/\$([^$]+)\$/g, '<span class="math-inline"><code>$1</code></span>');

  return res;
}

async function generatePdf() {
  console.log('Reading markdown from:', mdPath);
  const mdContent = readFileSync(mdPath, 'utf8');
  const bodyHtml = parseMarkdown(mdContent);

  const fullHtml = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>CPE334 Deliverable 1 — NutTiew</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm 20mm 15mm;
      @bottom-right {
        content: counter(page);
        font-size: 9pt;
        color: #718096;
      }
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.6;
      color: #1a202c;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #0f172a;
      font-weight: 700;
      page-break-after: avoid;
      break-after: avoid;
    }
    h1 {
      font-size: 20pt;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 6px;
      margin-top: 24pt;
      margin-bottom: 12pt;
    }
    h2 {
      font-size: 15pt;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
      margin-top: 18pt;
      margin-bottom: 10pt;
    }
    h3 {
      font-size: 12pt;
      margin-top: 14pt;
      margin-bottom: 6pt;
    }
    p, ul, ol {
      margin-top: 0;
      margin-bottom: 10pt;
    }
    li {
      margin-bottom: 4pt;
    }
    hr {
      border: 0;
      height: 1px;
      background: #e2e8f0;
      margin: 20pt 0;
    }
    code {
      font-family: 'Fira Code', 'Consolas', 'Courier New', monospace;
      font-size: 9pt;
      background-color: #f1f5f9;
      color: #0f172a;
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }
    pre {
      background-color: #0f172a;
      color: #f8fafc;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 8.5pt;
      line-height: 1.45;
      page-break-inside: avoid;
      break-inside: avoid;
      margin-bottom: 12pt;
    }
    pre code {
      background-color: transparent;
      color: inherit;
      padding: 0;
      border: 0;
    }
    blockquote {
      margin: 12pt 0;
      padding: 8pt 12pt;
      background-color: #f8fafc;
      border-left: 4px solid #3b82f6;
      color: #475569;
      font-style: italic;
    }
    .table-container {
      margin-bottom: 14pt;
      overflow-x: auto;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6pt 8pt;
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #f1f5f9;
      font-weight: 600;
      color: #1e293b;
    }
    tr:nth-child(even) td {
      background-color: #f8fafc;
    }
    .doc-image {
      margin: 14pt 0;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .doc-image img {
      max-width: 95%;
      height: auto;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .doc-image figcaption {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 4pt;
      font-style: italic;
    }
    .math-display {
      margin: 10pt 0;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .math-display code {
      font-size: 10pt;
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #1d4ed8;
      padding: 4px 10px;
    }
    .math-inline code {
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #1d4ed8;
    }
    a {
      color: #2563eb;
      text-decoration: none;
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  console.log('Launching headless Chromium...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.setContent(fullHtml, { waitUntil: 'load' });
  
  console.log('Generating PDF to:', pdfPath);
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20mm',
      bottom: '20mm',
      left: '15mm',
      right: '15mm',
    },
  });

  await browser.close();
  console.log('PDF generation complete!');
}

generatePdf().catch(err => {
  console.error('Failed to generate PDF:', err);
  process.exit(1);
});
