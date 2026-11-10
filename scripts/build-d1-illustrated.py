#!/usr/bin/env python3
"""Build an inspectable D1 cover/visual audit and append the complete approved
engineering-contract PDF. This intentionally preserves the full A-E baseline.
No fabricated evidence, and unmerged PR51 screenshots are marked as such.
"""
from __future__ import annotations

from html import escape
from pathlib import Path
import datetime
import hashlib
import re
import sys

import fitz
from markdown_it import MarkdownIt
from PIL import Image
from weasyprint import HTML

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/deliverables/CPE334_Deliverable1_NutTiew.pdf"
TEMP = ROOT / "build/d1"
BASELINE = TEMP / "baseline_pr49.pdf"
IMAGE_DIR = TEMP / "images"
SUMMARY = TEMP / "summary.pdf"
MD = MarkdownIt("default").enable("table")

INK = "#172137"
NAVY = "#202b44"
ORANGE = "#f47736"
SHA_APP = "9aa37c0f0acbb35b43eb4bd099f8bfac9faa18bc"
SHA_LOGIN = "3c0cb1b771740fe96ec0ccba0cfbaac531692af1"
CI_LOGIN = "https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42888945331"
REPO = "https://github.com/Tanaboonnnnn/CPE334-NutTiew"
BASE_URL = REPO + "/blob/" + SHA_APP + "/"
PR49 = REPO + "/pull/49"
PR51 = REPO + "/pull/51"

def p(text):
    return "<p>" + text + "</p>"

def h(text):
    return escape(str(text))

def item(text):
    return "<li>" + text + "</li>"

def link(url, label):
    return "<a href='" + escape(url, quote=True) + "'>" + h(label) + "</a>"

def source(path, label=None):
    return link(BASE_URL + path, label or path)

def html_table(headings, rows, cls=""):
    out = ["<table class='" + cls + "'><thead><tr>"]
    out.extend("<th>" + h(t) + "</th>" for t in headings)
    out.append("</tr></thead><tbody>")
    for row in rows:
        out.append("<tr>")
        out.extend("<td>" + str(t) + "</td>" for t in row)
        out.append("</tr>")
    out.append("</tbody></table>")
    return "".join(out)

def card(label, value, note=""):
    return "<div class='metric'><span>" + h(label) + "</span><strong>" + h(value) + "</strong><small>" + h(note) + "</small></div>"

def part(letter, title, desc):
    return "<div class='part-title' id='part-" + letter.lower() + "'><div class='part-key'>PART " + letter + "</div><h1>" + h(title) + "</h1><p>" + h(desc) + "</p></div>"

def safe_image(path):
    src = ROOT / path
    if not src.is_file():
        raise FileNotFoundError("Missing source screenshot: " + str(src))
    image = Image.open(src).convert("RGB")
    image.thumbnail((1900, 1400), Image.Resampling.LANCZOS)
    dest = IMAGE_DIR / (src.stem + "-" + hashlib.sha1(str(src).encode()).hexdigest()[:8] + ".jpg")
    image.save(dest, "JPEG", quality=85, optimize=True)
    return dest.as_uri()

def figure(path, name, caption, provenance, ref=None):
    src = safe_image(path)
    extra = ("<div class='fig-ref'>" + ref + "</div>") if ref else ""
    return ("<figure class='evidence'><div class='figure-heading'>" + h(name)
            + "</div><img src='" + src + "' alt='" + h(name) + "'/>"
            + "<figcaption>" + h(caption) + "</figcaption>"
            + "<div class='fig-source'>" + h(provenance) + "</div>" + extra
            + "</figure>")

def extract_section(path, start, end):
    text = (ROOT / path).read_text(encoding="utf-8")
    a = text.find(start)
    if a == -1:
        raise ValueError("Missing canonical heading " + start)
    b = text.find(end, a + len(start))
    if b == -1:
        raise ValueError("Missing canonical end heading " + end)
    return text[a:b]

def markdown_table(path, start, end):
    raw = extract_section(path, start, end)
    lines = raw.splitlines()
    table = []
    started = False
    for line in lines:
        if line.lstrip().startswith("|"):
            table.append(line)
            started = True
        elif started:
            break
    if len(table) < 3:
        raise ValueError("Missing canonical table " + path + " / " + start)
    return MD.render("\n".join(table))

def screenshot_figure_series():
    steps = [
        ("01 · Tutor creates a slot",
         "docs/evidence/sprint1/01-tutor-slot-created.png",
         "Tutor สร้างช่วงเวลาติวในอนาคต ระบบตรวจความถูกต้องของช่วงเวลา 60 นาทีและบันทึกข้อมูลจริง",
         "F-S1-02 · AC-S1-08/09 · Tutor · Precondition: authenticated Tutor with no overlapping offered slot"),
        ("02 · Customer browses availability",
         "docs/evidence/sprint1/02-customer-availability-browse.png",
         "Customer อ่านช่วงเวลาที่เปิดให้จองตามสิทธิ์ของตน แสดงเวลาในเขต Asia/Bangkok",
         "F-S1-03 · AC-S1-15/18 · Customer · Precondition: eligible offered slots exist"),
        ("03 · Booking is committed",
         "docs/evidence/sprint1/03-customer-booking-confirmed.png",
         "ระบบแสดงผลยืนยันการจองหลัง Backend Commit ข้อมูล Booking แล้ว ไม่ใช่เพียงเปลี่ยนสถานะใน Browser",
         "F-S1-04 · AC-S1-19/25 · Customer · Expect one active exclusive Booking"),
        ("04 · Customer retrieves saved bookings",
         "docs/evidence/sprint1/04-customer-private-bookings.png",
         "Customer เปิดรายการจองของตนอีกครั้งเพื่อยืนยันว่าข้อมูลถูกบันทึกจริงและไม่แสดงของผู้ใช้อื่น",
         "F-S1-05 · AC-S1-30/31 · Customer · Persisted list retrieval"),
        ("05 · Customer opens booking detail",
         "docs/evidence/sprint1/05-customer-detail-modal.png",
         "เปิดรายละเอียดการจองเดิมพร้อม Tutor, เวลา Bangkok และสถานะ Booked",
         "F-S1-05 · Customer · Read-only owner-filtered booking detail"),
        ("06 · Tutor sees occupied schedule",
         "docs/evidence/sprint1/06-tutor-schedule-occupied.png",
         "Tutor อ่านตารางของตนและเห็น Slot ที่ถูกจองแล้วผ่านระบบจริง ไม่เห็นข้อมูลส่วนตัวของ Customer คนอื่น",
         "F-S1-05 · AC-S1-32/33 · Tutor · Owner-filtered schedule"),
        ("07 · Business rule rejects conflict",
         "docs/evidence/sprint1/07-negative-conflict-409.png",
         "Customer คนที่สองจอง Slot ที่มีผู้จองแล้ว: API ปฏิเสธ 409 และไม่บันทึก Booking ซ้ำ",
         "F-S1-04 · AC-S1-22/25 · Negative path · Backend 409"),
        ("08 · Ownership blocks foreign read",
         "docs/evidence/sprint1/08-negative-cross-customer-404.png",
         "Customer คนอื่นพยายามอ่าน Booking ของผู้อื่น: Backend ตอบแบบปลอดภัย 404 โดยไม่เปิดเผยข้อมูล",
         "F-S1-05 · AC-S1-31 · Negative access · Backend 404")
    ]
    out = []
    for title, filename, caption, evidence in steps:
        out.append(figure(filename, title, caption, "Original Sprint 1 screenshots from docs/evidence/sprint1/ on source baseline 9aa37c0.", "<b>Scenario / AC:</b> " + h(evidence)))
    return "".join(out)

def document():
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    pieces = []
    ap = pieces.append
    ap("<section class='cover'><div class='brand'><div class='logo'>N</div><div>NUTTIEW<span>SOFTWARE ENGINEERING</span></div></div>")
    ap("<div class='cover-small'>CPE334 · SEMESTER 1/2026 · PROJECT DELIVERABLE 1</div>")
    ap("<h1>NutTiew<br><em>ระบบจองนัดหมายติวเตอร์</em></h1>")
    ap("<p class='cover-desc'>รายงานตรวจสอบงาน Sprint 1 พร้อมภาพกระบวนการใช้งานจริง และภาคผนวกข้อกำหนดวิศวกรรมฉบับเต็ม (Parts A–F)</p>")
    ap("<div class='rule'></div>")
    ap("<div class='cover-facts'><div><span>THEME</span><b>01 · Appointment & Scheduling</b></div>"
       "<div><span>SOURCE APP</span><b>sprint1 @ 9aa37c0</b></div>"
       "<div><span>LOGIN UI CANDIDATE</span><b>PR #51 @ 3c0cb1b · Not merged</b></div>"
       "<div><span>DOCUMENT BASIS</span><b>PR #49 · 215-page complete baseline</b></div></div>")
    ap("<p class='cover-foot'>วันที่ตรวจข้อมูล 11 พฤศจิกายน 2569 · สถานะ Release และการส่ง LEB2 ยังต้องยืนยันกับทีม</p></section>")

    ap("<section class='guide'><h1>สารบัญ · วิธีตรวจรายงาน</h1>")
    ap(p("เล่มนี้แบ่งเป็น <strong>ส่วนสรุปพร้อมภาพหลักฐาน</strong> สำหรับอ่านเร็ว และ <strong>ภาคผนวกเอกสารฉบับเต็ม 215 หน้า</strong> ต่อท้ายในไฟล์เดียว เพื่อให้ตรวจ Parts A–F ได้โดยไม่ต้องเปิดไฟล์สเปกแยกตามข้อกำหนดอาจารย์"))
    ap(html_table(["ส่วน", "ใช้ตรวจอะไร", "หลักฐานหลัก"], [
        ["A · SRS", "ปัญหา/ผู้ใช้/ขอบเขต/FR/BR/NFR", "SRS เต็มในภาคผนวก"],
        ["B · Inventory", "Feature IDs, requirement mapping, AC/VC", "Traceability และ Inventory เต็ม"],
        ["C · System SDS", "Architecture, data, API, role/security, deploy plan", "System SDS และ Diagram ในภาคผนวก"],
        ["D · Sprint plan", "เป้าหมายสาม Sprint, dependencies", "Three-Sprint Plan ฉบับเต็ม"],
        ["E · Contracts", "Feature SDS, UI/API/Data, AC 35, VC 39, DoD", "Contract + STS ในภาคผนวก"],
        ["F · Evidence", "ภาพ Normal/Negative/Role และผลทดสอบ", "ภาพ 01–08 และ PR51; CI links"]
    ]))
    ap("<div class='note'><b>Source boundary / release status:</b> The canonical engineering-contract appendix comes from PR #49, based on source <b>9aa37c0</b>. The new Login UI images come from PR #51 <b>3c0cb1b</b>, a separately reviewed candidate that has not been merged to sprint1. This front section supersedes historical CI totals and PR-status lines appearing in the archival appendix. No main release tag has been verified.</div>")
    ap("<h2>ผู้จัดทำและการระบุข้อมูลส่วนตัว</h2>")
    ap(html_table(["ผู้ร่วมโครงการ", "บทบาทจากข้อมูลใน Repository"], [
        ["Tanboon Teawsawat (@Tanaboonnnnn)", "Requirements, System SDS, Sprint Planning, Peer Review"],
        ["Chxtamos (@Chxtamos)", "Implementation, SQL constraints, UI, Testing and PDF baseline"]
    ]))
    ap(p("<b>รหัสนักศึกษา:</b> งดเผยแพร่ใน Repository สาธารณะ ต้องเติมในฉบับส่ง LEB2 โดยทีมตามจริง ไม่ใส่ตัวเลขสมมติ"))
    ap(p("Repository: " + link(REPO, REPO) + " · CI: " + link(CI_LOGIN, "Run #42888945331 (PR #51)") + " · PR49: " + link(PR49, "Full PDF baseline") + " · PR51: " + link(PR51, "Login visual change")))

    ap(part("A", "Software Requirements Specification", "ขอบเขตผลิตภัณฑ์และกฎที่ทดสอบได้"))
    ap(p("ระบบนัดหมายติวเตอร์หนึ่งต่อหนึ่งประกอบด้วย Customer และ Tutor โดย Sprint 1 ครอบคลุมการยืนยันตัวตน การสร้าง Slot ระยะเวลา 60 นาที การเปิดรายการที่เข้าเกณฑ์ การจองแบบ Exclusive และการอ่านรายการจองของเจ้าของข้อมูล นโยบาย Cancel/Reschedule, Notice และ Reporting ถูกจัดไว้ Sprint 2–3"))
    ap(html_table(["Actor", "สิ่งที่ทำได้", "กฎสิทธิ์"], [
        ["Customer", "Login, browse eligible times, book, read own booking", "Cannot create Tutor slots; cannot see others' Bookings"],
        ["Tutor", "Login, create/see own slots, inspect schedule", "Cannot impersonate another Tutor or browse private Customer bookings"],
        ["Anonymous", "Login only", "Protected API must reject and not leak data"]
    ]))
    ap("<h2>Business rules ที่ตรวจเป็นหลัก</h2>")
    ap(html_table(["Rule", "การตีความและผลที่คาดหวัง"], [
        ["Exclusive Slot", "Slot เดียวมี Active Booking ได้ไม่เกินหนึ่ง แม้มีคำขอพร้อมกัน"],
        ["Tutor overlap", "Tutor คนเดียวสร้าง Offered Slots ทับช่วงกันไม่ได้ แต่ช่วงติดกันอนุญาต"],
        ["Customer overlap", "Customer จองช่วงเวลาที่ชนกับ Booking ของตัวเองไม่ได้ แม้ต่าง Tutor"],
        ["Lead time", "จองก่อนเวลาเริ่มอย่างน้อย 60 นาที ตรวจที่ Transactional decision time"],
        ["Ownership", "Server ใช้ Session ที่เชื่อถือได้ ไม่รับ Client-supplied ownership"],
        ["Time / Status", "ยึด Asia/Bangkok; เวลาเลยไปไม่ทำให้สถานะ Booked กลายเป็น Completed เอง"]
    ]))
    ap(p("รหัส Requirement หลักที่อ้างอิง: <b>FR-001..036 / BR-001..035 / NFR-001..016</b> พร้อมข้อถาม/การตัดสินใจ <b>Q01..Q32</b> และ Assumptions/Exclusions ทั้งหมดอยู่ใน Part A ฉบับเต็มของภาคผนวก อ้างอิง " + source("docs/srs.md", "docs/srs.md")))

    ap(part("B", "Feature Inventory & Traceability", "ความเชื่อมโยงจาก Requirement ไปถึง Feature, Sprint และ Test"))
    ap(p("Feature Inventory ด้านล่างดึงจากเอกสารต้นฉบับโดยตรง ไม่ประดิษฐ์ Sprint ใหม่ ผู้ตรวจสามารถตรวจ Requirement ครบทุกข้อใน Traceability Matrix ของภาคผนวกและ " + source("docs/traceability.md", "docs/traceability.md") + ""))
    ap("<div class='table-source'>Source: docs/features.md (canonical sprint1 baseline)</div>")
    ap(markdown_table("docs/features.md", "| Stable ID |", "\n## Baseline"))
    ap("<h2>AC-S1-01..35 — Acceptance Criteria สำหรับ Sprint 1</h2>")
    ap(p("ใช้เป็นเกณฑ์พฤติกรรมที่วัดได้ ทั้ง Success, Boundary, Role และ Negative Cases; ไม่ใช่ผลรัน Test โดยอัตโนมัติ"))
    ap(markdown_table("docs/traceability.md", "| AC ID |", "\n\n### Verification cases:"))
    ap("<h2>VC/TEST-S1-01..39 — Traceability to Test Design</h2>")
    ap(p("ตารางนี้เก็บ Expected Results จาก Source เพื่อไม่ให้ผู้ตรวจต้องเปิด GitHub ดูว่าแต่ละ Test ตั้งใจตรวจอะไร ผลการรันจริงอยู่ Part F"))
    ap(markdown_table("docs/traceability.md", "| VC / TEST ID |", "\n\n### Three separate"))

    ap(part("C", "System-Level Software Design Specification", "Architecture, Data, API และ Backend Access Control"))
    ap("<div class='architecture'><div>React 19 UI<br><small>Login · Tutor · Customer</small></div><div class='arrow'>⇩ REST</div><div>Express 5 API<br><small>Auth guards · Business rules · Transactions</small></div><div class='arrow'>⇩ Prisma / SQL</div><div>PostgreSQL 18<br><small>Durable Slots / Bookings · Exclusion guards</small></div></div>")
    ap("<h2>ข้อมูลหลักและ Invariants</h2>")
    ap(html_table(["Entity", "หลักฐานสำคัญที่ต้องรักษา"], [
        ["User", "id, role Customer/Tutor, hashed credentials, active status"],
        ["Session", "Server-stored session, expiry and revocation; HttpOnly cookie, CSRF binding"],
        ["Slot", "Tutor owner, startsAt/endsAt, lifecycle, native overlap exclusion"],
        ["Booking", "Customer, Tutor, Slot, Booked status, exclusive and customer-overlap guards"],
        ["AuthAttemptBucket / Reservation", "Persisted lockout and authentication attempt control"]
    ]))
    ap("<h2>API/Role matrix (sample, full contracts in appendix)</h2>")
    ap(html_table(["API / action", "Customer", "Tutor", "Anonymous"], [
        ["POST /api/v1/auth/login", "Allowed", "Allowed", "Allowed"],
        ["GET /api/v1/auth/me and logout", "Own Session", "Own Session", "No session → reject"],
        ["POST /api/v1/tutor/slots", "Forbidden", "Own", "Forbidden"],
        ["GET /api/v1/customer/availability", "Own eligible offers", "Forbidden", "Forbidden"],
        ["POST /api/v1/customer/bookings", "Own", "Forbidden", "Forbidden"],
        ["GET /api/v1/customer/bookings", "Own only", "Forbidden", "Forbidden"],
        ["GET /api/v1/tutor/bookings", "Forbidden", "Own schedule", "Forbidden"]
    ]))
    ap(p("ระบบออกแบบให้รันผ่าน Docker และ CI/CD ก่อน Deploy บน GCP ใน Lab 5 ตามเอกสารอาจารย์ **ไม่อ้างว่าติดตั้ง Cloud แล้วใน Deliverable 1** ดู System SDS เต็ม " + source("docs/system-sds.md", "docs/system-sds.md")))

    ap(part("D", "Three-Sprint Plan", "แผนต่อยอดจาก Slice ที่ทำงานได้จริง"))
    ap(html_table(["Sprint", "Goal / Included work", "Checkpoint"], [
        ["Sprint 1", "Auth, Tutor 60-minute Slots, Customer Availability, Exclusive Booking, Protected Retrieval", "D1 · 8 Nov 2026"],
        ["Sprint 2", "Cancellation, rescheduling, notice, owner-safe slot withdrawal per feature inventory", "D2 progress · 29 Nov 2026"],
        ["Sprint 3", "Remaining reporting, integration, hardening and complete verification", "Final · 13 Dec 2026"]
    ]))
    ap(p("การส่งแต่ละส่วนใช้ Issue → Feature Branch → PR Review → sprint1 staging → Reviewed Release PR ไป main → Tag โดย CI เป็นหลักฐานประกอบ ไม่มีการอ้างว่า Release Gate ที่ยังเปิดอยู่ได้ผ่านไปแล้ว"))
    ap(p("เอกสารต้นฉบับ " + source("docs/sprints/plan.md", "Three-Sprint Plan") + " ให้ dependencies, capacity และ acceptance checkpoints รายละเอียดครบ และมีในภาคผนวก"))

    ap(part("E", "Sprint 1 Engineering Contracts", "Feature SDS · UI/API/Data · AC · STS · DoD"))
    ap(p("Feature SDS, validation, responses, errors, data constraints, migration and STS ฉบับเต็มทั้ง 5 Features รวม Shared Booking Foundation อยู่ในภาคผนวกของ PDF เดียวกัน ด้านล่างเป็นตำแหน่งตรวจ Contract ที่สอดคล้องกับภาพหลักฐาน"))
    ap(html_table(["Contract", "รายละเอียดที่ต้องตรวจ", "Test / AC examples"], [
        ["F-S1-01 Auth", "Session, role, trusted identity, login/logout, CSRF", "AUTH-01..23; AC-S1-01..07"],
        ["F-S1-02 Tutor Slots", "60-minute validation, Tutor ownership, overlap race A", "SLOT series; AC-S1-08..14"],
        ["F-S1-03 Availability", "Bookable-only availability, Bangkok Time, date-first UI", "AVA series; AC-S1-15..18"],
        ["F-S1-04 Booking", "SERIALIZABLE; guarded locks; replay; cutoff; conflicts B/C", "BOOK series; AC-S1-19..29 and 35"],
        ["F-S1-05 Retrieval", "Own Bookings, detail safe 404, Tutor schedule", "RET series; AC-S1-30..34"],
        ["Shared Foundation", "Postgres exclusion constraints, lock-order proofs, migration", "BDF series"]
    ]))
    ap("<h2>Definition of Done และ TDD</h2>")
    ap(p("DoD ผูกกับ Feature behavior ที่ตรวจได้จริง, เอกสาร/Tests ที่สอดคล้องกัน, AC/STS, การรันจริงกับ DB, PR Review โดยเพื่อน และ Release เข้า main อย่างเป็นทางการ งานที่ยังไม่ Merge/ยังไม่ผ่าน Manual WCAG ถูกระบุเป็น Pending ไม่อ้าง Complete"))
    ap(p("Test-first evidence และเอกสาร Gate/Approval ฉบับเต็มอยู่ใน Appendix Part E, GitHub PR และ " + source("docs/traceability.md", "Traceability") + " ข้อกำหนดนี้ห้ามสรุปว่า test design ทุก VC รันตรงตามหนึ่งต่อหนึ่ง โดยไม่เทียบไฟล์ Test จริง"))

    ap(part("F", "Working Sprint 1 & Verification Evidence", "UI screenshots · Negative/Role · CI & Review"))
    ap("<div class='metrics'>" +
       card("Unit tests", "34 / 34", "API 29 + Web 5") +
       card("PostgreSQL DB", "107 / 107", "14 test files") +
       card("Edge E2E", "68 / 68", "PR51 passing CI") +
       "</div>")
    ap(p("ผล CI จาก " + link(CI_LOGIN, "Run #42888945331") + " ของ PR #51 commit " + h(SHA_LOGIN[:7]) + " ผ่านทั้ง 3 Jobs; นับเป็น 209 test executions จาก Unit/DB/E2E (ไม่ใช่การตรวจ Manual WCAG) และ PR51 ยังไม่ Merge ขณะที่ Part F baseline มีภาพ/ผลจาก PR #49 source app " + h(SHA_APP[:7]) + ""))
    ap("<h2>F.1 ภาพ Login ธีมใหม่ (PR #51, ยังไม่ได้ Merge)</h2>")
    ap(figure("build/d1/login-after-1280.png", "Login · Desktop (1280px)",
              "หน้า Login ใช้ Navy #202B44, Orange #F47736, Canvas #F7F8FB และคำอธิบายสถานะชัดเจน",
              "Source: PR #51 · 3c0cb1b · real Microsoft Edge/Playwright before merge",
              "<b>AUTH-15 / AUTH-23</b> · Open Login page and verify presentation, not a main release screenshot"))
    ap(figure("build/d1/login-after-375.png", "Login · Mobile (375px)",
              "ตรวจระยะขอบและการอ่านฟอร์มบนมือถือ พร้อม Focus/Label ที่คงตาม UI Specification",
              "Source: PR #51 · 3c0cb1b · real Edge E2E",
              "<b>AUTH-15</b> · Responsive without horizontal overflow"))
    ap(figure("build/d1/login-after-error-1280.png", "Login · Invalid credentials & Focus",
              "ตัวอย่างสถานะ Error ที่แสดงข้อความและสี Semantic โดยไม่บังคับให้ผู้ใช้ตีความจากสีอย่างเดียว",
              "Source: PR #51 · 3c0cb1b · test evidence",
              "<b>AUTH-02 / AUTH-15</b> · Expected no authenticated session"))
    ap("<h2>F.2 Normal domain journey — มีภาพครบ 8 ขั้นตอน</h2>")
    ap(p("ลำดับ 01–08 เป็นไฟล์ภาพจริงที่เก็บใน Repository Sprint 1 ก่อนการปรับ Login UI รอบ PR #51; ภาพส่วนนี้ยึดตามสถานะ baseline ไม่อ้างเป็นภาพใหม่จาก PR51 ทุกภาพ"))
    ap(screenshot_figure_series())
    ap("<h2>F.3 Additional state and responsive evidence</h2>")
    add = [
        ("Tutor Calendar", "build/d1/dashboard-1280.png", "Tutor เห็นตารางแบบ Calendar และรายการช่วงเวลาที่มีอยู่", "Source: PR51 green CI; same Tutor UI source as sprint1"),
        ("Tutor 409 Conflict", "build/d1/dashboard-conflict-409.png", "กฎการสร้าง Slot ชนกันปฏิเสธพร้อมข้อความอธิบาย", "Source: PR51 green CI; negative rule screenshot"),
        ("Customer Availability Calendar", "build/d1/after-calendar-1280.png", "ปฏิทินรายเดือนเปิดวันที่มีช่วงเวลาจองได้และจัดกลุ่มเวลา", "Source: PR51 green CI; Customer flow"),
        ("Customer Selected Day", "build/d1/after-calendar-selected-1280.png", "เปิดกลุ่มเวลาและเลือกช่วงที่ต้องการโดยยังไม่ถือเป็นการจองสำเร็จ", "Source: PR51 green CI; selected state"),
        ("Customer mobile", "build/d1/after-calendar-375.png", "การแสดงปฏิทินบนมือถือ 375px โดยไม่อ้างว่าเป็น Manual Screen-Reader review", "Source: PR51 green CI; responsive"),
        ("Empty availability", "build/d1/customer-availability-empty-1280.png", "ไม่มีช่วงเวลาที่เข้าเกณฑ์ ระบบแสดง Empty State หลัง GET 200 เท่านั้น", "Source: PR51 green CI"),
        ("API unavailable", "build/d1/customer-availability-error-503.png", "กรณี Service 503 ต้องแสดง Error/Retry ไม่แอบอ้างว่าไม่มีช่วงเวลาว่าง", "Source: PR51 green CI"),
        ("Tutor uncertain logout", "build/d1/dashboard-logout-uncertain-503.png", "กรณี Logout outcome ไม่แน่ชัด ต้องป้องกันการแสดงข้อมูลส่วนตัว", "Source: PR51 green CI"),
    ]
    for title, filename, description, origin in add:
        ap(figure(filename, title, description, origin))
    ap("<h2>F.4 Backend / Test Assertions and reviewer evidence</h2>")
    ap(html_table(["Proof", "Evidence source / expected result"], [
        ["409 SLOT_UNAVAILABLE", source("apps/api/test/bookings.db.test.ts", "bookings.db.test.ts") + " (BOOK-04): occupied Slot cannot yield second committed Booking"],
        ["409 CUSTOMER_OVERLAP", source("apps/api/test/bookings.db.test.ts", "BOOK-05 / BOOK-06") + ": reject overlapping Customer bookings, allow adjacent"],
        ["404 BOOKING_NOT_FOUND", source("apps/api/test/retrieval.db.test.ts", "retrieval.db.test.ts") + " (RET-03): do not disclose another Customer booking"],
        ["Race A/B/C", source("apps/api/test/bookings.db.test.ts", "DB concurrency tests") + ": DB constraints and guarded transaction order"],
        ["Review & CI", link(PR49, "PR #49") + " and " + link(PR51, "PR #51") + "; " + link(CI_LOGIN, "green 3-job CI #42888945331")]
    ]))
    ap("<div class='note'><b>Pending release gates:</b> PR #49 & PR #51 are still open as of the data recorded here. A reviewed sprint1→main PR, immutable release tag, real student IDs in private submission, and manual human WCAG/screen-reader inspection are not verified. New Login screenshots from PR51 should be treated as a candidate, not proof that main has changed.</div>")
    ap("<h2>F.5 Source index / audit links</h2>")
    ap(html_table(["Authority", "URL"], [
        ["Full canonical SRS", source("docs/srs.md")],
        ["Features and complete Traceability", source("docs/traceability.md")],
        ["System SDS", source("docs/system-sds.md")],
        ["Three-Sprint Plan", source("docs/sprints/plan.md")],
        ["Part E contracts", link(REPO + "/tree/" + SHA_APP + "/docs/features", "docs/features/")],
        ["Raw screenshots 01–08", link(REPO + "/tree/" + SHA_APP + "/docs/evidence/sprint1", "docs/evidence/sprint1/")],
        ["PR51 UI source and screenshots", link(PR51, "PR #51")],
        ["Latest successful GitHub Actions", link(CI_LOGIN, "CI run #42888945331")]
    ]))
    ap("<div class='appendix-intro'><div class='part-key'>FULL SOURCE APPENDIX</div><h1>Parts A–F<br>เอกสารวิศวกรรมฉบับเต็ม</h1><p>หน้าถัดไปเป็น PDF ต้นฉบับ 215 หน้า ของ PR #49 ที่รักษาเอกสาร Parts A–E และหลักฐาน Sprint 1 ครบตามใบงาน ไม่ย่อหรือตัดเนื้อหาออก มีข้อความสถานะ PR/ผลทดสอบเก่าบางจุด ให้ยึดสถานะล่าสุดจากหน้าสรุปด้านหน้าแทน</p></div>")
    html = "\n".join(pieces)
    css = """
    @page { size: A4; margin: 17mm 15mm 17mm 15mm;
      @top-left {content:"NUTTIEW   •   CPE334";font:700 8pt "Noto Sans Thai";color:#202b44;border-bottom:1px solid #e0e6ef;padding-bottom:5pt}
      @top-right {content:"D1 · VISUAL AUDIT · 11 NOV 2026";font:500 7.5pt "Noto Sans Thai";color:#66778a;border-bottom:1px solid #e0e6ef;padding-bottom:5pt}
      @bottom-left {content:"Engineering baseline 9aa37c0  ·  Login candidate 3c0cb1b";font:7pt "Noto Sans Thai";color:#66778a}
      @bottom-right {content:"Page " counter(page) " / " counter(pages);font:7.5pt "Noto Sans Thai";color:#66778a}
    }
    *{box-sizing:border-box}
    body{margin:0;font-family:"Noto Sans Thai",sans-serif;font-size:10pt;line-height:1.56;color:#172137}
    h1,h2,h3{color:#202b44;line-height:1.35;break-after:avoid}
    h1{font-size:18pt;margin:16pt 0 10pt}h2{font-size:12.7pt;margin:14pt 0 7pt}
    p{margin:0 0 8pt;orphans:3;widows:3}
    b,strong{font-weight:700;color:#202b44}
    a{color:#a43e14;overflow-wrap:anywhere;text-decoration:none;border-bottom:1px solid #edb396}
    table{width:100%;border-collapse:collapse;table-layout:auto;font-size:8.5pt;line-height:1.42;margin:10pt 0 14pt}
    thead{display:table-header-group}
    tr{break-inside:avoid}
    th,td{border:1px solid #d8e0eb;padding:6pt 7pt;text-align:left;vertical-align:top;overflow-wrap:anywhere}
    th{background:#eaf0f8;color:#202b44;font-weight:700}
    tr:nth-child(even) td{background:#f8fafc}
    .cover{break-after:page;padding-top:24mm}
    .brand{display:flex;align-items:center;gap:12pt;color:#202b44;font-size:19pt;font-weight:850}
    .brand span{display:block;font-size:7pt;letter-spacing:1.4pt;color:#677a94}
    .logo{width:48pt;height:48pt;background:#f47736;border-radius:11pt;display:grid;place-items:center;color:#172137}
    .cover-small{font-size:8pt;font-weight:700;letter-spacing:1.5pt;color:#a43e14;margin:40pt 0 9pt}
    .cover h1{font-size:36pt;letter-spacing:-1.3pt;line-height:1.18;color:#202b44;margin:0}
    .cover h1 em{font-size:20pt;font-weight:700;font-style:normal}
    .cover-desc{font-size:12.3pt;color:#455a76;max-width:440pt;margin-top:22pt}
    .rule{height:3pt;background:#f47736;margin:24pt 0}
    .cover-facts{display:grid;grid-template-columns:1fr 1fr;gap:17pt}
    .cover-facts div{padding:9pt 0;border-bottom:1px solid #e3eaf2}
    .cover-facts span{display:block;font-size:7pt;color:#677a94;letter-spacing:1pt}
    .cover-facts b{font-size:10pt}
    .cover-foot{margin-top:40pt;color:#66778a;font-size:8pt}
    .guide{break-after:page}
    .part-title{break-before:page;background:#202b44;color:#fff;margin:0 0 17pt;padding:17pt 18pt;border-left:5pt solid #f47736;border-radius:4pt}
    .part-title h1{color:white;font-size:18pt;margin:1pt 0 5pt}.part-title p{color:#d4dfec;margin:0}
    .part-key{color:#f47736;font-size:9pt;font-weight:800;letter-spacing:1pt}
    .note{padding:12pt 13pt;border-left:3pt solid #f47736;background:#fff7f0;margin:12pt 0 16pt;color:#2e3d56}
    .note b{color:#b34b17}
    .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10pt;margin:14pt 0 22pt}
    .metric{padding:12pt;border:1px solid #d8e0eb;border-radius:5pt;background:#f7f8fb}
    .metric span{display:block;color:#5b6a83;font-size:8pt}
    .metric strong{display:block;color:#202b44;font-size:22pt;margin:4pt 0}
    .metric small{display:block;color:#66778a;font-size:7.5pt}
    .architecture{display:flex;align-items:center;justify-content:center;gap:8pt;margin:22pt 0 18pt}
    .architecture>div:not(.arrow){padding:14pt 8pt;background:#eff3fa;border:1px solid #c7d5e5;border-radius:6pt;text-align:center;color:#202b44;font-size:10pt;min-width:0;flex:1;font-weight:700}
    .architecture small{color:#536783;font-size:7pt;font-weight:400}.architecture .arrow{color:#f47736;font-size:17pt}
    .evidence{break-inside:avoid;page-break-inside:avoid;margin:14pt 0 24pt;padding:0 0 10pt}
    .figure-heading{font-size:11pt;font-weight:750;color:#202b44;margin-bottom:8pt}
    .evidence img{display:block;max-width:100%;max-height:133mm;width:auto;height:auto;object-fit:contain;border:1px solid #d9e0ec;border-radius:4pt;margin:0 auto}
    .evidence figcaption{color:#172137;margin-top:8pt;font-size:9pt}
    .fig-source,.fig-ref{font-size:7.6pt;color:#61758b;margin-top:4pt}
    .fig-ref{color:#404f65}
    .appendix-intro{break-before:page;padding-top:60mm}
    .appendix-intro h1{font-size:26pt}
    .appendix-intro p{font-size:12pt;color:#455a76}
    .table-source{font-size:7.5pt;color:#61758b}
    """
    return "<!doctype html><html lang='th'><head><meta charset='utf-8'><style>" + css + "</style></head><body>" + html + "</body></html>"

def main():
    if not OUT.exists():
        raise RuntimeError("Expected PR #49 baseline PDF is missing")
    TEMP.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    if not BASELINE.exists():
        BASELINE.write_bytes(OUT.read_bytes())
    else:
        if BASELINE.stat().st_size < 9_000_000:
            raise RuntimeError("Baseline unusually small")
    baseline = fitz.open(BASELINE)
    if len(baseline) != 215:
        raise RuntimeError("Expected 215-page complete baseline, got " + str(len(baseline)))
    html = document()
    (TEMP / "summary.html").write_text(html, encoding="utf-8")
    HTML(string=html, base_url=ROOT.as_uri()).write_pdf(SUMMARY)
    summary = fitz.open(SUMMARY)
    if len(summary) < 15 or len(summary) > 90:
        raise RuntimeError("Unexpected summary page count " + str(len(summary)))
    final = fitz.open()
    final.insert_pdf(summary)
    final.insert_pdf(baseline)
    toc = [[1,"Illustrated executive summary",1]]
    for letter in "ABCDEF":
        needle = {"A":"Software Requirements Specification", "B":"Feature Inventory & Traceability",
                  "C":"System-Level Software Design Specification", "D":"Three-Sprint Plan",
                  "E":"Sprint 1 Engineering Contracts", "F":"Working Sprint 1 & Verification Evidence"}[letter]
        candidates = [i + 1 for i,p in enumerate(summary) if needle in p.get_text()]
        if candidates:
            toc.append([2,"Part " + letter + ": " + needle,candidates[0]])
    toc.append([1,"Complete engineering appendix (PR #49)",len(summary) + 1])
    for lvl,title,page in baseline.get_toc():
        if lvl==1 and page>0:
            toc.append([2,title,page+len(summary)])
    final.set_toc(toc)
    dest=TEMP / "final.pdf"
    final.save(dest,garbage=4,deflate=True)
    final.close()
    b=fitz.open(dest)
    if len(b)!=len(summary)+215:
        raise RuntimeError("Merged page count mismatch")
    if sum(len(p.get_images(full=True)) for p in list(b)[:len(summary)]) < 15:
        raise RuntimeError("Expected at least 15 real screenshot placements")
    if not any("AC-S1-35" in p.get_text() for p in list(b)[:len(summary)]):
        raise RuntimeError("AC table missing")
    if not any("VC-S1-39" in p.get_text() for p in list(b)[:len(summary)]):
        raise RuntimeError("VC table missing")
    b.close()
    OUT.write_bytes(dest.read_bytes())
    sha=hashlib.sha256(OUT.read_bytes()).hexdigest()
    print("SUCCESS",OUT,"summary_pages",len(summary),"full_baseline",215,"total_pages",len(summary)+215,"bytes",OUT.stat().st_size,"sha256",sha)
    (TEMP / "build-summary.txt").write_text("summary_pages="+str(len(summary))+"\nfull_baseline_pages=215\nsha256="+sha+"\n",encoding="utf8")

if __name__=="__main__":
    main()
