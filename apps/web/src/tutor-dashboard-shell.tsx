import { useState, type ReactNode } from 'react';
import './tutor-dashboard.css';

type IconKind = 'calendar' | 'user' | 'logout' | 'menu' | 'plus' | 'clock' | 'arrow';
function Icon({ kind }: { kind: IconKind }) {
  const paths: Record<IconKind, ReactNode> = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M13 14h3M7 18h3"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.4-4 3-6 7.5-6s7.1 2 7.5 6"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
  };
  return <svg className="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export function TutorDashboardShell({
  accountId, onLogout, logoutBusy, logoutError, children,
}: {
  accountId: string;
  onLogout: () => void | Promise<void>;
  logoutBusy: boolean;
  logoutError: string;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const shortId = accountId.replaceAll('-', '').slice(-8);
  const closeMenu = () => setMenuOpen(false);
  const focusCreate = () => document.getElementById('slot-date')?.focus();
  return <div className="tutor-app">
    <aside className={'tutor-sidebar' + (menuOpen ? ' tutor-sidebar-open' : '')} aria-label="เมนูสำหรับ Tutor">
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">N</div>
          <div><strong>NutTiew</strong><small>TUTOR WORKSPACE</small></div>
        </div>
        <button type="button" className="sidebar-menu-button"
          aria-expanded={menuOpen} aria-controls="tutor-sidebar-navigation"
          aria-label={menuOpen ? 'ปิดเมนูนำทาง' : 'เปิดเมนูนำทาง'}
          onClick={() => setMenuOpen(open => !open)}><Icon kind="menu"/></button>
      </div>
      <nav id="tutor-sidebar-navigation" className="sidebar-navigation" aria-label="ทางลัดบัญชี Tutor">
        <span className="sidebar-section-label">WORKSPACE</span>
        <a className="sidebar-nav-link sidebar-nav-active" aria-current="page" href="#calendar-section" onClick={closeMenu}>
          <Icon kind="calendar"/><span>ตารางเวลาของฉัน</span><span className="nav-active-marker" aria-hidden="true" />
        </a>
        <a className="sidebar-nav-link" href="#account-details" onClick={() => setMenuOpen(true)}>
          <Icon kind="user"/><span>บัญชีของฉัน</span>
        </a>
      </nav>
      <div className="sidebar-account" id="account-details">
        <span className="sidebar-section-label">ACCOUNT</span>
        <div className="account-avatar" aria-hidden="true">T</div>
        <div className="account-description">
          <strong>Tutor</strong>
          <small>บัญชี #<span className="account-id-ref">{shortId}</span></small>
        </div>
        <button type="button" className="sidebar-logout" disabled={logoutBusy}
          onClick={() => void onLogout()}>
          <Icon kind="logout"/><span>{logoutBusy ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}</span>
        </button>
      </div>
    </aside>

    <div className="dashboard-main-area">
      <div className="dashboard-topbar">
        <div className="breadcrumb"><span className="breadcrumb-first">NutTiew</span><span aria-hidden="true">/</span><strong>ตารางเวลาของฉัน</strong></div>
        <div className="account-status"><span className="status-live-dot" aria-hidden="true"/>
          <span>เข้าสู่ระบบแล้ว</span><span className="topbar-tutor">Tutor · #{shortId}</span></div>
      </div>

      <div className="dashboard-inner">
        {logoutError && <p className="dashboard-auth-error" role="alert">{logoutError}</p>}
        <header className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <p className="dashboard-kicker">MY TUTORING SCHEDULE</p>
            <h1 id="schedule-heading">ตารางเวลาติวของฉัน</h1>
            <p>จัดการช่วงเวลาที่พร้อมสอนของคุณในที่เดียว ทุกช่วงเวลาเชื่อมต่อกับข้อมูลที่บันทึกไว้จริง</p>
            <div className="hero-identity"><Icon kind="clock"/><span>เวลาประเทศไทย · <strong>Asia/Bangkok (UTC+07:00)</strong></span></div>
          </div>
          <button type="button" className="dashboard-add-cta" onClick={focusCreate}>
            <Icon kind="plus"/>เพิ่มช่วงเวลาติว
          </button>
        </header>
        {children}
        <footer className="dashboard-footer"><span>NutTiew · Tutor availability</span><span>ข้อมูลจากตารางเวลาของบัญชีนี้เท่านั้น</span></footer>
      </div>
    </div>
  </div>;
}
