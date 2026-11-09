import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const mdPath = resolve(rootDir, 'docs/deliverables/deliverable-1.md');
const pdfPath = resolve(rootDir, 'docs/deliverables/CPE334_Deliverable1_NutTiew.pdf');

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u0E00-\u0E7F\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

    // Code blocks / Mermaid
    if (line.trim().startsWith('```')) {
      closeListIfNeeded();
      closeTableIfNeeded();
      if (!inCode) {
        inCode = true;
        codeLang = line.trim().slice(3).trim();
        if (codeLang === 'mermaid') {
          html += '<div class="mermaid">\n';
        } else {
          html += `<pre><code class="language-${codeLang}">`;
        }
      } else {
        inCode = false;
        if (codeLang === 'mermaid') {
          html += '</div>\n';
        } else {
          html += '</code></pre>\n';
        }
      }
      continue;
    }

    if (inCode) {
      if (codeLang === 'mermaid') {
        html += line + '\n';
      } else {
        html += line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;') + '\n';
      }
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
      const headingRaw = headingMatch[2];
      const text = inlineFormat(headingRaw);
      const slug = slugify(headingRaw);
      const altSlug = headingRaw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      html += `<h${level} id="${slug}"><a name="${altSlug}"></a>${text}</h${level}>\n`;
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
      margin: 18mm 14mm 18mm 14mm;
      @bottom-right {
        content: "Page " counter(page);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 8.5pt;
        color: #64748b;
      }
      @bottom-left {
        content: "CPE334 NutTiew — Deliverable 1 (Parts A–F)";
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 8.5pt;
        color: #64748b;
      }
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: 'Sarabun', 'TH Sarabun New', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.55;
      color: #1e293b;
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
      font-size: 18pt;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 5px;
      margin-top: 22pt;
      margin-bottom: 10pt;
    }
    h2 {
      font-size: 14pt;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
      margin-top: 16pt;
      margin-bottom: 8pt;
    }
    h3 {
      font-size: 11.5pt;
      margin-top: 12pt;
      margin-bottom: 6pt;
    }
    h4 {
      font-size: 10.5pt;
      margin-top: 10pt;
      margin-bottom: 4pt;
    }
    p, ul, ol {
      margin-top: 0;
      margin-bottom: 8pt;
    }
    li {
      margin-bottom: 3pt;
    }
    hr {
      border: 0;
      height: 1px;
      background: #e2e8f0;
      margin: 16pt 0;
    }
    code {
      font-family: 'Fira Code', 'Consolas', 'Courier New', monospace;
      font-size: 8.5pt;
      background-color: #f1f5f9;
      color: #0f172a;
      padding: 2px 4px;
      border-radius: 3px;
      border: 1px solid #e2e8f0;
    }
    pre {
      background-color: #0f172a;
      color: #f8fafc;
      padding: 10px 12px;
      border-radius: 5px;
      overflow-x: auto;
      font-size: 8pt;
      line-height: 1.4;
      page-break-inside: avoid;
      break-inside: avoid;
      margin-bottom: 10pt;
    }
    pre code {
      background-color: transparent;
      color: inherit;
      padding: 0;
      border: 0;
    }
    blockquote {
      margin: 10pt 0;
      padding: 6pt 10pt;
      background-color: #f8fafc;
      border-left: 3.5px solid #3b82f6;
      color: #475569;
      font-style: italic;
    }
    .table-container {
      margin-bottom: 12pt;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      page-break-inside: auto;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5pt 7pt;
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
      margin: 12pt 0;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .doc-image img {
      max-width: 92%;
      height: auto;
      border-radius: 5px;
      border: 1px solid #cbd5e1;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    .doc-image figcaption {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 4pt;
      font-style: italic;
    }
    .math-display {
      margin: 8pt 0;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .math-display code {
      font-size: 9.5pt;
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #1d4ed8;
      padding: 3px 8px;
    }
    .math-inline code {
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #1d4ed8;
    }
    .mermaid {
      text-align: center;
      margin: 12pt 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    a {
      color: #2563eb;
      text-decoration: none;
    }
  </style>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'neutral' });
  </script>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  console.log('Launching headless Chromium...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.setContent(fullHtml, { waitUntil: 'load' });
  
  // Wait a short moment for any async client-side mermaid rendering
  await page.waitForTimeout(1500);

  console.log('Generating PDF to:', pdfPath);
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '18mm',
      bottom: '18mm',
      left: '14mm',
      right: '14mm',
    },
  });

  await browser.close();
  console.log('PDF generation complete!');
}

generatePdf().catch(err => {
  console.error('Failed to generate PDF:', err);
  process.exit(1);
});
