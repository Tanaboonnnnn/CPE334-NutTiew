import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u0E00-\u0E7F\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readDoc(relPath) {
  return readFileSync(resolve(rootDir, relPath), 'utf8').replace(/\r\n/g, '\n');
}

function extractLines(relPath, startLine, endLine, expectedFirstSubstring, expectedLastSubstring) {
  const lines = readDoc(relPath).split('\n');
  const slice = lines.slice(startLine - 1, endLine);
  const text = slice.join('\n').replace(/\s+$/, '');
  if (expectedFirstSubstring && !slice[0]?.includes(expectedFirstSubstring)) {
    throw new Error(`Excerpt start mismatch in ${relPath}:${startLine}: expected "${expectedFirstSubstring}", got "${slice[0]}"`);
  }
  if (expectedLastSubstring && !slice[slice.length - 1]?.includes(expectedLastSubstring)) {
    throw new Error(`Excerpt end mismatch in ${relPath}:${endLine}: expected "${expectedLastSubstring}", got "${slice[slice.length - 1]}"`);
  }
  return text;
}

const GITHUB_BLOB_BASE = 'https://github.com/Tanaboonnnnn/CPE334-NutTiew/blob/sprint1';

// Ordered map of every canonical Part A-E file embedded into Deliverable 1
const EMBEDDED_SECTIONS = [
  { relPath: 'docs/srs.md', heading: 'Part A: Whole-Product Software Requirements Specification (SRS)', level: 1, shift: 0, keepH1: false },
  { relPath: 'docs/features.md', heading: 'B.1 Feature Inventory (docs/features.md)', level: 2, shift: 1, keepH1: false },
  { relPath: 'docs/traceability.md', heading: 'B.2 Requirement Traceability Matrix (docs/traceability.md)', level: 2, shift: 1, keepH1: false },
  { relPath: 'docs/system-sds.md', heading: 'Part C: Whole-Product System Software Design Specification (SDS)', level: 1, shift: 0, keepH1: false },
  { relPath: 'docs/sprints/plan.md', heading: 'Part D: Feasible Three-Sprint Delivery Plan', level: 1, shift: 0, keepH1: false },

  // E.1 F-S1-01
  { relPath: 'docs/features/F-S1-01/specification.md', heading: 'E.1.1 F-S1-01 Authentication Feature SDS (specification.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-01/ui-spec.md', heading: 'E.1.2 F-S1-01 Authentication UI Specification (ui-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-01/api-spec.md', heading: 'E.1.3 F-S1-01 Authentication API Contract (api-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-01/data-spec.md', heading: 'E.1.4 F-S1-01 Identity & Session Data Contract (data-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-01/tests.md', heading: 'E.1.5 F-S1-01 Authentication Software Test Specification (tests.md)', level: 3, shift: 2, keepH1: false },

  // E.2 F-S1-02
  { relPath: 'docs/features/F-S1-02/specification.md', heading: 'E.2.1 F-S1-02 Tutor Slot Feature SDS (specification.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-02/ui-spec.md', heading: 'E.2.2 F-S1-02 Tutor Availability UI Specification (ui-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-02/ui-decision-2026-11-05.md', heading: 'E.2.3 F-S1-02 UX Decision Amendment — Tutor Calendar Dashboard (ui-decision-2026-11-05.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-02/api-spec.md', heading: 'E.2.4 F-S1-02 Slot HTTP Contract (api-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-02/data-spec.md', heading: 'E.2.5 F-S1-02 Slot Data & Transaction Contract (data-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-02/tests.md', heading: 'E.2.6 F-S1-02 Tutor Slot Software Test Specification (tests.md)', level: 3, shift: 2, keepH1: false },

  // E.3 Shared Booking Data Foundation
  { relPath: 'docs/foundations/booking-data/specification.md', heading: 'E.3.1 D1-08A Shared Booking Data Foundation SDS (specification.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/foundations/booking-data/data-spec.md', heading: 'E.3.2 D1-08A Shared Booking Data Specification (data-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/foundations/booking-data/tests.md', heading: 'E.3.3 D1-08A Shared Booking Data Test Specification (tests.md)', level: 3, shift: 2, keepH1: false },

  // E.4 F-S1-03
  { relPath: 'docs/features/F-S1-03/specification.md', heading: 'E.4.1 F-S1-03 Customer Availability Feature SDS (specification.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-03/ui-spec.md', heading: 'E.4.2 F-S1-03 Customer Availability UI Specification (ui-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-03/api-spec.md', heading: 'E.4.3 F-S1-03 Customer Availability HTTP/API Contract (api-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-03/data-spec.md', heading: 'E.4.4 F-S1-03 Customer Availability Data Contract (data-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-03/tests.md', heading: 'E.4.5 F-S1-03 Customer Availability Software Test Specification (tests.md)', level: 3, shift: 2, keepH1: false },

  // E.5 F-S1-04
  { relPath: 'docs/features/F-S1-04/specification.md', heading: 'E.5.1 F-S1-04 Exclusive Booking Feature SDS (specification.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-04/ui-spec.md', heading: 'E.5.2 F-S1-04 Customer Booking Confirmation UI Specification (ui-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-04/api-spec.md', heading: 'E.5.3 F-S1-04 Customer Booking HTTP/API Contract (api-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-04/data-spec.md', heading: 'E.5.4 F-S1-04 Booking Data Contract (data-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-04/transaction-spec.md', heading: 'E.5.5 F-S1-04 PostgreSQL Booking Transaction, Lock & Retry Contract (transaction-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-04/tests.md', heading: 'E.5.6 F-S1-04 Customer Booking Software Test Specification (tests.md)', level: 3, shift: 2, keepH1: false },

  // E.6 F-S1-05
  { relPath: 'docs/features/F-S1-05/specification.md', heading: 'E.6.1 F-S1-05 Protected Booking Retrieval Feature SDS (specification.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-05/ui-spec.md', heading: 'E.6.2 F-S1-05 Protected Booking Retrieval UI Specification (ui-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-05/api-spec.md', heading: 'E.6.3 F-S1-05 Protected Booking Retrieval API Specification (api-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-05/data-spec.md', heading: 'E.6.4 F-S1-05 Protected Booking Retrieval Data Contract (data-spec.md)', level: 3, shift: 2, keepH1: false },
  { relPath: 'docs/features/F-S1-05/tests.md', heading: 'E.6.5 F-S1-05 Software Test Specification (tests.md)', level: 3, shift: 2, keepH1: false },
];

const embeddedAnchorMap = new Map(
  EMBEDDED_SECTIONS.map(entry => [entry.relPath, `#${slugify(entry.heading)}`])
);

function transformEmbeddedDoc(entry) {
  const raw = readDoc(entry.relPath);
  const lines = raw.split('\n');
  const docDir = posix.dirname(entry.relPath);
  const out = [];

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let skippedH1 = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const info = fenceMatch[2].trim();
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0];
        fenceLen = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceLen && info === '') {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
      }
      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(line);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      if (!entry.keepH1 && !skippedH1 && level === 1) {
        skippedH1 = true;
        continue;
      }
      const newLevel = Math.min(6, level + entry.shift);
      out.push(`${'#'.repeat(newLevel)} ${text}`);
      continue;
    }

    // Rewrite relative markdown links safely without touching external URLs or in-doc anchors
    const rewritten = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label, href) => {
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#') || href.startsWith('mailto:')) {
        return full;
      }
      const [filePart, hashPart] = href.split('#');
      if (!filePart) {
        return full;
      }
      const targetPath = posix.normalize(posix.join(docDir, filePart));
      if (embeddedAnchorMap.has(targetPath)) {
        // SRS keeps its exact numbered section slugs (#1-..., #5-...) at top level
        if (targetPath === 'docs/srs.md' && hashPart) {
          return `[${label}](#${hashPart})`;
        }
        return `[${label}](${embeddedAnchorMap.get(targetPath)})`;
      }
      return `[${label}](${GITHUB_BLOB_BASE}/${targetPath}${hashPart ? `#${hashPart}` : ''})`;
    });

    out.push(rewritten);
  }

  return `${'#'.repeat(entry.level)} ${entry.heading}\n\n${out.join('\n').trim()}`;
}

export function compileDeliverable(options = {}) {
  const testedSha = options.testedSha ?? process.env.D1_TESTED_SHA ?? '808b906';
  const ciRunId = options.ciRunId ?? process.env.D1_CI_RUN_ID ?? '42783770373';
  const ciRunUrl = options.ciRunUrl ?? process.env.D1_CI_RUN_URL ?? 'https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42783770373';
  const docGenDate = options.docGenDate ?? '10 November 2026 (Asia/Bangkok)';
  const pr = options.pageRanges ?? {};
  const fmtRange = (key, fallback = 'Computing...') => pr[key] || fallback;

  // Read verbatim executable test excerpts from real source files
  const domainRuleExcerpt = extractLines(
    'apps/api/test/bookings.db.test.ts',
    855,
    918,
    "it('BOOK-17 enforces Q05 at post-wait DB T_elig",
    '}, 15_000);'
  );
  const authSetupExcerpt = extractLines(
    'apps/api/test/retrieval.db.test.ts',
    128,
    149,
    '// Create 3 slots for Tutor A',
    '}, 30_000);'
  );
  const authRet03Excerpt = extractLines(
    'apps/api/test/retrieval.db.test.ts',
    214,
    224,
    '// RET-03: Cross-Customer Access Refusal (Safe 404)',
    '});'
  );
  const authRet06Excerpt = extractLines(
    'apps/api/test/retrieval.db.test.ts',
    278,
    297,
    '// RET-06: Cross-Tutor Schedule Isolation',
    '});'
  );

  const coverSection = `# CPE334 Software Engineering — Deliverable 1
## NutTiew (นัดติว) — One-to-One Tutoring Appointment System

- **Academic Term:** Semester 1/2026
- **Department & Institution:** Department of Computer Engineering, Faculty of Engineering, King Mongkut's University of Technology Thonburi (KMUTT)
- **Assigned Theme:** Theme 1 — Appointment & Scheduling
- **Repository URL:** [https://github.com/Tanaboonnnnn/CPE334-NutTiew](https://github.com/Tanaboonnnnn/CPE334-NutTiew)
- **Integration Staging Base SHA:** \`9d24fca\` on branch \`sprint1\`
- **Verified Code & DB Baseline SHA:** \`${testedSha}\` on branch \`docs/18-deliverable-1-integration\` ([PR #43](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/43))
- **Verified GitHub Actions CI Run:** [Run ${ciRunId}](${ciRunUrl}) — 3/3 Jobs PASS (\`Unit / types / build\`, \`PostgreSQL 18 / Auth / Slot / Race A\`, \`Microsoft Edge / Auth / Tutor UI E2E\`)
- **Target Release Branch:** \`main\` (Pending teammate review and approval of PR #43; followed by reviewed \`sprint1 -> main\` release PR and immutable tag)
- **Course Handout Deadline:** 8 November 2026, 23:59 ICT *(subsequent PR remediation & final submission timing transparently documented below)*
- **Report Compilation Date:** ${docGenDate}
- **Total PDF Pages:** ${pr.totalPages ? `${pr.totalPages} pages` : 'Computing...'}

---

### Team Members & Identification

| Student Full Name | Student ID | GitHub Username | Project Role & Responsibility |
| :--- | :--- | :--- | :--- |
| **Tanboon Teawsawat** | *(Supplied Privately via LEB2 handoff)* | [@Tanaboonnnnn](https://github.com/Tanaboonnnnn) | Requirements Discovery Lead (Q01–Q32), Whole-Product SRS & SDS Architecture, Three-Sprint Plan, Project #6 Kanban, Peer Reviewer |
| **Chxtamos** | *(Supplied Privately via LEB2 handoff)* | [@Chxtamos](https://github.com/Chxtamos) | Express 5 REST API & PostgreSQL Schema/Trigger Implementation, Concurrency Lock Ordering, React 19 UI, Automated Tests, PDF Lead |

> **Privacy Notice on Student Identification:** In compliance with student privacy protection and academic repository standards, full KMUTT Student ID numbers are withheld from public Git commit histories and supplied privately through the official university course submission portal (LEB2).

---

## Executive Summary & Document Navigation Guide

**NutTiew (นัดติว)** is a one-to-one tutoring appointment and scheduling web application developed under CPE334 Software Engineering. This document is a **fully self-contained Deliverable 1 submission** packaging **Parts A through F** verbatim from approved canonical repository contracts and verified Sprint 1 test runs, gradable completely offline without opening the repository.

### Actual PDF Page Ranges & Traceability Navigation

| Document Part / Section | Primary Content & Scope | Relevant Requirement / Contract IDs | PDF Pages |
| :--- | :--- | :--- | :---: |
| **Cover, Team & Navigation** | Metadata, team roles, confidentiality note, actual PDF navigation index | D1 §4.3 | ${fmtRange('cover')} |
| [**Part A: Whole-Product SRS**](#part-a-whole-product-software-requirements-specification-srs) | Complete problem domain, actors, Sprints 1–3 requirements, rules & Q01–Q32 | \`FR-001..036\`, \`BR-001..035\`, \`NFR-001..016\`, \`Q01–Q32\` | ${fmtRange('partA')} |
| [**Part B: Feature Inventory & Traceability**](#part-b-feature-inventory-requirements-traceability-matrix) | Whole-product feature catalog and canonical \`AC-S1-01..35\` / \`VC/TEST-S1-01..39\` mapping | \`F-S1-01..05\`, \`F-S2-01..05\`, \`F-S3-01..02\`, \`AC-S1-01..35\` | ${fmtRange('partB')} |
| [**Part C: Whole-Product System SDS**](#part-c-whole-product-system-software-design-specification-sds) | System architecture, Express 5 + React 19 + PostgreSQL DDL, Mermaid diagrams, future Lab 5 deployment design | C4 diagrams, \`btree_gist\`, \`slot_guard_s1\`, \`booking_guard_s1\` | ${fmtRange('partC')} |
| [**Part D: Feasible Three-Sprint Plan**](#part-d-feasible-three-sprint-delivery-plan) | Milestones, feature dependency order, two-student capacity, risks & Sprint 1 DoD boundary | Deliverable D1/D2/Final checkpoints | ${fmtRange('partD')} |
| [**Part E: Sprint 1 Feature Contracts & STSs**](#part-e-sprint-1-feature-specifications-software-test-specifications) | Complete embedded Part E Feature SDS, UI Spec, UX Amendments, API Spec, Data Spec, Transaction Spec, STS & DoD | All 6 Part E components (30 full contract docs) | ${fmtRange('partE')} |
| — [**E.1 F-S1-01 Authentication & Sessions**](#e1-f-s1-01-authentication-sessions-rate-limiting) | SDS, UI Spec, API Contract, Data Contract, STS & Gate | \`AUTH-01..23\`, \`OD-005-A..E\` | ${fmtRange('e1')} |
| — [**E.2 F-S1-02 Tutor Slot Availability**](#e2-f-s1-02-tutor-slot-availability-scheduling) | SDS, UI Spec, Tutor Calendar UX Decision, API Spec, Data Spec, STS | \`SLOT-01..17\`, Race A | ${fmtRange('e2')} |
| — [**E.3 Shared Booking Data Foundation**](#e3-shared-booking-data-foundation-d1-08a) | Foundation SDS, Shared Data Spec, Shared DB STS & Trigger Guards | \`BDF-01..28\`, \`booking_guard_s1\` | ${fmtRange('e3')} |
| — [**E.4 F-S1-03 Customer Availability**](#e4-f-s1-03-customer-availability-browse-filter) | SDS, UI Spec, API Contract, Data Contract, STS | \`AVA-01..19\` | ${fmtRange('e4')} |
| — [**E.5 F-S1-04 Exclusive Booking & Races**](#e5-f-s1-04-customer-exclusive-booking-concurrency-protection) | SDS, UI Spec, API Spec, Data Spec, Transaction Lock/Retry Contract, STS | \`BOOK-01..33\`, Race B, Race C, \`BDF-23\` | ${fmtRange('e5')} |
| — [**E.6 F-S1-05 Booking Retrieval & Tutor View**](#e6-f-s1-05-protected-booking-retrieval-authorized-tutor-schedule) | SDS, UI Spec, API Spec, Data Contract, STS | \`RET-01..17\`, \`INV-RET-01..05\` | ${fmtRange('e6')} |
| [**Part F: Sprint 1 Verification & Release Evidence**](#part-f-sprint-1-implementation-verification-release-evidence) | 199 distinct tests, \`AC-S1-01..35\` & \`VC/TEST-S1-01..39\` matrices, Race A/B/C proofs, verbatim excerpts, TDD history, 8 journey screenshots, peer reviews, contributions, AI use & honest DoD | 199/199 tests PASS; release/LEB2 pending | ${fmtRange('partF')} |

---
`;

  const byPath = Object.fromEntries(EMBEDDED_SECTIONS.map(s => [s.relPath, transformEmbeddedDoc(s)]));

  const partA = byPath['docs/srs.md'];
  const partB = `# Part B: Feature Inventory & Requirements Traceability Matrix\n\n${byPath['docs/features.md']}\n\n---\n\n${byPath['docs/traceability.md']}`;
  const partC = byPath['docs/system-sds.md'];
  const partD = byPath['docs/sprints/plan.md'];

  const partE = [
    '# Part E: Sprint 1 Feature Specifications & Software Test Specifications',
    '> **Completeness Notice:** Every reviewed and accepted Sprint 1 Part E contract (\`specification.md\`, \`ui-spec.md\`, \`ui-decision-2026-11-05.md\`, \`api-spec.md\`, \`data-spec.md\`, \`transaction-spec.md\`, and \`tests.md\`) is embedded **verbatim in full** below so this PDF stands alone without external repository links.',
    '## E.1 F-S1-01: Authentication, Sessions & Rate Limiting',
    byPath['docs/features/F-S1-01/specification.md'],
    byPath['docs/features/F-S1-01/ui-spec.md'],
    byPath['docs/features/F-S1-01/api-spec.md'],
    byPath['docs/features/F-S1-01/data-spec.md'],
    byPath['docs/features/F-S1-01/tests.md'],

    '## E.2 F-S1-02: Tutor Slot Availability & Scheduling',
    byPath['docs/features/F-S1-02/specification.md'],
    byPath['docs/features/F-S1-02/ui-spec.md'],
    byPath['docs/features/F-S1-02/ui-decision-2026-11-05.md'],
    byPath['docs/features/F-S1-02/api-spec.md'],
    byPath['docs/features/F-S1-02/data-spec.md'],
    byPath['docs/features/F-S1-02/tests.md'],

    '## E.3 Shared Booking Data Foundation (D1-08A)',
    byPath['docs/foundations/booking-data/specification.md'],
    byPath['docs/foundations/booking-data/data-spec.md'],
    byPath['docs/foundations/booking-data/tests.md'],

    '## E.4 F-S1-03: Customer Availability Browse & Filter',
    byPath['docs/features/F-S1-03/specification.md'],
    byPath['docs/features/F-S1-03/ui-spec.md'],
    byPath['docs/features/F-S1-03/api-spec.md'],
    byPath['docs/features/F-S1-03/data-spec.md'],
    byPath['docs/features/F-S1-03/tests.md'],

    '## E.5 F-S1-04: Customer Exclusive Booking & Concurrency Protection',
    byPath['docs/features/F-S1-04/specification.md'],
    byPath['docs/features/F-S1-04/ui-spec.md'],
    byPath['docs/features/F-S1-04/api-spec.md'],
    byPath['docs/features/F-S1-04/data-spec.md'],
    byPath['docs/features/F-S1-04/transaction-spec.md'],
    byPath['docs/features/F-S1-04/tests.md'],

    '## E.6 F-S1-05: Protected Booking Retrieval & Authorized Tutor Schedule',
    byPath['docs/features/F-S1-05/specification.md'],
    byPath['docs/features/F-S1-05/ui-spec.md'],
    byPath['docs/features/F-S1-05/api-spec.md'],
    byPath['docs/features/F-S1-05/data-spec.md'],
    byPath['docs/features/F-S1-05/tests.md'],
  ].join('\n\n---\n\n');

  const partFSection = `
---

# Part F: Sprint 1 Implementation, Verification & Release Evidence

## 1. Truthful Automated Test Execution & CI Record

Automated verification was executed across both local Windows 11 (Node v24.14.0, PostgreSQL 17.2 + \`btree_gist\` 1.7, Microsoft Edge / Chromium) and GitHub Actions Ubuntu 24.04 runners (Node 24, PostgreSQL 18, Microsoft Edge). All domain code (\`apps/api/\`, \`apps/web/\`) and Playwright journey tests (\`e2e/\`) have remained unchanged since verified snapshot \`e591f72\` (application logic from \`sprint1@9d24fca\`, plus \`e2e/sprint1.journey.spec.ts\` added in \`e591f72\`).

| Verification Gate / Suite | Execution Command | Environment | Passed | Failed | Skipped | Distinct Total |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **Pure Domain Unit & Contract Tests** | \`npm test\` | Local + CI (Node 24) | **29** | 0 | 0 | **29** |
| **Real PostgreSQL DB Integration & Concurrency** | \`npm run test:db -w @nuttiew/api\` | Local (PG 17.2) + CI (PG 18) | **106** | 0 | 0 | **106** |
| **Browser End-to-End Suite (incl. Sprint 1 Journey)** | \`npx playwright test\` | Local + CI (MS Edge) | **64** | 0 | 0 | **64** |
| **TypeScript Static Typecheck** | \`npm run typecheck\` | Local + CI | 0 errors | 0 | - | **Clean** |
| **Production Build** | \`npm run build\` | Local + CI | Clean | 0 | - | **Clean** |
| **Git Whitespace & Patch Check** | \`git diff --check\` | Local | Clean | 0 | - | **Clean** |

> **Total Distinct Automated Tests:** \`29\` (Unit) + \`106\` (DB) + \`64\` (E2E) = **\`199\` Distinct Tests (\`199\` Passed, \`0\` Failed, \`0\` Skipped)**

> **Accounting & CI Incident Transparency Notes:**
> 1. **No Double-Counting:** The 64-test browser suite (\`npx playwright test\`) already executes \`e2e/sprint1.journey.spec.ts\` as test \`[39/64]\`. The true count of unique automated tests is **199** (29 + 106 + 64).
> 2. **CI Workflow Run Diagnosis (#42672763881):** On commit \`0efa30b\`, GitHub Actions Run [#42672763881 Attempt 1](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42672763881) concluded \`failure\` because GitHub Actions transiently failed to dispatch the \`PostgreSQL 18 / Auth / Slot / Race A\` job (0 job entries/logs created, while \`Unit / types / build\` and \`Microsoft Edge E2E\` passed). Re-running the exact same workflow without file edits on Attempt 2 dispatched all 3 jobs and passed **3/3 GREEN**.
> 3. **Exact Verified Baseline Recorded:** The table above reflects local execution (Unit 29/29, PG 17.2 DB 106/106, typecheck, build) and verified GitHub Actions CI ([Run ${ciRunId}](${ciRunUrl}) on SHA \`${testedSha}\`, **3/3 jobs PASS**). The subsequent metadata-sync commit on PR #43 updates only the cited verified baseline SHA/CI-Run fields and regenerated Deliverable 1 Markdown/PDF without modifying \`apps/\`, \`e2e/\`, migrations, Part A–E contracts, or \`README.md\`, and is independently gated on 3/3 GREEN CI.

---

## 2. Complete Stakeholder Traceability Matrices

### 2.1 Acceptance Criteria Coverage (AC-S1-01..35 → VC/TEST-S1 → Actual Executed Tests)

| AC ID | Scenario & Acceptance Requirement | Anchor ID | Executed Test File & Case | Result |
| :--- | :--- | :--- | :--- | :---: |
| **AC-S1-01** | Valid Customer credentials authenticate with Customer role | \`VC-01/03\` | \`apps/api/test/auth.db.test.ts\` | **PASS** |
| **AC-S1-02** | Valid Tutor credentials authenticate with Tutor role | \`VC-01/03\` | \`apps/api/test/auth.db.test.ts\` | **PASS** |
| **AC-S1-03** | Invalid password or unknown credentials return generic 401 | \`VC-02\` | \`apps/api/test/auth.extended.db.test.ts\` (\`AUTH-02\`) | **PASS** |
| **AC-S1-04** | Logout revokes presented Session in DB; replay rejected 401 | \`VC-04\` | \`apps/api/test/auth.db.test.ts\` | **PASS** |
| **AC-S1-05** | Anonymous request to protected routes rejected 401 | \`VC-05\` | \`apps/api/test/guards.db.test.ts\`, \`retrieval.db.test.ts\` (\`RET-08\`) | **PASS** |
| **AC-S1-06** | Customer forging Tutor action denied 403; schedule unchanged | \`VC-06\` | \`apps/api/test/guards.db.test.ts\`, \`slots.db.test.ts\` | **PASS** |
| **AC-S1-07** | Tutor A cannot inspect or mutate Tutor B's private schedule | \`VC-07/31\` | \`apps/api/test/slots.db.test.ts\`, \`retrieval.db.test.ts\` (\`RET-06\`) | **PASS** |
| **AC-S1-08** | Tutor creates 60-minute future Slot; persisted on own schedule | \`VC-08/14\` | \`apps/api/test/slots.db.test.ts\` | **PASS** |
| **AC-S1-09** | Same Tutor creating overlapping Offered Slot rejected (\`23P01\` → 409) | \`VC-09\` | \`apps/api/test/slots.race.db.test.ts\` | **PASS** |
| **AC-S1-10** | Same Tutor creating adjacent 60-minute Slot permitted | \`VC-10\` | \`apps/api/test/slots.db.test.ts\` | **PASS** |
| **AC-S1-11** | Different Tutors offering identical interval permitted | \`VC-11\` | \`apps/api/test/slots.db.test.ts\` | **PASS** |
| **AC-S1-12** | Past or invalid Slot start rejected without persistence | \`VC-12\` | \`apps/api/test/slots.db.test.ts\` | **PASS** |
| **AC-S1-13** | Race A: Concurrent overlapping Slot writes serialize to 1 commit | \`VC-37\` | \`apps/api/test/slots.race.db.test.ts\` (\`SLOT-10/11\`) | **PASS** |
| **AC-S1-14** | Non-Bangkok browser timezone displays accurate Bangkok hours | \`VC-13\` | \`e2e/slots.spec.ts\`, \`e2e/availability.spec.ts\` | **PASS** |
| **AC-S1-15** | Customer browses eligible Offered Slots with Tutor ref and Bangkok time | \`VC-15\` | \`apps/api/test/availability.db.test.ts\` | **PASS** |
| **AC-S1-16** | Occupied Slots and Q05 <60m Slots excluded without Customer leakage | \`VC-15/22\` | \`apps/api/test/availability.db.test.ts\` | **PASS** |
| **AC-S1-17** | Submitting stale offer rechecks DB eligibility and rejects if taken | \`VC-22\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-07\`), \`e2e/booking.spec.ts\` | **PASS** |
| **AC-S1-18** | Device locale outside Bangkok does not shift schedule semantics | \`VC-13/15\` | \`e2e/availability.spec.ts\` | **PASS** |
| **AC-S1-19** | Customer books eligible Offered Slot; commits \`Booked\` row | \`VC-16\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-01\`) | **PASS** |
| **AC-S1-20** | Slot at 15:00 with DB \`T_elig\` = 14:00:00 (exact 60:00) accepted | \`VC-17\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-02\`), \`BDF-21\` | **PASS** |
| **AC-S1-21** | Slot at 15:00 with DB \`T_elig\` = 14:00:01 (59:59) rejected (\`P0B02\` → 422) | \`VC-18\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-03\`) | **PASS** |
| **AC-S1-22** | Customer B attempting to book Slot held by Customer A rejected 409 | \`VC-19\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-04\`) | **PASS** |
| **AC-S1-23** | Customer with Tutor A Booking rejected from overlapping Tutor B Slot (409) | \`VC-20\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-05\`) | **PASS** |
| **AC-S1-24** | Adjacent cross-Tutor interval permitted for same Customer (201) | \`VC-21\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-06\`) | **PASS** |
| **AC-S1-25** | Race B: Two Customers racing for one Slot serialize to <=1 commit | \`VC-25\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-10\`) | **PASS** |
| **AC-S1-26** | Race C: Customer concurrently booking overlapping Slots across Tutors serializes | \`VC-26\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-11\`) | **PASS** |
| **AC-S1-27** | Injected DB fault before COMMIT rolls back cleanly with 0 phantom rows | \`VC-22/27/33\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-12\`), \`booking.foundation.db.test.ts\` | **PASS** |
| **AC-S1-28** | Client-forged \`customerId\`/\`tutorId\` rejected; owner derived from Session | \`VC-24\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-09\`) | **PASS** |
| **AC-S1-29** | Same-pair natural-key retry returns 200 replay with 1 committed row | \`VC-38\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-13..16\`), \`e2e/booking.spec.ts\` | **PASS** |
| **AC-S1-30** | Customer retrieves persisted private Bookings across reload & process restart | \`VC-28\` | \`apps/api/test/retrieval.db.test.ts\` (\`RET-01/02/14\`) | **PASS** |
| **AC-S1-31** | Cross-Customer probe returns safe \`404 BOOKING_NOT_FOUND\` | \`VC-29\` | \`apps/api/test/retrieval.db.test.ts\` (\`RET-03\`), \`e2e/retrieval.spec.ts\` | **PASS** |
| **AC-S1-32** | Tutor retrieves own schedule Bookings with \`customerRef\` and zero PII | \`VC-30\` | \`apps/api/test/retrieval.db.test.ts\` (\`RET-04/05\`) | **PASS** |
| **AC-S1-33** | Cross-Tutor schedule query blocked; Tutor B sees zero Tutor A records | \`VC-31\` | \`apps/api/test/retrieval.db.test.ts\` (\`RET-06\`, \`RET-16\`) | **PASS** |
| **AC-S1-34** | Elapsed interval projects \`displayStatus: 'Past'\` with \`status: 'Booked'\` | \`VC-32\` | \`apps/api/test/retrieval.db.test.ts\` (\`RET-07/17\`) | **PASS** |
| **AC-S1-35** | Pre-cutoff request waiting across 60:00 lock wait rejected at post-wait \`T_elig\` | \`VC-39\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-17\`) | **PASS** |

### 2.2 Complete Cross-Cutting Verification Cases (\`VC-S1-34..39\`)

| VC / TEST ID | Scope | Executed Verification & Honest Gate Status | Observed Result |
| :--- | :--- | :--- | :---: |
| **VC-S1-34 / TEST-S1-34** | Full UI→API→DB Sprint 1 Journey | \`e2e/sprint1.journey.spec.ts\` (\`[39/64]\` in \`npx playwright test\`) + 8 screenshots | **PASS** |
| **VC-S1-35 / TEST-S1-35** | No stored secrets/plaintext/PII leaks | \`auth.db.test.ts\`, \`config.test.ts\`, \`retrieval.db.test.ts\` (\`RET-13\`), \`git grep\` clean | **PASS** |
| **VC-S1-36 / TEST-S1-36** | Performance p95 (NFR-010) & Keyboard/WCAG (NFR-009) | \`AVA-14\` (\`availability.db.test.ts\`) p95 < 2.0s: **PASS**; Playwright focus/reflow checks: **PASS**; Formal manual WCAG 2.2 human assistive-tech sign-off: **NOT RUN (Manual Gate)** | **PARTIAL (Auto PASS / Manual NOT RUN)** |
| **VC-S1-37 / TEST-S1-37** | Race A (concurrent same-Tutor overlapping Slots) | \`apps/api/test/slots.race.db.test.ts\` (\`SLOT-10/11\`) | **PASS** |
| **VC-S1-38 / TEST-S1-38** | Same-Customer natural-key duplicate/retry | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-13..16\`) & \`e2e/booking.spec.ts\` | **PASS** |
| **VC-S1-39 / TEST-S1-39** | Post-wait \`T_elig\` cutoff drift & Option 1 lock proof | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-17\`, \`BOOK-19 / BDF-23\`) | **PASS** |

*(Also note: \`AUTH-22\` deterministic multi-instance Argon2 barrier stress test covers single-process barrier in \`auth.barrier.db.test.ts\` [PASS] while full external multi-instance mixed stress remains transparently documented as PARTIAL in \`F-S1-01/tests.md\`.)*

---

## 3. Concurrency Invariants & Real Database Race Verification

The NutTiew platform enforces three distinct concurrency invariants at the PostgreSQL layer, verified with independent \`pg.Pool\` connections, \`pg_backend_pid()\`, and \`pg_blocking_pids()\` assertions:

### 3.1 Race A: Concurrent Slot Creation by Same Tutor (\`SLOT-10/11\` / \`SQLSTATE 23P01\`)
- **Constraint:** \`offered_slot_no_overlap_per_tutor EXCLUDE USING gist ("tutorId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&) WHERE ("lifecycle" = 'Offered')\`.
- **Observed Local Output (\`apps/api/test/slots.race.db.test.ts\` on PG 17.2):**
  \`\`\`json
  RACE_A_OBSERVED {"first":"A","holderPid":26720,"aPid":25556,"bPid":5156,"statuses":[201,409],"committed":["524d65df-c698-47f9-bc4b-902fdda60205"]}
  RACE_A_DIRECT_SQL_OBSERVED {"aPid":26720,"bPid":27588,"loserSQLSTATE":"23P01"}
  \`\`\`
  Exactly one conflicting \`Offered\` slot commits (\`201 Created\`); the competing transaction blocks on GiST, raises PostgreSQL \`23P01\` (\`exclusion_violation\`), and returns safe \`409 Conflict\`.

### 3.2 Race B: Concurrent Booking on Same Offered Slot (\`BOOK-10\` / \`SLOT_UNAVAILABLE\`)
- **Mechanism:** Ordered row lock \`SELECT "id" FROM "Slot" WHERE "id" = $1 FOR UPDATE\` followed by \`booking_guard_s1()\` and partial unique index \`booking_one_active_per_slot\`.
- **Observed Output (\`apps/api/test/bookings.db.test.ts\`):** Winner locks Slot, validates \`Offered\` and Q05, and commits \`201 Created\`; blocked waiter wakes after commit, sees \`Slot\` is occupied, and cleanly receives \`409 SLOT_UNAVAILABLE\`. Zero duplicate active Bookings.

### 3.3 Race C & Option 1 Interleaving Proof: Same-Customer Overlapping Cross-Tutor Bookings (\`BOOK-11\`, \`BOOK-19 / BDF-23\`)
- **Mechanism:** Remediation migration \`20261109000000_booking_guard_user_lock\` replaces \`booking_guard_s1()\` (\`SECURITY DEFINER\`) to lock \`User(customerId) FOR UPDATE\` inside the \`BEFORE ROW\` trigger *before* locking \`Slot\` and *before* inserting into \`booked_customer_no_overlap\` GiST index.
- **Observed Local Output (\`apps/api/test/bookings.db.test.ts\` on PG 17.2):**
  \`\`\`json
  BDF23_BOOK19_EVIDENCE {"canonicalPart1A":{"slotId":"a3d9ce7f-f5dc-40e7-804a-229c2c4c208a","roguePid":1980,"adapterUserPid":26260,"userBlockers":[1980],"outcome":"BOOKING_NOT_ELIGIBLE"},"canonicalPart1B":{"slotId":"1b4fae3b-35f5-4961-8ab4-073824aff944","roguePid":1980,"adapterSlotPid":26260,"slotBlockers":[1980],"outcome":"BOOKING_NOT_ELIGIBLE"},"canonicalPart1C":{"slotId":"92d8c642-2a77-403e-a247-941d369cd371","roguePid":1980,"adapterPid1C":26260,"rogueBlockers1C":[26260],"adapterReverseBlockers":[],"outcome":"23P01"},"canonicalPart1C2NoStaleCommit":{"slotId":"d9f200e3-1a5d-49be-af97-e8b884aaac38","roguePid":1980,"adapterPid1C2":26260,"adapterReverseBlockers":[],"commitNoticeMs":3599166,"outcome":201},"canonicalPart1D":{"slotId":"a4a9ccd6-97f2-44b9-a3d1-32004ee4b920","roguePid":1980,"adapterPid1D":26260,"rogueBlockers1D":[26260],"outcome":"23505"}}
  \`\`\`
  Notice \`adapterReverseBlockers: []\` in both Part 1C and Part 1C2 — proving zero reverse GiST waits and zero \`40P01\` deadlocks across both adapter-initiated and direct-SQL writers. Under 10 parallel overlapping Customer requests in \`BOOK-11\`, exactly 1 booking commits and 9 fail safely with \`409 CUSTOMER_OVERLAP\`.

---

## 4. Verbatim Executable Test Excerpts (Instructor §4.2)

### 4.1 Domain-Rule Test Excerpt: Q05 60-Minute Cutoff Post-Lock Drift (\`BOOK-17\`)
**Source File:** \`apps/api/test/bookings.db.test.ts\`, lines \`855–918\` (reproduced verbatim below).
**Rule Proven (\`AC-S1-35 / Q05\`):** When an eligible HTTP booking request arrives before the 60-minute cutoff (\`60m + 1.8s\`) but blocks on an active \`Slot\` \`FOR UPDATE\` lock until PostgreSQL \`clock_timestamp()\` crosses cutoff, \`booking_guard_s1()\` samples authoritative DB time *post-wait*, rejects with SQLSTATE \`P0B02\` (\`422 BOOKING_NOT_ELIGIBLE\`), and commits \`0\` rows.

\`\`\`typescript
// Verbatim excerpt from apps/api/test/bookings.db.test.ts (lines 855-918)
${domainRuleExcerpt}
\`\`\`

### 4.2 Authorization Test Excerpt: Cross-Customer Safe 404 & Cross-Tutor Schedule Isolation (\`RET-03\` & \`RET-06\`)
**Source File:** \`apps/api/test/retrieval.db.test.ts\`, fixture setup lines \`128–149\` and assertions lines \`214–224\` (\`RET-03\`) and \`278–297\` (\`RET-06\`) (reproduced verbatim below).
**Rules Proven (\`AC-S1-31 / AC-S1-33 / NFR-S1-01\`):** Cross-Customer reads against another Customer's Booking ID return safe \`404 BOOKING_NOT_FOUND\` (preventing existence confirmation via 403), and Tutor B cannot inspect Tutor A's bookings or override ownership via query parameters (\`400 INVALID_INPUT\`).

\`\`\`typescript
// Verbatim setup excerpt from apps/api/test/retrieval.db.test.ts (lines 128-149)
${authSetupExcerpt}

// Verbatim RET-03 excerpt (lines 214-224)
${authRet03Excerpt}

// Verbatim RET-06 excerpt (lines 278-297)
${authRet06Excerpt}
\`\`\`

---

## 5. Verifiable TDD RED-to-Green Commit History

Every critical domain and security fix followed observable **failing proof (RED) → remediation commit (GREEN)** recorded in Git history and feature verification ledgers:

1. **Case 1: \`BDF-28 / BDF-23\` Option 1 Lock-Order Remediation (Issue #39 / PR #40):**
   - **RED Observation (PR #38 commit [\`c8ebc4a\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/c8ebc4aff10d1f87ad86f45ddb16a59b28ce1804)):** Under the initial \`#33\` \`booking_guard_s1()\` trigger (locking only \`Slot\`), PostgreSQL's deferred \`AFTER ROW\` FK trigger allowed a direct-SQL writer to enter the \`booked_customer_no_overlap\` GiST index before locking \`User\`. In \`BOOK-19\` Part 1C, Adapter hit reverse wait \`adapterReverseBlockers: [roguePid]\` and SQLSTATE \`40P01\` deadlock, triggering the documented Option 1 Stop Gate.
   - **GREEN Fix (PR #40 commits [\`6bd92a8\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/6bd92a8557a594ef3bd68d14b20428712ec299cf) & [\`da17acf\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/da17acf845798cfb7a2e18abef679f5b1b7a8f88), merged [\`1ff4c2b\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/1ff4c2bb49fee9e903132bedf90867a4e26fb10b); \`#16\` verified commit [\`5dd02b9\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/5dd02b981e9b876bc6b7bed49f1e541baa7315de)):** Added forward-only migration \`20261109000000_booking_guard_user_lock\` redefining \`booking_guard_s1()\` (\`SECURITY DEFINER\`) to lock \`User(customerId) FOR UPDATE\` in \`BEFORE ROW\` before \`Slot\` and before index insertion. \`BDF-28\` reproduces legacy failure in an isolated schema (Part 1) and proves zero reverse wait (\`adapterReverseBlockers: []\`) on canonical schema (Part 2).
2. **Case 2: \`BOOK-17\` & Trigger \`T_elig\` Authority vs Application Heuristic (Issue #16 / PR #38):**
   - **RED / Review Finding (between commits [\`222b5d3\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/222b5d3812883877bd229db1be6e945641b12c15) and [\`2e59b89\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/2e59b89e0bcc86617baacddc89ccc182a9c2c9ed)):** Application-layer heuristic \`statementDurationMs >= 150\` conflicted with \`transaction-spec.md\` §5 ("a valid 60:00 guard may still commit later"), and fixture reuse caused early overlap failure in \`BOOK-17\` (\`docs/features/F-S1-04/verification-ledger.md\`).
   - **GREEN Fix (commits [\`2e59b89\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/2e59b89e0bcc86617baacddc89ccc182a9c2c9ed) & [\`865114a\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/865114a1fc43a8855a001d997f7fb0d2954ec287)):** Removed the app duration heuristic, restored exclusive \`booking_guard_s1()\` post-lock \`clock_timestamp()\` authority, and verified \`BOOK-17\` rejecting cross-cutoff contention at \`422 BOOKING_NOT_ELIGIBLE\`.
3. **Case 3: Error Status Precedence Before Session-Binding Check (Issue #17 / PR #42):**
   - **RED Review Finding (on commit [\`e6d9cac\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/e6d9cac)):** \`apps/web/src/customer-availability.tsx\` inspected \`X-NutTiew-Session-Binding\` before \`!res.ok\`, risking false session-mismatch logouts on injected/transient \`404\` and \`503\` error envelopes that omit binding headers.
   - **GREEN Fix (commit [\`4c60267\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/4c60267200e3fb04edbdb6b7e39ef28fcad8afc6)):** Reordered HTTP status handling before session-binding validation and added deterministic E2E regression tests \`RET-15-ERR-503\` and \`RET-15-ERR-404\` in \`e2e/retrieval.spec.ts\`.

---

## 6. End-to-End Vertical Journey Walkthrough & Screenshots

Executed against real React 19 UI, Express 5 API, and PostgreSQL persistence via \`e2e/sprint1.journey.spec.ts\`:

### Milestone 1: Tutor Logs In & Creates 60-Minute Slot
![01 Tutor Slot Created](../evidence/sprint1/01-tutor-slot-created.png)

### Milestone 2: Customer Browses Available Tutoring Offers
![02 Customer Availability Browse](../evidence/sprint1/02-customer-availability-browse.png)

### Milestone 3: Customer Confirms Booking
![03 Customer Booking Confirmed](../evidence/sprint1/03-customer-booking-confirmed.png)

### Milestone 4: Customer Private Booking List
![04 Customer Private Bookings](../evidence/sprint1/04-customer-private-bookings.png)

### Milestone 5: Customer Booking Detail Modal
![05 Customer Detail Modal](../evidence/sprint1/05-customer-detail-modal.png)

### Milestone 6: Tutor Schedule View (Occupied & Pseudonymous \`CUST-...\`)
![06 Tutor Schedule Occupied](../evidence/sprint1/06-tutor-schedule-occupied.png)

### Milestone 7: Negative Business Rule Rejection (409 Conflict)
![07 Negative Conflict 409](../evidence/sprint1/07-negative-conflict-409.png)

### Milestone 8: Negative Cross-Customer Access Refusal (Safe 404)
![08 Negative Cross Customer 404](../evidence/sprint1/08-negative-cross-customer-404.png)

---

## 7. Substantive Teammate Peer Review Evidence

1. **Pull Request #38 — F-S1-04 Customer Exclusive Booking (\`feature/16-exclusive-booking\` → \`sprint1\`):**
   - Author: @Chxtamos | Reviewer: @Tanaboonnnnn | Issue: [#16](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16)
   - Substantive interventions resolved: decoupled CSRF retry UX, session-binding rebootstrap without kicking valid Customer sessions, removed duration heuristic, discovered Part 1C FK reverse-wait deadlock leading to Issue [#39](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/39) / PR [#40](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/40), merged into \`sprint1\` at \`ed78bba\`.
2. **Pull Request #42 — F-S1-05 Protected Booking Retrieval (\`feature/17-booking-retrieval\` → \`sprint1\`):**
   - Author: @Chxtamos | Reviewer: @Tanaboonnnnn | Issue: [#17](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/17)
   - Substantive interventions resolved: decoupled Tutor slot vs booking AbortControllers, eliminated trigger tampering in E2E fixtures, fixed \`!res.ok\` precedence before \`X-NutTiew-Session-Binding\` with \`RET-15-ERR-404/503\`, merged into \`sprint1\` at \`9d24fca\`.
3. **Pull Request #43 — D1-10 Deliverable 1 Integration (\`docs/18-deliverable-1-integration\` → \`sprint1\`):**
   - Author: @Chxtamos | Reviewer: @Tanaboonnnnn | Issue: [#18](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/18)
   - Multiple rigorous review rounds resolving README least-privilege bootstrap order & seed envs, Express 5 / React 19 fidelity, canonical AC/VC mapping, complete embedded Parts A–E contracts, verbatim test excerpts, Mermaid vector verification, and computed PDF page ranges.

---

## 8. Team Contribution Matrix

| Contributor | Contribution | Primary Responsibilities & Deliverables |
| :--- | :---: | :--- |
| **Tanboon Teawsawat** (@Tanaboonnnnn) | **50%** | Requirements discovery (Q01–Q32), Whole-product SRS & Traceability Matrix, System SDS, Three-Sprint Delivery Plan, Project #6 Kanban governance, and substantive peer reviews across PRs #25–#43 |
| **Chxtamos** (@Chxtamos) | **50%** | Express 5 REST API, PostgreSQL schema/GiST constraints/triggers, Option 1 concurrency lock ordering, React 19 UI, automated Unit/DB/Playwright tests, and Deliverable 1 markdown/PDF packaging |

---

## 9. Academic Integrity & AI Usage Declaration

- **AI Assistant Declared:** Google Antigravity / Gemini agentic coding assistant.
- **Usage Scope:** Drafting boilerplate TypeScript interfaces, structuring \`pg_blocking_pids()\` concurrency test harnesses, automating Markdown/PDF compilation, and verifying cross-references.
- **Human Accountability:** All product business rules (Q01–Q32), lock-ordering architecture decisions, security trust boundaries, and peer reviews were evaluated and accepted by human team members. Zero test results or deliverables were fabricated or accepted without real execution against PostgreSQL and browser suites.

---

## 10. Definition of Done (DoD) Checklist (Truthful Status)

| Quality Gate / Requirement | Verification Evidence | DoD Status |
| :--- | :--- | :---: |
| **Whole-product Parts A–D embedded verbatim** | Complete SRS, Inventory, Traceability, System SDS & 3-Sprint Plan inside PDF | **Complete** |
| **All Sprint 1 Part E contracts embedded verbatim** | Full F-S1-01..05 + Shared Booking Data specs/UI/API/Data/Transaction/STS inside PDF | **Complete** |
| **Real working UI → API → PostgreSQL vertical slice** | Verified on React 19, Express 5, PostgreSQL 17.2 (local) & 18 (CI) | **Complete** |
| **Automated verification suite** | 199 distinct tests (29 Unit + 106 DB + 64 E2E) PASS; typecheck & build clean | **Complete** |
| **Formal manual WCAG 2.2 human audit** | Automated checks PASS; manual assistive-tech sign-off remains separate manual gate | **Not Run (Manual Gate)** |
| **Reproducible README setup** | Owner DB + post-migration grants + seed env vars smoke-tested on PG 17.2 | **Complete** |
| **Staging PR #43 review & \`sprint1 -> main\` release PR** | PR #43 awaiting final peer review by @Tanaboonnnnn before release PR & tag | **Pending Peer Approval** |
| **Private Student IDs & LEB2 External Submission** | Student IDs withheld from public repo; team supplies IDs & final PDF to LEB2 | **Pending Release & LEB2 Handoff** |

---

*End of CPE334 NutTiew Deliverable 1 Submission Document.*
`;

  const finalDocument = [
    coverSection,
    partA,
    partB,
    partC,
    partD,
    partE,
    partFSection,
  ].join('\n\n');

  const cleanFinalDocument = finalDocument
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n');

  const outputPath = resolve(rootDir, 'docs/deliverables/deliverable-1.md');
  writeFileSync(outputPath, cleanFinalDocument, 'utf8');
  console.log('Compiled Deliverable 1 markdown:', outputPath);
  console.log('Total lines:', cleanFinalDocument.split('\n').length, '| Characters:', cleanFinalDocument.length);
  return outputPath;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  compileDeliverable();
}
