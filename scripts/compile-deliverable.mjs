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
  { relPath: 'docs/features/F-S1-03/ui-decision-2026-11-10.md', heading: 'E.4.2a F-S1-03 Monthly Calendar UX Decision Amendment (ui-decision-2026-11-10.md)', level: 3, shift: 2, keepH1: false },
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
  const testedSha = options.testedSha ?? process.env.D1_TESTED_SHA ?? 'c4c599d';
  const ciRunId = options.ciRunId ?? process.env.D1_CI_RUN_ID ?? '42979184176';
  const ciRunUrl = options.ciRunUrl ?? process.env.D1_CI_RUN_URL ?? 'https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42979184176';
  const docGenDate = options.docGenDate ?? '11 November 2026 (Asia/Bangkok)';
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
- **Integration Staging Base SHA:** \`c4c599d\` on branch \`sprint1\` (following merged [PR #43](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/43) \`7449581\`, [PR #45](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/45) \`567ec1c\`, [PR #47](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/47) \`9aa37c0\`, and [PR #51](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/51) \`c4c599d\`; release branch \`main\` remains at \`b501c18\`)
- **Verified Code & DB Baseline SHA:** \`${testedSha}\` on \`sprint1\` (Deliverable 1 source/PDF sync tracked in Issue [#48](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/48) / [PR #49](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/49); historical PR #43 baseline \`808b906\` preserved below)
- **Verified GitHub Actions CI Run:** [Run ${ciRunId}](${ciRunUrl}) — 3/3 Jobs PASS (\`Unit / types / build\`, \`PostgreSQL 18 / Auth / Slot / Race A\`, \`Microsoft Edge / Auth / Tutor UI E2E\`; **209 distinct automated tests: 34 Unit + 107 DB + 68 E2E**)
- **Target Release Branch:** \`main\` (Pending teammate review and approval of [PR #49](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/49), **Independent Formal Manual WCAG 2.2 AA & Screen-Reader Release Sign-off** [\`Pending\` — distinct from @Chxtamos's \`2026-11-11\` informal author walkthrough; see Part F §6.4], Master Spec / Theme 1 confirmation, and separate reviewed \`sprint1 -> main\` release PR + immutable tag)
- **Course Handout Deadline:** 8 November 2026, 23:59 ICT *(subsequent post-baseline PRs [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44)/[#47](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/47), [#50](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/50)/[#51](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/51), and Deliverable 1 sync PR [#49](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/49) transparently documented below — never presented as on-time submission proof)*
- **Report Compilation Date:** ${docGenDate}
- **Total PDF Pages:** ${pr.totalPages ? `${pr.totalPages} pages` : 'Computing...'}

---

### Team Members & Identification

| Student Full Name | Student ID | GitHub Username | Project Role & Responsibility |
| :--- | :--- | :--- | :--- |
| **Tanboon Teawsawat** | *(Supplied Privately via LEB2 handoff)* | [@Tanaboonnnnn](https://github.com/Tanaboonnnnn) | Requirements Discovery Lead (Q01–Q32), Whole-Product SRS & SDS Architecture, Three-Sprint Plan, Project #6 Kanban, UX Governance & Peer Reviewer |
| **Chxtamos** | *(Supplied Privately via LEB2 handoff)* | [@Chxtamos](https://github.com/Chxtamos) | Express 5 REST API & PostgreSQL Schema/Trigger Implementation, Concurrency Lock Ordering, React 19 UI & Design Tokens, Automated Tests, PDF Lead |

> **Privacy Notice on Student Identification:** In compliance with student privacy protection and academic repository standards, full KMUTT Student ID numbers are withheld from public Git commit histories and supplied privately through the official university course submission portal (LEB2).

---

## Executive Summary & Document Navigation Guide

**NutTiew (นัดติว)** is a one-to-one tutoring appointment and scheduling web application developed under CPE334 Software Engineering. This document is a **fully self-contained Deliverable 1 submission** packaging **Parts A through F** verbatim from approved canonical repository contracts and verified Sprint 1 test runs on \`sprint1@${testedSha}\`, gradable completely offline without opening the repository.

### Actual PDF Page Ranges & Traceability Navigation

| Document Part / Section | Primary Content & Scope | Relevant Requirement / Contract IDs | PDF Pages |
| :--- | :--- | :--- | :---: |
| **Cover, Team & Navigation** | Metadata, team roles, confidentiality note, actual PDF navigation index | D1 §4.3 | ${fmtRange('cover')} |
| [**Part A: Whole-Product SRS**](#part-a-whole-product-software-requirements-specification-srs) | Complete problem domain, actors, Sprints 1–3 requirements, rules & Q01–Q32 | \`FR-001..036\`, \`BR-001..035\`, \`NFR-001..016\`, \`Q01–Q32\` | ${fmtRange('partA')} |
| [**Part B: Feature Inventory & Traceability**](#part-b-feature-inventory-requirements-traceability-matrix) | Whole-product feature catalog and canonical \`AC-S1-01..35\` / \`VC/TEST-S1-01..39\` mapping | \`F-S1-01..05\`, \`F-S2-01..05\`, \`F-S3-01..02\`, \`AC-S1-01..35\` | ${fmtRange('partB')} |
| [**Part C: Whole-Product System SDS**](#part-c-whole-product-system-software-design-specification-sds) | System architecture, Express 5 + React 19 + PostgreSQL DDL, Mermaid diagrams, future Lab 5 deployment design | C4 diagrams, \`btree_gist\`, \`slot_guard_s1\`, \`booking_guard_s1\` | ${fmtRange('partC')} |
| [**Part D: Feasible Three-Sprint Plan**](#part-d-feasible-three-sprint-delivery-plan) | Milestones, feature dependency order, two-student capacity, risks & Sprint 1 DoD boundary | Deliverable D1/D2/Final checkpoints | ${fmtRange('partD')} |
| [**Part E: Sprint 1 Feature Contracts & STSs**](#part-e-sprint-1-feature-specifications-software-test-specifications) | Complete embedded Part E Feature SDS, UI Spec, UX Amendments, API Spec, Data Spec, Transaction Spec, STS & DoD | All 6 Part E components (31 full contract docs) | ${fmtRange('partE')} |
| — [**E.1 F-S1-01 Authentication & Sessions**](#e1-f-s1-01-authentication-sessions-rate-limiting) | SDS, Token-Aligned UI Spec, API Contract, Data Contract, STS & Gate | \`AUTH-01..23\`, \`OD-005-A..E\` | ${fmtRange('e1')} |
| — [**E.2 F-S1-02 Tutor Slot Availability**](#e2-f-s1-02-tutor-slot-availability-scheduling) | SDS, UI Spec, Tutor Calendar UX Decision, API Spec, Data Spec, STS | \`SLOT-01..17\`, Race A | ${fmtRange('e2')} |
| — [**E.3 Shared Booking Data Foundation**](#e3-shared-booking-data-foundation-d1-08a) | Foundation SDS, Shared Data Spec, Shared DB STS & Trigger Guards | \`BDF-01..28\`, \`booking_guard_s1\` | ${fmtRange('e3')} |
| — [**E.4 F-S1-03 Customer Availability**](#e4-f-s1-03-customer-availability-browse-filter) | SDS, Amended UI Spec, Option A Calendar UX Decision, API Contract, Data Contract, STS | \`AVA-01..19\`, \`UX-CAL-01..10\` | ${fmtRange('e4')} |
| — [**E.5 F-S1-04 Exclusive Booking & Races**](#e5-f-s1-04-customer-exclusive-booking-concurrency-protection) | SDS, UI Spec, API Spec, Data Spec, Transaction Lock/Retry Contract, STS | \`BOOK-01..33\`, Race B, Race C, \`BDF-23\` | ${fmtRange('e5')} |
| — [**E.6 F-S1-05 Booking Retrieval & Tutor View**](#e6-f-s1-05-protected-booking-retrieval-authorized-tutor-schedule) | SDS, UI Spec, API Spec, Data Contract, STS | \`RET-01..17\`, \`INV-RET-01..05\` | ${fmtRange('e6')} |
| [**Part F: Sprint 1 Verification & Release Evidence**](#part-f-sprint-1-implementation-verification-release-evidence) | 209 distinct tests, \`AC-S1-01..35\` & \`VC/TEST-S1-01..39\` matrices, Race A/B/C proofs, verbatim excerpts, TDD history, 16 annotated screenshots + \`409/404\` backend proofs, peer reviews (#38–#51), 3-layer WCAG status & honest DoD | 209/209 CI PASS; Author check PASS; Formal WCAG & release pending | ${fmtRange('partF')} |

---
`;

  const byPath = Object.fromEntries(EMBEDDED_SECTIONS.map(s => [s.relPath, transformEmbeddedDoc(s)]));

  const partA = byPath['docs/srs.md'];
  const partB = `# Part B: Feature Inventory & Requirements Traceability Matrix\n\n${byPath['docs/features.md']}\n\n---\n\n${byPath['docs/traceability.md']}`;
  const partC = byPath['docs/system-sds.md'];
  const partD = byPath['docs/sprints/plan.md'];

  const partE = [
    '# Part E: Sprint 1 Feature Specifications & Software Test Specifications',
    '> **Completeness Notice:** Every reviewed and accepted Sprint 1 Part E contract (\`specification.md\`, \`ui-spec.md\`, \`ui-decision-2026-11-05.md\`, \`ui-decision-2026-11-10.md\`, \`api-spec.md\`, \`data-spec.md\`, \`transaction-spec.md\`, and \`tests.md\`) is embedded **verbatim in full** below so this PDF stands alone without external repository links.',
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
    byPath['docs/features/F-S1-03/ui-decision-2026-11-10.md'],
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

Automated verification was executed across both **GitHub Actions Ubuntu 24.04 CI** ([Run ${ciRunId}](${ciRunUrl}) on \`sprint1@${testedSha}\`: Node 24, PostgreSQL 18, Microsoft Edge) and **local Windows 11** (Node v24.14.0, PostgreSQL 17.2 + \`btree_gist\` 1.7, Prisma Client 7.10.1, Vitest 4.1.12, Microsoft Edge Playwright 1.64.1 on branch \`docs/48-deliverable-1-pdf-9aa37c0\` merging \`sprint1@${testedSha}\` with zero \`apps/\` or \`e2e/\` differences).

| Verification Gate / Suite | Execution Command | Environment | Passed | Failed | Skipped | Distinct Total |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **Pure Domain & UI Helper Unit Tests** | \`npm test\` | Local + CI (Node 24) | **34** | 0 | 0 | **34** |
| **Real PostgreSQL DB Integration & Concurrency** | \`npm run test:db\` (CI) / sequential \`--fileParallelism=false\` (Local Win11 PG 17.2) | Local (PG 17.2) + CI (PG 18) | **107** | 0 | 0 | **107** |
| **Browser End-to-End Suite (incl. Login Theme, Option A Calendar & Sprint 1 Journey)** | \`npx playwright test\` | Local + CI (MS Edge) | **68** | 0 | 0 | **68** |
| **TypeScript Static Typecheck** | \`npm run typecheck\` | Local + CI | 0 errors | 0 | - | **Clean** |
| **Production Build** | \`npm run build\` | Local + CI | Clean | 0 | - | **Clean** |
| **Git Whitespace & Patch Check** | \`git diff --check\` | Local | Clean | 0 | - | **Clean** |

> **Total Distinct Automated Tests on \`sprint1@${testedSha}\`:** \`34\` (Unit: 29 \`@nuttiew/api\` + 5 \`@nuttiew/web\`) + \`107\` (Real DB across 14 files) + \`68\` (MS Edge E2E across 11/12 spec files) = **\`209\` Distinct Tests (\`209\` Passed, \`0\` Failed, \`0\` Skipped)**

> **Accounting, Environment & Historical Baseline Transparency Notes:**
> 1. **No Double-Counting:** The 68-test Microsoft Edge suite (\`npx playwright test\`) already executes \`e2e/sprint1.journey.spec.ts\`, \`e2e/availability.calendar.spec.ts\` (\`4\` tests), and \`e2e/auth.a11y.spec.ts\` (\`2\` tests). The true count of unique automated tests is **209** (\`34 + 107 + 68\`).
> 2. **Evolution from PR #43 Baseline (\`199\` → \`209\`):** [PR #43](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/43) (\`808b906\`, CI Run [\`42783770373\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42783770373)) passed \`29 + 106 + 64 = 199\` tests. Subsequent Issue [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44) / [PR #47](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/47) (\`9aa37c0\`) added **+5** Web calendar unit tests (\`apps/web/test/customer-availability-calendar.test.ts\`), **+1** \`520\`-row PostgreSQL latency benchmark (\`AVA14_BENCHMARK_500\`), and **+4** Option A calendar E2E tests (\`e2e/availability.calendar.spec.ts\`) = **209**. Issue [#50](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/50) / [PR #51](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/51) (\`c4c599d\`) aligned Login/Auth \`--nuttiew-*\` tokens, strengthened \`e2e/auth.a11y.spec.ts\`, and fixed the UTC/Bangkok \`raceSlot\` boundary in \`e2e/sprint1.journey.spec.ts\`.
> 3. **Local Windows PostgreSQL Parallelism vs Hosted CI PG 18:** On local Windows PG 17.2, launching all 14 DB files concurrently via default \`vitest run\` caused local worker/connection-pool timeouts (\`8 failed | 98 passed | 1 skipped\`); running the identical 14-file suite sequentially with \`--fileParallelism=false\` passed **14/14 files = \`107/107\` PASS** in \`115.07s\`. Hosted CI on Ubuntu PostgreSQL 18 ([Run ${ciRunId}](${ciRunUrl})) passed the default parallel command **\`107/107\`** cleanly in \`59s\` (and earlier Run [\`#42672763881\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42672763881) transient dispatch failure on \`0efa30b\` passed 3/3 on Attempt 2).
> 4. **520-Row Customer Availability Profiling (\`AVA14_BENCHMARK_500\`):** Local sequential PG 17.2 measured \`90,591\` UTF-8 bytes for \`520\` rows at \`p50 = 45.19 ms\`, \`p95 = 68.21 ms\`, \`max = 76.11 ms\` (isolated PG 17.2 in PR #47: \`p95 = 12.28 ms\`; hosted CI PG 18 at \`5a32d05\`: \`p95 = 9.66 ms\`), staying \`< 3.5%\` of the \`2,000 ms\` reference. Phase 1 client-side calendar indexing remains sufficient.

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
| **AC-S1-14** | Non-Bangkok browser timezone displays accurate Bangkok hours | \`VC-13\` | \`e2e/slots.spec.ts\`, \`e2e/availability.spec.ts\`, \`availability.calendar.spec.ts\` | **PASS** |
| **AC-S1-15** | Customer browses eligible Offered Slots with Tutor ref and Bangkok time | \`VC-15\` | \`apps/api/test/availability.db.test.ts\`, \`e2e/availability.calendar.spec.ts\` | **PASS** |
| **AC-S1-16** | Occupied Slots and Q05 <60m Slots excluded without Customer leakage | \`VC-15/22\` | \`apps/api/test/availability.db.test.ts\` | **PASS** |
| **AC-S1-17** | Submitting stale offer rechecks DB eligibility and rejects if taken | \`VC-22\` | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-07\`), \`e2e/booking.spec.ts\` | **PASS** |
| **AC-S1-18** | Device locale outside Bangkok does not shift schedule semantics | \`VC-13/15\` | \`e2e/availability.spec.ts\`, \`e2e/availability.calendar.spec.ts\` (\`UX-CAL-07\`) | **PASS** |
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
| **VC-S1-34 / TEST-S1-34** | Full UI→API→DB Sprint 1 Journey | \`e2e/sprint1.journey.spec.ts\` (inside \`68\`-test Playwright suite) + 8 refreshed screenshots on \`c4c599d\` | **PASS** |
| **VC-S1-35 / TEST-S1-35** | No stored secrets/plaintext/PII leaks | \`auth.db.test.ts\`, \`config.test.ts\`, \`retrieval.db.test.ts\` (\`RET-13\`), \`git grep\` clean | **PASS** |
| **VC-S1-36 / TEST-S1-36** | Performance p95 (NFR-010) & Keyboard/WCAG (NFR-009) | \`AVA14_BENCHMARK_500\` (\`p95 = 68.21ms\` local sequential / \`9.66ms\` CI PG 18): **PASS**; Automated Playwright focus, \`44×44px\` targets (\`>=36×44px\` day tile at \`320px\`), \`--nuttiew-*\` contrast (\`>=4.5:1\` text / \`>=3:1\` UI) & reflow checks (\`auth.a11y.spec.ts\`, \`availability.calendar.spec.ts\`): **PASS**; Informal Author Manual Walkthrough (@Chxtamos, \`2026-11-11\` ICT localhost Keyboard/375px/200%/Screen-Reader + E2E): **PASS (Author Check Only)**; **Independent Formal Manual WCAG 2.2 AA & Screen-Reader Release Sign-off: Pending** | **PARTIAL (Auto + Author PASS / Formal Sign-off Pending)** |
| **VC-S1-37 / TEST-S1-37** | Race A (concurrent same-Tutor overlapping Slots) | \`apps/api/test/slots.race.db.test.ts\` (\`SLOT-10/11\`) | **PASS** |
| **VC-S1-38 / TEST-S1-38** | Same-Customer natural-key duplicate/retry | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-13..16\`) & \`e2e/booking.spec.ts\` | **PASS** |
| **VC-S1-39 / TEST-S1-39** | Post-wait \`T_elig\` cutoff drift & Option 1 lock proof | \`apps/api/test/bookings.db.test.ts\` (\`BOOK-17\`, \`BOOK-19 / BDF-23\`) | **PASS** |

### 2.3 Additive Post-Baseline UX Verification Matrix (\`UX-CAL-01..10\` & Login Theme \`AUTH-15\`)

| Addendum Scope / Case IDs | Feature / PR Reference | Executed Verification & Remaining Gate | Observed Result |
| :--- | :--- | :--- | :---: |
| **\`UX-CAL-01..07\`** | \`F-S1-03\` Option A Monthly Calendar (Issue [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44) / [PR #47](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/47)) | \`customer-availability-calendar.test.ts\` (**5/5** unit), \`e2e/availability.calendar.spec.ts\` (**4/4** incl. 522-row DOM collapse, Nov→Dec empty→Jan + \`2028-02-29\` leap day, exact interval key, no navigation \`POST\`, fail-closed \`503\`/malformed DTO, \`UTC\` & \`America/Los_Angeles\` projection) | **PASS** |
| **\`UX-CAL-08..09\`** | Responsive geometry, disclosure focus transfer & computed contrast | \`320/375/640(200%)/768/800/801/1280px\` zero overflow, \`ดูเวลาเพิ่มเติม\` → 7th group focus transfer (\`5a32d05\`), \`3px solid #AA4519\` focus ring, \`position: static\` summary (**PASS**); Informal Author Manual Walkthrough by @Chxtamos on \`2026-11-11\` (**PASS — Author Check Only**); Independent Formal Sign-off remains Pending | **PARTIAL (Auto + Author PASS / Formal Sign-off Pending)** |
| **\`AUTH-15\` Token Alignment** | \`F-S1-01\` Login Navy + Orange + Light Canvas (Issue [#50](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/50) / [PR #51](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/51)) | \`e2e/auth.a11y.spec.ts\` (**2/2** computed \`rgb(247,248,251)\` canvas, \`#202B44\` heading, \`#F47736\`/\`#172137\` CTA \`5.76:1\`, \`#66778A\` control border \`>=3:1\`, \`#FFF3F3\`/\`#9C2424\` alert, \`320–1280px\` \`>=44×44px\` targets) + \`15/15\` Auth E2E (**PASS**); Informal Author Manual Walkthrough by @Chxtamos on \`2026-11-11\` (**PASS — Author Check Only**); Independent Formal Sign-off remains Pending | **PARTIAL (Auto + Author PASS / Formal Sign-off Pending)** |

*(Also note: \`AUTH-22\` deterministic multi-instance Argon2 barrier stress test covers single-process barrier in \`auth.barrier.db.test.ts\` [PASS] while full external multi-instance mixed stress remains transparently documented as PARTIAL in \`F-S1-01/tests.md\`.)*

---

## 3. Concurrency Invariants & Real Database Race Verification

The NutTiew platform enforces three distinct concurrency invariants at the PostgreSQL layer, verified with independent \`pg.Pool\` connections, \`pg_backend_pid()\`, and \`pg_blocking_pids()\` assertions:

### 3.1 Race A: Concurrent Slot Creation by Same Tutor (\`SLOT-10/11\` / \`SQLSTATE 23P01\`)
- **Constraint:** \`offered_slot_no_overlap_per_tutor EXCLUDE USING gist ("tutorId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&) WHERE ("lifecycle" = 'Offered')\`.
- **Observed Local Output (\`apps/api/test/slots.race.db.test.ts\` on PG 17.2, \`sprint1@${testedSha}\`):**
  \`\`\`json
  RACE_A_OBSERVED {"first":"A","holderPid":13504,"aPid":24868,"bPid":15532,"statuses":[201,409],"committed":["6d6f6547-0d9d-422c-8c2b-023cd06c8773"]}
  RACE_A_DIRECT_SQL_OBSERVED {"aPid":13504,"bPid":15308,"loserSQLSTATE":"23P01"}
  \`\`\`
  Exactly one conflicting \`Offered\` slot commits (\`201 Created\`); the competing transaction blocks on GiST, raises PostgreSQL \`23P01\` (\`exclusion_violation\`), and returns safe \`409 Conflict\`.

### 3.2 Race B: Concurrent Booking on Same Offered Slot (\`BOOK-10\` / \`SLOT_UNAVAILABLE\`)
- **Mechanism:** Ordered row lock \`SELECT "id" FROM "Slot" WHERE "id" = $1 FOR UPDATE\` followed by \`booking_guard_s1()\` and partial unique index \`booking_one_active_per_slot\`.
- **Observed Output (\`apps/api/test/bookings.db.test.ts\`):** Winner locks Slot, validates \`Offered\` and Q05, and commits \`201 Created\`; blocked waiter wakes after commit, sees \`Slot\` is occupied, and cleanly receives \`409 SLOT_UNAVAILABLE\`. Zero duplicate active Bookings.

### 3.3 Race C & Option 1 Interleaving Proof: Same-Customer Overlapping Cross-Tutor Bookings (\`BOOK-11\`, \`BOOK-19 / BDF-23\`)
- **Mechanism:** Remediation migration \`20261109000000_booking_guard_user_lock\` replaces \`booking_guard_s1()\` (\`SECURITY DEFINER\`) to lock \`User(customerId) FOR UPDATE\` inside the \`BEFORE ROW\` trigger *before* locking \`Slot\` and *before* inserting into \`booked_customer_no_overlap\` GiST index.
- **Observed Local Output (\`apps/api/test/bookings.db.test.ts\` on PG 17.2, \`sprint1@${testedSha}\`):**
  \`\`\`json
  BDF23_BOOK19_EVIDENCE {"canonicalPart1A":{"slotId":"7f19db9a-c420-40d9-b29f-4c54399384c5","roguePid":29896,"adapterUserPid":22132,"userBlockers":[29896],"outcome":"BOOKING_NOT_ELIGIBLE"},"canonicalPart1B":{"slotId":"543ea446-3402-4629-b1ba-6f612eec53a6","roguePid":29896,"adapterSlotPid":22132,"slotBlockers":[29896],"outcome":"BOOKING_NOT_ELIGIBLE"},"canonicalPart1C":{"slotId":"4d9b0543-7ad5-4381-bfaa-965e39909766","roguePid":29896,"adapterPid1C":22132,"rogueBlockers1C":[22132],"adapterReverseBlockers":[],"outcome":"23P01"},"canonicalPart1C2NoStaleCommit":{"slotId":"b13f45e0-8d91-49ea-9636-9463bfe9da47","roguePid":29896,"adapterPid1C2":22132,"adapterReverseBlockers":[],"commitNoticeMs":3599120,"outcome":201},"canonicalPart1D":{"slotId":"b0cd8f7d-3122-4fd3-aa51-d1b85ab5d433","roguePid":29896,"adapterPid1D":22132,"rogueBlockers1D":[22132],"outcome":"23505"},"isolatedStressPart2":{"stressSchema":"nuttiew_bdf23_stress_bebd3e30","slotId":"a6931873-9823-403b-b405-ac09fc0d9f62","stressRoguePid":30092,"adapterInsertPid":23564,"indexBlockers":[30092],"outcome":201}}
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

Every critical domain, concurrency, and UI alignment fix followed observable **failing proof (RED) → remediation commit (GREEN)** recorded in Git history and feature verification ledgers:

1. **Case 1: \`BDF-28 / BDF-23\` Option 1 Lock-Order Remediation (Issue #39 / PR #40):**
   - **RED Observation (PR #38 commit [\`c8ebc4a\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/c8ebc4aff10d1f87ad86f45ddb16a59b28ce1804)):** Under the initial \`#33\` \`booking_guard_s1()\` trigger (locking only \`Slot\`), PostgreSQL's deferred \`AFTER ROW\` FK trigger allowed a direct-SQL writer to enter the \`booked_customer_no_overlap\` GiST index before locking \`User\`. In \`BOOK-19\` Part 1C, Adapter hit reverse wait \`adapterReverseBlockers: [roguePid]\` and SQLSTATE \`40P01\` deadlock, triggering the documented Option 1 Stop Gate.
   - **GREEN Fix (PR #40 commits [\`6bd92a8\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/6bd92a8557a594ef3bd68d14b20428712ec299cf) & [\`da17acf\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/da17acf845798cfb7a2e18abef679f5b1b7a8f88), merged [\`1ff4c2b\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/1ff4c2bb49fee9e903132bedf90867a4e26fb10b); \`#16\` verified commit [\`5dd02b9\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/5dd02b981e9b876bc6b7bed49f1e541baa7315de)):** Added forward-only migration \`20261109000000_booking_guard_user_lock\` redefining \`booking_guard_s1()\` (\`SECURITY DEFINER\`) to lock \`User(customerId) FOR UPDATE\` in \`BEFORE ROW\` before \`Slot\` and before index insertion. \`BDF-28\` reproduces legacy failure in an isolated schema (Part 1) and proves zero reverse wait (\`adapterReverseBlockers: []\`) on canonical schema (Part 2).
2. **Case 2: \`BOOK-17\` & Trigger \`T_elig\` Authority vs Application Heuristic (Issue #16 / PR #38):**
   - **RED / Review Finding (between commits [\`222b5d3\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/222b5d3812883877bd229db1be6e945641b12c15) and [\`2e59b89\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/2e59b89e0bcc86617baacddc89ccc182a9c2c9ed)):** Application-layer heuristic \`statementDurationMs >= 150\` conflicted with \`transaction-spec.md\` §5 ("a valid 60:00 guard may still commit later"), and fixture reuse caused early overlap failure in \`BOOK-17\` (\`docs/features/F-S1-04/verification-ledger.md\`).
   - **GREEN Fix (commits [\`2e59b89\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/2e59b89e0bcc86617baacddc89ccc182a9c2c9ed) & [\`865114a\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/865114a1fc43a8855a001d997f7fb0d2954ec287)):** Removed the app duration heuristic, restored exclusive \`booking_guard_s1()\` post-lock \`clock_timestamp()\` authority, and verified \`BOOK-17\` rejecting cross-cutoff contention at \`422 BOOKING_NOT_ELIGIBLE\`.
3. **Case 3: Error Status Precedence Before Session-Binding Check (Issue #17 / PR #42):**
   - **RED Review Finding (on commit [\`e6d9cac\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/e6d9cac)):** \`apps/web/src/customer-availability.tsx\` inspected \`X-NutTiew-Session-Binding\` before \`!res.ok\`, risking false session-mismatch logouts on injected/transient \`404\` and \`503\` error envelopes that omit binding headers.
   - **GREEN Fix (commit [\`4c60267\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/4c60267200e3fb04edbdb6b7e39ef28fcad8afc6)):** Reordered HTTP status handling before session-binding validation and added deterministic E2E regression tests \`RET-15-ERR-503\` and \`RET-15-ERR-404\` in \`e2e/retrieval.spec.ts\`.
4. **Case 4: Option A Calendar Disclosure Keyboard Focus Continuity (Issue #44 / PR #47):**
   - **RED Review Finding (on PR #47 commit [\`41f9096\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/41f909631770f60d69ad3515e7e282696eb0e6af)):** Activating \`ดูเวลาเพิ่มเติม\` via \`Enter\`/\`Space\` unmounted \`[data-testid="show-more-times-btn"]\` while focused without focus transfer; added RED Playwright assertion in \`e2e/availability.calendar.spec.ts\` failing with \`Received: { tag: 'BODY', testId: null }\`.
   - **GREEN Fix (commit [\`5a32d05\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/5a32d0584dfef1cb84310f6d6cd8b5a2b06828e8), merged [\`9aa37c0\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/9aa37c0f0acbb35b43eb4bd099f8bfac9faa18bc)):** Transferred focus cleanly via \`pendingFocusGroupKeyRef\` + \`timeGroupToggleRefs\` to the first newly revealed time-group toggle, verified at \`1280px\` (\`Enter\`) and \`375px\` (\`Space\`) with \`3px solid #AA4519\` focus outline (\`availability.calendar.spec.ts\` **4/4 PASS**; CI [Run 42821907886](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42821907886) **3/3 PASS**).
5. **Case 5: Login Navy + Orange Token Alignment & Bangkok \`raceSlot\` Day-Key Boundary (Issue #50 / PR #51):**
   - **RED Observations:** (a) Added shared \`--nuttiew-*\` token & alert assertions in \`e2e/auth.a11y.spec.ts\` on \`sprint1@9aa37c0\` — failed on legacy ZenGreen \`rgb(246, 244, 239)\` / \`rgba(0, 0, 0, 0)\`. (b) CI Run [\`42883503150\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42883503150) at \`c8da6c1\` exposed a UTC-vs-Bangkok day rollover defect in \`e2e/sprint1.journey.spec.ts\` between \`00:00–06:59 +07:00\` (\`setUTCHours(6,0,0,0)\` shifted \`raceSlot\` 1 day behind \`bangkokDayKey(21)\`).
   - **GREEN Fixes (commits [\`c8da6c1\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/c8da6c1) & [\`3c0cb1b\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/3c0cb1b771740fe96ec0ccba0cfbaac531692af1), merged [\`c4c599d\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/commit/c4c599d304218f5d9af5a1b527662801cb88e150)):** Created \`apps/web/src/tokens.css\` unifying Login/Tutor/Customer surfaces (\`#202B44\` Navy, \`#F47736\` Orange, \`#F7F8FB\` Canvas, \`#172137\` Ink), updated \`e2e/sprint1.journey.spec.ts\` to \`bangkokInstant(raceDay, '13:00')\`, and passed CI [Run 42888945331](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42888945331) & post-merge CI [Run 42979184176](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42979184176) (**68/68** Edge E2E, **209/209** total automated PASS).

---

## 6. End-to-End Visual Walkthrough, Milestone Traceability & Negative Backend Proofs

Every screenshot embedded below comes directly from the committed Playwright capture suite on \`sprint1@${testedSha}\` (zero fabricated mockups) and includes structured traceability (**Actor / Preconditions → Action → Expected Result → Actual Evidence Observed → Traceability IDs**) plus direct backend/database evidence for HTTP \`409\` / \`404\` security invariants.

### 6.1 Login/Auth UI Theme Alignment (Issue #50 / PR #51 — Before vs After, \`F-S1-01\`)

#### 6.1.1 Login Before Theme Unification (Desktop \`1280×800\` — Legacy ZenGreen Baseline)

![Login Before 1280px (Legacy ZenGreen)](../evidence/login-theme/login-before-1280.png)

- **Artifact:** \`docs/evidence/login-theme/login-before-1280.png\` (\`1280×800 px\`, pre-\`PR #51\` \`sprint1@9aa37c0\`)
- **Actor / Preconditions:** Anonymous visitor opening \`/\` prior to shared token alignment.
- **Action:** Initial render of legacy ZenGreen stylesheet (\`apps/web/src/style.css\`).
- **Expected Result (Baseline Finding):** Surface visual mismatch flagged during PR #49 design review between green/cream login chrome (\`#285C4B\` / \`#F6F4EF\`) and Tutor/Customer Navy + Orange views.
- **Actual Evidence Observed:** Functional authentication card rendered with green accent button/headings on cream canvas, confirming why \`PR #51\` unification was scoped.
- **Traceability:** \`F-S1-01\` · \`AUTH-15\` Baseline · \`Issue #50\`.

#### 6.1.2 Login After Theme Unification (Desktop \`1280×800\` — NutTiew Navy + Orange)

![Login After 1280px (NutTiew Navy + Orange)](../evidence/login-theme/login-after-1280.png)

- **Artifact:** \`docs/evidence/login-theme/login-after-1280.png\` (\`1280×800 px\`, \`sprint1@${testedSha}\`)
- **Actor / Preconditions:** Anonymous visitor opening \`/\` with shared \`apps/web/src/tokens.css\`.
- **Action:** Render unauthenticated login card (\`e2e/auth.a11y.spec.ts:21–77\`, \`e2e/auth.spec.ts:16\`).
- **Expected Result:** Computed surface tokens match Tutor & Customer views (\`#F7F8FB\` canvas, \`#202B44\` navy heading, \`#F47736\` orange CTA with \`#172137\` ink \`>= 4.5:1\` contrast, \`#66778A\` control borders \`>= 3:1\`) and \`0\` horizontal overflow.
- **Actual Evidence Observed:** Unified Navy + Orange login card (\`"ยินดีต้อนรับ"\`, email/password inputs, show/hide button, \`"เข้าสู่ระบบ"\` CTA) centered on \`#F7F8FB\`; automated audit confirmed \`5.76:1\` CTA text contrast and \`0\` overflow.
- **Traceability:** \`F-S1-01\` · \`AC-S1-01..03\` · \`AUTH-15\` (\`e2e/auth.a11y.spec.ts:21–77\`).

#### 6.1.3 Login After Theme Unification (Mobile \`375×800\` — Uncropped Responsive Reflow)

![Login After 375px Mobile (NutTiew Navy + Orange)](../evidence/login-theme/login-after-375.png)

- **Artifact:** \`docs/evidence/login-theme/login-after-375.png\` (\`375×800 px\` full uncropped viewport capture, \`sprint1@${testedSha}\`)
- **Actor / Preconditions:** Anonymous mobile user opening \`/\` at \`375×800\` CSS px.
- **Action:** Render login card under narrow-viewport layout rules (\`e2e/auth.a11y.spec.ts:22–33\`).
- **Expected Result:** Single-column stack displays header, email/password fields, show/hide toggle, and submit CTA inside \`375px\` with \`>= 44×44px\` hit targets and zero horizontal scrolling or bottom cutoff.
- **Actual Evidence Observed:** Complete uncropped mobile frame shows \`"NutTiew | เข้าสู่ระบบ"\`, input controls, secondary password toggle, and primary orange \`"เข้าสู่ระบบ"\` CTA cleanly spaced with \`0\` horizontal overflow.
- **Traceability:** \`F-S1-01\` · \`AUTH-15\` · \`NFR-009\` (\`e2e/auth.a11y.spec.ts:21–33\`, \`e2e/auth.spec.ts:16\`).

#### 6.1.4 Login Validation Error & Accessible Focus Ring (\`1280×800\`)

![Login After Error & Focus Ring State 1280px](../evidence/login-theme/login-after-error-1280.png)

- **Artifact:** \`docs/evidence/login-theme/login-after-error-1280.png\` (\`1280×800 px\`, \`sprint1@${testedSha}\`)
- **Actor / Preconditions:** Anonymous visitor submitting wrong credentials (\`a11y-f7559dda7ae29a@example.test\`).
- **Action:** Click \`เข้าสู่ระบบ\` triggering \`POST /api/v1/auth/login\` → \`HTTP 401 LOGIN_FAILED\` (\`e2e/auth.a11y.spec.ts:79–103\`).
- **Expected Result:** Generic error message announced via \`role="alert"\` (\`#FFF3F3\` / \`#9C2424\`, no account enumeration), \`#email\` bound with \`aria-invalid="true"\` & \`aria-describedby="auth-error"\`, focus returned to \`#email\` with \`3px solid #AA4519\` focus ring.
- **Actual Evidence Observed:** Red alert banner \`"ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบข้อมูล"\` rendered cleanly and \`#email\` displays the crisp \`3px solid rgb(170, 69, 25)\` focus ring without leaking user existence.
- **Traceability:** \`F-S1-01\` · \`AC-S1-03\` · \`VC-S1-02\` · \`AUTH-02\` · \`AUTH-15\` (\`e2e/auth.a11y.spec.ts:79–103\`).

### 6.2 Core Sprint 1 Vertical Journey (\`e2e/sprint1.journey.spec.ts\` refreshed on \`sprint1@${testedSha}\`)

#### Milestone 1: Tutor Logs In & Creates 60-Minute Slot

![01 Tutor Slot Created](../evidence/sprint1/01-tutor-slot-created.png)

- **Artifact:** \`docs/evidence/sprint1/01-tutor-slot-created.png\` (\`1280×1700 px\`)
- **Actor / Preconditions:** Authenticated Tutor (\`Tutor\` role, \`...#39f66140\`) on \`ตารางเวลาติวของฉัน\`.
- **Action:** Enter future date \`1 ธ.ค. 2026\` (\`+20\` days Bangkok) and start \`14:00\` (auto-calculated end \`15:00\`), then submit \`เพิ่มเวลาติว\` (\`POST /api/v1/tutor/slots\`, \`e2e/sprint1.journey.spec.ts:98–125\`).
- **Expected Result:** HTTP \`201 Created\`; persisted 60-minute \`Offered\` Slot appears immediately in Tutor calendar + agenda list with \`เปิดช่วงเวลาแล้ว\` & \`ว่าง (เปิดรับจอง)\` badges and \`0\` bookings.
- **Actual Evidence Observed:** Confirmation message \`"บันทึกเวลาติวสำเร็จ"\`, Slot card \`14:00 – 15:00 น.\` under \`1 ธ.ค. 2026\` with \`"เปิดช่วงเวลาแล้ว"\` + \`"ว่าง (เปิดรับจอง)"\`, and schedule list displaying \`0 รายการ\`.
- **Traceability:** \`F-S1-02\` · \`AC-S1-08\` · \`VC-S1-08/14\` · \`SLOT-01..05\` (\`e2e/sprint1.journey.spec.ts:98–125\`).

#### Milestone 2: Customer Browses Available Tutoring Offers (Option A Monthly Calendar)

![02 Customer Availability Browse](../evidence/sprint1/02-customer-availability-browse.png)

- **Artifact:** \`docs/evidence/sprint1/02-customer-availability-browse.png\` (\`1280×900 px\`)
- **Actor / Preconditions:** Authenticated Customer 1 (\`Customer\` role, \`...#eed2ab80\`) viewing \`เลือกช่วงเวลาติว\` (\`GET /api/v1/customer/availability\`).
- **Action:** Browse \`ธันวาคม 2026\` monthly calendar, select \`1 ธ.ค. 2026\`, and expand exact interval accordion \`14:00–15:00 น.\` (\`e2e/sprint1.journey.spec.ts:133–146\`).
- **Expected Result:** Eligible \`Offered\`, unoccupied, \`>= 60m\`-ahead Slots render in Asia/Bangkok wall-clock time with pseudonymous \`รหัสอ้างอิงติวเตอร์\` (no PII) and zero write \`POST\` calls during navigation.
- **Actual Evidence Observed:** Month header shows \`ธันวาคม 2026\` (\`มี 25 ช่วงเวลา\`), \`1 ธ.ค. 2026\` highlighted, expanded \`14:00–15:00 น.\` card reveals \`รหัสอ้างอิงติวเตอร์: cdf91332-9d8e-486a-b2e2-661b39f61440\` and active \`เลือกช่วงเวลานี้\` CTA.
- **Traceability:** \`F-S1-03\` · \`AC-S1-14/15/16\` · \`VC-S1-13/15\` · \`AVA-01..10\`, \`UX-CAL-01..03\` (\`e2e/sprint1.journey.spec.ts:133–146\`).

#### Milestone 3: Customer Confirms Booking

![03 Customer Booking Confirmed](../evidence/sprint1/03-customer-booking-confirmed.png)

- **Artifact:** \`docs/evidence/sprint1/03-customer-booking-confirmed.png\` (\`1280×1008 px\`)
- **Actor / Preconditions:** Authenticated Customer 1 (\`...#eed2ab80\`) with \`14:00–15:00\` offer staged in Step 3 confirmation summary (\`#selected-offer-summary\`).
- **Action:** Click \`ยืนยันการจอง\` dispatching \`POST /api/v1/customer/bookings\` with CSRF & \`X-NutTiew-Session-Binding\` (\`e2e/sprint1.journey.spec.ts:151–175\`).
- **Expected Result:** HTTP \`201 Created\` backed by SERIALIZABLE transaction & \`booking_guard_s1()\`; UI displays confirmed Booking UUID, \`Booked\` status, and live refreshed \`1 ธ.ค. 2026\` showing \`0\` remaining offers.
- **Actual Evidence Observed:** Green confirmation card shows \`"จองสำเร็จ"\`, Booking UUID \`dd098824-62f0-4db0-9769-bf3e57b40a1a\`, \`"สถานะ: Booked"\`, and refreshed \`1 ธ.ค. 2026\` tile dropped to \`0 ช่วงเวลา\`.
- **Traceability:** \`F-S1-04\` · \`AC-S1-19/20/28\` · \`VC-S1-16/17/24\` · \`BOOK-01/02/21\` (\`e2e/sprint1.journey.spec.ts:151–175\`).

#### Milestone 4: Customer Private Booking List

![04 Customer Private Bookings](../evidence/sprint1/04-customer-private-bookings.png)

- **Artifact:** \`docs/evidence/sprint1/04-customer-private-bookings.png\` (\`1280×900 px\`)
- **Actor / Preconditions:** Authenticated Customer 1 (\`...#eed2ab80\`) owning persisted Booking \`dd098824-...\`.
- **Action:** Open \`การจองของฉัน\` triggering \`GET /api/v1/customer/bookings\` (\`e2e/sprint1.journey.spec.ts:180–195\`).
- **Expected Result:** Server queries \`WHERE b."customerId" = $1\` from Session identity and returns only Customer 1's bookings with \`TUTOR-<8-hex>\` pseudonymous ref, Bangkok interval, and \`ยืนยันแล้ว\` status.
- **Actual Evidence Observed:** View renders \`การจองของฉัน (1 รายการ)\`, \`1 ธ.ค. 2026 14:00 – 15:00 น.\`, \`TUTOR-cdf91332\`, \`dd098824-62f0-4db0-9769-bf3e57b40a1a\`, \`"ยืนยันแล้ว"\` badge, and \`"ดูรายละเอียด"\` button.
- **Traceability:** \`F-S1-05\` · \`AC-S1-30\` · \`VC-S1-28/34\` · \`RET-01/14\` (\`e2e/sprint1.journey.spec.ts:180–195\`).

#### Milestone 5: Customer Booking Detail Modal

![05 Customer Detail Modal](../evidence/sprint1/05-customer-detail-modal.png)

- **Artifact:** \`docs/evidence/sprint1/05-customer-detail-modal.png\` (\`1280×900 px\`)
- **Actor / Preconditions:** Authenticated Customer 1 (\`...#eed2ab80\`) on \`การจองของฉัน\`.
- **Action:** Click \`ดูรายละเอียด\` invoking \`GET /api/v1/customer/bookings/dd098824-62f0-4db0-9769-bf3e57b40a1a\` (\`e2e/sprint1.journey.spec.ts:200–213\`).
- **Expected Result:** Accessible \`[role="dialog"]\` modal displays verified Booking detail (UUID, \`TUTOR-cdf91332\`, Asia/Bangkok window, \`ยืนยันแล้ว\`, creation timestamp) with \`ปิด / กลับสู่รายการ\`.
- **Actual Evidence Observed:** Detail modal renders heading \`"รายละเอียดการจอง"\`, Booking ID \`dd098824-62f0-4db0-9769-bf3e57b40a1a\`, \`TUTOR-cdf91332\`, \`1 ธ.ค. 2026, 14:00 – 15:00 น.\`, \`11 พ.ย. 2026 15:04 น.\`, badge \`"ยืนยันแล้ว"\`, and dismiss CTA.
- **Traceability:** \`F-S1-05\` · \`AC-S1-30\` · \`VC-S1-28/34\` · \`RET-02\` (\`e2e/sprint1.journey.spec.ts:200–213\`).

#### Milestone 6: Tutor Schedule View (Occupied & Pseudonymous \`CUST-...\`)

![06 Tutor Schedule Occupied](../evidence/sprint1/06-tutor-schedule-occupied.png)

- **Artifact:** \`docs/evidence/sprint1/06-tutor-schedule-occupied.png\` (\`1280×1722 px\`)
- **Actor / Preconditions:** Authenticated Tutor (\`...#39f66140\`) re-signing in after Customer 1's committed booking.
- **Action:** Load Tutor Dashboard (\`GET /api/v1/tutor/slots\` + \`GET /api/v1/tutor/bookings\`, \`e2e/sprint1.journey.spec.ts:226–248\`).
- **Expected Result:** Slot card switches dynamically to \`มีผู้จองแล้ว (Occupied)\`, Tutor Schedule renders \`มีนัดหมาย (Booked)\` with pseudonymous \`CUST-<8-hex>\` (\`apps/api/src/retrieval.ts:219\`), and raw Customer email/full UUID are completely withheld.
- **Actual Evidence Observed:** Slot card displays \`"มีผู้จองแล้ว (Occupied)"\`; Schedule list shows \`1 รายการ\` for \`dd098824-62f0-4db0-9769-bf3e57b40a1a\` with \`"มีนัดหมาย (Booked)"\` and \`รหัสผู้เรียน: CUST-3d599805\` (zero PII asserted in test).
- **Traceability:** \`F-S1-05\` · \`AC-S1-07/32/33\` · \`VC-S1-30/31\` · \`RET-04/05/06/16\` (\`e2e/sprint1.journey.spec.ts:226–248\`).

#### Milestone 7: Negative Business Rule Rejection (HTTP 409 Conflict — UI + Backend Proof)

![07 Negative Conflict 409](../evidence/sprint1/07-negative-conflict-409.png)

- **Artifact:** \`docs/evidence/sprint1/07-negative-conflict-409.png\` (\`1280×932 px\`)
- **Actor / Preconditions:** Authenticated Customer 2 (\`...#6691cbdd\`) selects an initially offered \`2 ธ.ค. 2026 13:00–14:00\` Slot (\`raceSlotId\`), while Customer 1 commits \`raceSlotId\` in PostgreSQL beforehand (\`e2e/sprint1.journey.spec.ts:259–295\`).
- **Action:** Customer 2 clicks \`ยืนยันการจอง\` submitting \`POST /api/v1/customer/bookings\` for \`raceSlotId\`.
- **Expected Result (Backend + UI):** PostgreSQL \`booking_guard_s1()\` / \`booking_one_active_per_slot\` rejects the duplicate claim (\`0\` Customer 2 rows written), \`createCustomerBooking()\` throws \`BookingError(409, 'SLOT_UNAVAILABLE')\`, API responds **\`HTTP 409 Conflict\`** with \`SLOT_UNAVAILABLE\` and **zero disclosure** of Customer 1 or existing Booking ID (\`BOOK-04\` in \`apps/api/test/bookings.db.test.ts:368–374\`), and UI renders \`#booking-error-banner\` + refreshes offers.
- **Actual Evidence Observed (Correlated Proof):**
  - **UI Visual Evidence:** Red alert banner \`"ช่วงเวลาที่เลือกไม่ว่างแล้ว กรุณาเลือกช่วงเวลาอื่นจากรายการล่าสุด"\` rendered cleanly; \`2 ธ.ค. 2026\` updates to \`0 ช่วงเวลา\`.
  - **Backend DB Integration Correlation (\`BOOK-04\`):** Verified **PASS** in real PostgreSQL integration (\`apps/api/test/bookings.db.test.ts:368–374\`, CI PG 18 & local Win11 PG 17.2): \`POST /api/v1/customer/bookings\` returns \`status: 409\`, \`error.code: 'SLOT_UNAVAILABLE'\`, zero \`customerLowId\` / \`bookingId\` leakage.
- **Sanitized Server Response Contract (\`apps/api/src/app.ts:16–17\`, \`bookings.ts\`, \`customer-availability.tsx:907–917\`):**
  \`\`\`http
  HTTP/1.1 409 Conflict
  Cache-Control: no-store
  Content-Type: application/json

  {
    "error": {
      "code": "SLOT_UNAVAILABLE",
      "message": "Selected slot is unavailable"
    },
    "requestId": "<uuid>"
  }
  \`\`\`
- **Traceability:** \`F-S1-04\` · \`AC-S1-17/22\` · \`VC-S1-19/22\` · \`BOOK-04\` (\`bookings.db.test.ts:368–374\`) · \`e2e/sprint1.journey.spec.ts:259–295\`.

#### Milestone 8: Negative Cross-Customer Access Refusal (Safe HTTP 404 — UI Isolation + Backend HTTP 404 Proof)

![08 Negative Cross Customer 404](../evidence/sprint1/08-negative-cross-customer-404.png)

- **Artifact:** \`docs/evidence/sprint1/08-negative-cross-customer-404.png\` (\`1280×900 px\`)
- **Actor / Preconditions:** Authenticated Customer 2 (\`...#6691cbdd\`) while Customer 1 owns committed Booking \`dd098824-62f0-4db0-9769-bf3e57b40a1a\`.
- **Action (Two-Step Check Before Screenshot):** Immediately prior to capturing Screenshot \`08\`, the same Customer 2 browser context probes \`GET /api/v1/customer/bookings/${'${createdBookingId}'}\` (\`e2e/sprint1.journey.spec.ts:302–305\`), then opens \`การจองของฉัน\` (\`GET /api/v1/customer/bookings\`, \`lines 308–315\`).
- **Expected Result & Scope Honesty:**
  - **What Screenshot \`08\` Alone Proves vs Does Not Prove:** Screenshot \`08\` visually confirms **UI private list isolation** (\`GET /api/v1/customer/bookings\` returns \`200 OK { data: [] }\` → \`"คุณยังไม่มีประวัติการจองติว"\`, \`[data-booking-id="dd098824-..."]\` count \`0\`); the screenshot *by itself* does not display the \`404\` status code of the direct-ID endpoint.
  - **Authoritative Backend \`HTTP 404\` Proof:** Direct HTTP \`404\` enforcement is proved by [\`apps/api/src/retrieval.ts:157–163\`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/blob/${testedSha}/apps/api/src/retrieval.ts#L157-L163) (\`WHERE b."id" = $1 AND b."customerId" = $2\` → \`BookingError(404, 'BOOKING_NOT_FOUND')\`, never \`403\`), executed directly by **\`e2e/sprint1.journey.spec.ts:302–305\`** right before Screenshot \`08\`, PostgreSQL DB test **\`RET-03\`** (\`apps/api/test/retrieval.db.test.ts:215–224\`), and Edge E2E test **\`RET-16\`** (\`e2e/retrieval.spec.ts:398–413\`). In addition, **\`RET-15-ERR-404\`** (\`e2e/retrieval.spec.ts:318–353\`) verifies the detail modal displays \`"ไม่พบข้อมูลการจองนี้"\` on \`404\`.
- **Actual Evidence Observed:** Screenshot \`08\` displays \`0 รายการ\` / \`"คุณยังไม่มีประวัติการจองติว"\` for Customer 2 (zero Customer 1 bookings leaked). Simultaneously, \`e2e/sprint1.journey.spec.ts:302–305\`, \`RET-03\` (**PASS**), and \`RET-16\` (**PASS**) all verified HTTP \`404 BOOKING_NOT_FOUND\`:
- **Sanitized Server Response Contract (\`apps/api/src/app.ts:16–17, 109–123\`; asserted in \`sprint1.journey.spec.ts:302–305\`, \`RET-03\`, \`RET-16\`):**
  \`\`\`http
  HTTP/1.1 404 Not Found
  Cache-Control: no-store
  Content-Type: application/json

  {
    "error": {
      "code": "BOOKING_NOT_FOUND",
      "message": "Booking not found"
    },
    "requestId": "<uuid>"
  }
  \`\`\`
- **Traceability:** \`F-S1-05\` · \`AC-S1-31\` · \`VC-S1-29\` · \`NFR-S1-01\` · \`RET-03\` (\`retrieval.db.test.ts:215–224\`) · \`RET-16\` (\`e2e/retrieval.spec.ts:398–413\`) · \`RET-15-ERR-404\` · \`e2e/sprint1.journey.spec.ts:302–316\`.

### 6.3 Customer Monthly Calendar Option A (\`UX-CAL-01..10\` refreshed on \`sprint1@${testedSha}\`)

#### Desktop Monthly Calendar (1280px)

![10 Option A Desktop Calendar 1280px](../evidence/sprint1/10-after-calendar-1280.png)

- **Artifact:** \`docs/evidence/sprint1/10-after-calendar-1280.png\` (\`1280×933 px\`)
- **Actor / Preconditions:** Authenticated Customer (\`...#4d63472d\`) at \`1280×900\` on a multi-day schedule with \`9\` interval groups on \`29 พ.ย. 2026\` (\`11\` offers across \`2\` Tutors).
- **Action:** Load Customer availability view (\`e2e/availability.calendar.spec.ts:504–508\`).
- **Expected Result:** Two-column responsive layout renders Mon–Sun calendar on left, no period filter chips, earliest day preselected, Step 2 capped at \`6\` initial accordions with \`ดูเวลาเพิ่มเติม\` disclosure and \`0\` mounted offer rows.
- **Actual Evidence Observed:** \`พฤศจิกายน 2026\` (\`มี 12 ช่วงเวลา\`), \`29 พ.ย. 2026\` highlighted (\`11 ช่วงเวลา\`), \`6\` collapsed groups visible + \`"ดูเวลาเพิ่มเติม (อีก 3 ช่วงเวลา)"\`.
- **Traceability:** \`F-S1-03\` · \`UX-CAL-01/02/03/08\` (\`e2e/availability.calendar.spec.ts:504–508\`).

#### Dense 520+ Seeded Offer Calendar & Progressive 6-Group Disclosure (1280px)

![11 Option A Dense 520+ Offer Disclosure 1280px](../evidence/sprint1/11-after-calendar-dense-500plus-1280.png)

- **Artifact:** \`docs/evidence/sprint1/11-after-calendar-dense-500plus-1280.png\` (\`1280×933 px\`)
- **Actor / Preconditions:** Authenticated Customer (\`...#4d63472d\`) at \`1280×900\` against \`522\` real PostgreSQL offers (\`generate_series(0,519)\` across \`26\` days + \`2\` non-hourly slots, \`e2e/availability.calendar.spec.ts:109–177\`).
- **Action:** Mount dense calendar grid with \`21 พ.ย. 2026\` auto-selected (\`22\` offers across \`12\` exact interval groups).
- **Expected Result:** Day tiles show total offers (\`22\`, not Tutor count \`2\`), initial accordion disclosure stays capped at \`6\` groups + \`ดูเวลาเพิ่มเติม (อีก 6 ช่วงเวลา)\`, zero unrequested \`GET\`/\`POST\` traffic, SQL \`p95 <= 100 ms\`.
- **Actual Evidence Observed:** \`พฤศจิกายน 2026\` (\`มี 214 ช่วงเวลา\`), \`21 พ.ย. 2026\` (\`22 ช่วงเวลา\`) renders cleanly with \`6\` collapsed groups and \`"ดูเวลาเพิ่มเติม (อีก 6 ช่วงเวลา)"\` (measured \`AVA14_BENCHMARK_500 p95 = 68.21 ms\` local / \`9.66 ms\` CI).
- **Traceability:** \`F-S1-03\` · \`NFR-010\` · \`AVA14_BENCHMARK_500\` · \`UX-CAL-01/03\` (\`e2e/availability.calendar.spec.ts:109–177\`).

#### Expanded Exact-Time Group & Non-Sticky Inline Selection Summary (1280px)

![12 Option A Selected Offer & Non-Sticky Summary 1280px](../evidence/sprint1/12-after-calendar-selected-1280.png)

- **Artifact:** \`docs/evidence/sprint1/12-after-calendar-selected-1280.png\` (\`1280×1434 px\`)
- **Actor / Preconditions:** Authenticated Customer (\`...#4d63472d\`) at \`1280×900\` on \`29 พ.ย. 2026\`.
- **Action:** Expand \`08:00–09:00 น.\` (\`2 ตัวเลือก\`) and click \`เลือกช่วงเวลานี้\` for \`214a47a2-0cb9-4ea0-a1c7-4d240f1419cb\` (\`e2e/availability.calendar.spec.ts:510–513, 545–548\`).
- **Expected Result:** Selected Tutor card switches to \`เลือกอยู่\`, and Step 3 confirmation box (\`#selected-offer-summary\`) renders with \`position: static\` strictly *below* Step 2 rather than overlaying the viewport.
- **Actual Evidence Observed:** Expanded group lists \`214a47a2-...\` as \`"เลือกอยู่"\` and \`e55fffe4-...\` as \`"เลือกช่วงเวลานี้"\`; Step 3 \`เลือกช่วงเวลาที่ต้องการจอง (ขั้นที่ 3 — ยังไม่ใช่การจอง)\` sits inline below Step 2 with confirm & cancel buttons.
- **Traceability:** \`F-S1-03\` · \`F-S1-04\` · \`UX-CAL-04/08\` (\`e2e/availability.calendar.spec.ts:510–549\`).

#### Mobile Responsive Reflow (375px — Top-Viewport Excerpt Cropped for PDF Readability)

![09 Option A Responsive Mobile 375px](../evidence/sprint1/09-after-calendar-375.png)

- **Artifact & Excerpt Note:** **PDF Top-Viewport Excerpt (\`375×956 px\`)** cropped at \`2.55 × width\` by \`scripts/generate-pdf.mjs\` from full-page capture \`docs/evidence/sprint1/09-after-calendar-375.png\` (\`375×2449 px\`). The full-height capture extends vertically into Step 2 time groups and Step 3 inline summary; the excerpt frames the complete top header bar and entire Step 1 Monthly Calendar Card without mid-row clipping.
- **Actor / Preconditions:** Authenticated Customer (\`...#4d63472d\`) at \`375×900\` CSS px (\`e2e/availability.calendar.spec.ts:515–574\`).
- **Action:** Collapse 2-column layout to 1-column mobile stack with \`29 พ.ย. 2026\` (\`11 ช่วงเวลา\`) selected.
- **Expected Result:** Zero horizontal overflow (\`scrollWidth <= innerWidth\`), all interactive buttons \`>= 44×44px\`, 7-column Mon–Sun calendar readable at \`>= 44×44px\` per day tile, and full Step 1 card cleanly visible in the excerpt.
- **Actual Evidence Observed:** Top-viewport excerpt shows mobile nav bar, \`"เลือกช่วงเวลาติว"\`, \`"โหลดข้อมูลล่าสุด"\`, complete \`พฤศจิกายน 2026\` grid (\`1–30 พ.ย.\`), selected \`29\` tile (\`11\`), and live readout \`"เลือกวันที่ 29 พ.ย. 2026 พบ 11 ช่วงเวลา"\` cleanly unclipped.
- **Traceability:** \`F-S1-03\` · \`UX-CAL-08/09\` · \`NFR-009\` (\`e2e/availability.calendar.spec.ts:515–574\`).

### 6.4 Accessibility Verification Layers (Automated vs Informal Author Walkthrough vs Independent Release Gate)

To eliminate ambiguity between automated assertions, author manual inspection, and formal release sign-off, NutTiew tracks accessibility verification across **three distinct layers**:

| Verification Layer | Executor & Date / Environment | Scope Covered & Concrete Observations | Gate Classification |
| :--- | :--- | :--- | :---: |
| **1. Automated Playwright & Computed WCAG 2.2 AA Suite** | GitHub Actions Edge CI ([Run ${ciRunId}](${ciRunUrl})) + Local Win11 Edge on \`sprint1@${testedSha}\` | \`e2e/auth.a11y.spec.ts\` (**2/2**) + \`e2e/availability.calendar.spec.ts\` (\`UX-CAL-08..09\`): computed \`--nuttiew-*\` contrast (\`>= 4.5:1\` text / \`>= 3:1\` borders & \`#AA4519\` focus ring), \`320/375/640(200%)/768/800/801/1280px\` zero overflow, \`>= 44×44px\` targets (\`>= 36×44px\` at \`320px\`), \`Enter\`/\`Space\` disclosure focus transfer (\`pendingFocusGroupKeyRef\`), \`aria-live\` & \`prefers-reduced-motion\` | **PASS (Automated Gate)** |
| **2. Informal Author Manual Walkthrough** | **@Chxtamos** on \`2026-11-11\` (Asia/Bangkok), local Win11 dev servers (\`docs/48...\` @ \`6abfcb7\`, identical \`apps/\`/\`e2e/\` to \`sprint1@${testedSha}\`, Express API \`127.0.0.1:3001\`, Vite \`5173\`, PG \`17.2\`; servers closed after check; [PR #49 comment](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/49#issuecomment-6793913908)) | Full End-to-End Flow + Manual **Keyboard navigation**, **\`375px\` Mobile**, **\`200%\` Browser Zoom**, and **Screen Reader** walkthrough. **3 minor non-blocking DOM/ARIA notes recorded (out of scope for PR #49 — zero \`apps/\` edits):** *(i)* post-login \`document.title\` stays \`"NutTiew — เข้าสู่ระบบ"\`; *(ii)* Customer view renders \`<h2 className="dashboard-kicker">\` above \`<h1>\`; *(iii)* native \`<input type="date/time">\` controls in Tutor form could add explicit \`:focus-within\` styling in a later polish pass | **PASS (Author Check Only — NOT Independent Sign-off)** |
| **3. Independent Formal Manual WCAG 2.2 AA & Assistive-Tech Release Audit** | Separate independent human reviewer / release checklist before \`sprint1 -> main\` | Independent screen-reader / keyboard / ARIA heading & focus sign-off + release-gate checklist confirmation | **Pending Independent Sign-off** |

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
   - Multiple rigorous review rounds resolving README least-privilege bootstrap order & seed envs, Express 5 / React 19 fidelity, canonical AC/VC mapping, complete embedded Parts A–E contracts, verbatim test excerpts, Mermaid vector verification, and computed PDF page ranges; merged into \`sprint1\` at \`7449581\`.
4. **Pull Request #45 — F-S1-03 Monthly Calendar Part E UX Amendment (\`docs/44-customer-calendar-ux-amendment\` → \`sprint1\`):**
   - Author: @Chxtamos | Reviewer: @Tanaboonnnnn (\`APPROVED\` on \`f74e1c3\`) | Issue: [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44)
   - Preserved canonical Part E baseline IDs while specifying Option A monthly Mon–Sun calendar, Asia/Bangkok projection, 6-group \`ดูเวลาเพิ่มเติม\` disclosure, inline non-sticky summary, and \`UX-CAL-01..10\`; merged into \`sprint1\` at \`567ec1c\`.
5. **Pull Request #47 — F-S1-03 Option A Calendar Part F (\`feature/44-customer-calendar-ux\` → \`sprint1\`):**
   - Author: @Chxtamos | Reviewer: @Tanaboonnnnn (\`Changes Requested\` on \`41f9096\` → \`APPROVED\` on \`5a32d05\`) | Issue: [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44)
   - Substantive review flagged focus loss to \`BODY\` when activating \`ดูเวลาเพิ่มเติม\`; resolved via RED assertion → \`pendingFocusGroupKeyRef\` keyboard focus transfer (\`5a32d05\`), verified with \`520\`-row PG benchmark and CI Run \`42821907886\` (**209/209** PASS); merged into \`sprint1\` at \`9aa37c0\`.
6. **Pull Request #51 — F-S1-01 Login/Auth Navy + Orange Theme (\`feature/50-login-ui-theme\` → \`sprint1\`):**
   - Author: @Chxtamos | Reviewer: @Tanaboonnnnn (\`APPROVED\` on \`3c0cb1b\`) | Issue: [#50](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/50)
   - Acted on @Tanaboonnnnn's UI consistency feedback from PR #49: introduced \`apps/web/src/tokens.css\` unifying Login/Tutor/Customer Navy (\`#202B44\`) + Orange (\`#F47736\`) + Light Canvas (\`#F7F8FB\`) without changing auth/session/CSRF semantics, and fixed UTC-vs-Bangkok \`raceSlot\` day boundary (\`3c0cb1b\`); merged into \`sprint1\` at \`c4c599d\` ([CI Run 42979184176](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42979184176) **3/3** PASS).
7. **Pull Request #49 — Deliverable 1 Source, Evidence & PDF Sync (\`docs/48-deliverable-1-pdf-9aa37c0\` → \`sprint1\`):**
   - Author: @Chxtamos | Reviewer: @Tanaboonnnnn (\`CHANGES_REQUESTED\` reviewed at \`6abfcb7\`) | Issue: [#48](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/48)
   - Aligns \`scripts/compile-deliverable.mjs\`, \`scripts/generate-pdf.mjs\`, \`README.md\`, \`deliverable-1.md\`, \`CPE334_Deliverable1_NutTiew.pdf\`, and \`docs/evidence/sprint1/*.png\` with \`sprint1@${testedSha}\`, and resolves all 5 items in @Tanaboonnnnn's review (synced PR/Issue #48 scope, structured \`Actor/Preconditions → Action → Expected → Actual → Traceability\` annotations across all 16 screenshots, explicit \`HTTP 409/404\` backend proof correlation alongside \`07\`/\`08\`, separated 3-layer Accessibility status in §6.4/§10/README, \`375×956\` Calendar mobile crop & heading-figure pairing fix, plus PyMuPDF QA contact sheet verification).

---

## 8. Team Contribution Matrix

| Contributor | Contribution | Primary Responsibilities & Deliverables |
| :--- | :---: | :--- |
| **Tanboon Teawsawat** (@Tanaboonnnnn) | **50%** | Requirements discovery (Q01–Q32), Whole-product SRS & Traceability Matrix, System SDS, Three-Sprint Delivery Plan, Project #6 Kanban & UI UX governance, and substantive peer reviews across PRs #25–#51 |
| **Chxtamos** (@Chxtamos) | **50%** | Express 5 REST API, PostgreSQL schema/GiST constraints/triggers, Option 1 concurrency lock ordering, React 19 UI (Option A calendar & shared \`tokens.css\`), automated Unit/DB/Playwright tests, and Deliverable 1 source/PDF packaging |

---

## 9. Academic Integrity & AI Usage Declaration

- **AI Assistant Declared:** Google Antigravity / Gemini agentic coding assistant.
- **Usage Scope:** Drafting boilerplate TypeScript interfaces, structuring \`pg_blocking_pids()\` concurrency test harnesses, automating Markdown/PDF compilation, and verifying cross-references.
- **Human Accountability:** All product business rules (Q01–Q32), lock-ordering architecture decisions, security trust boundaries, and peer reviews were evaluated and accepted by human team members. Zero test results or deliverables were fabricated or accepted without real execution against PostgreSQL and browser suites; informal author walkthroughs, independent formal accessibility sign-off, and final release gates remain transparently separated without claiming premature completion.

---

## 10. Definition of Done (DoD) Checklist (Truthful Status)

| Quality Gate / Requirement | Verification Evidence | DoD Status |
| :--- | :--- | :---: |
| **Whole-product Parts A–D embedded verbatim** | Complete SRS, Inventory, Traceability, System SDS & 3-Sprint Plan inside PDF | **Complete** |
| **All Sprint 1 Part E contracts embedded verbatim** | All 31 Part E docs (F-S1-01..05, Tutor Calendar & Option A UX Decisions, Shared Booking Data) inside PDF | **Complete** |
| **Real working UI → API → PostgreSQL vertical slice** | Verified on React 19, Express 5, PostgreSQL 17.2 (local) & 18 (CI) at \`sprint1@${testedSha}\` | **Complete** |
| **Automated verification & a11y/contrast suite** | 209 distinct tests (34 Unit + 107 DB + 68 E2E incl. \`auth.a11y.spec.ts\` & \`UX-CAL-08..09\`) PASS on [CI Run ${ciRunId}](${ciRunUrl}) & local checks; typecheck & build clean | **Complete** |
| **Informal author manual accessibility walkthrough** | @Chxtamos (\`2026-11-11\` ICT on local Win11 \`sprint1@${testedSha}\`): Keyboard, \`375px\` Mobile, \`200%\` Zoom, Screen Reader + E2E flow; 3 minor DOM/ARIA notes recorded (see §6.4; not independent sign-off) | **Complete (Author Check Only)** |
| **Independent formal manual WCAG 2.2 AA & release sign-off** | Separate independent teammate/reviewer manual WCAG 2.2 AA & screen-reader release audit required before \`sprint1 -> main\` | **Pending Independent Sign-off** |
| **Instructor Master Spec & Theme 1 formal sign-off** | Group Work Spec v1 Draft used as baseline; final Master Spec / Theme 1 confirmation not yet supplied | **Pending External Confirmation** |
| **Reproducible README setup** | Owner DB + post-migration grants + seed env vars smoke-tested on PG 17.2 & aligned to PR #49 | **Complete** |
| **Staging PR #49 re-review & \`sprint1 -> main\` release PR** | PR #49 remediation awaiting @Tanaboonnnnn re-review before separate reviewed \`sprint1 -> main\` release PR (\`main\` at \`b501c18\`) & tag | **Pending Peer Approval** |
| **Private Student IDs & LEB2 External Submission** | Student IDs withheld from public repo; team supplies IDs & release PDF to LEB2 | **Pending Release & LEB2 Handoff** |

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
