import { useEffect, useRef, useState, type ReactNode } from 'react';
import { bangkokClock, bangkokDayKey, bangkokLongDate } from './tutor-calendar.js';
import './tutor-dashboard.css';
import './customer-availability.css';

export type CustomerAvailabilityOffer = {
  slotId: string;
  tutorRef: string;
  startsAt: string;
  endsAt: string;
};

type AvailabilityResponse = {
  data: CustomerAvailabilityOffer[];
  meta: {
    requestId: string;
    evaluatedAt: string;
  };
};

type IconKind = 'calendar' | 'user' | 'logout' | 'menu' | 'clock';
function Icon({ kind }: { kind: IconKind }) {
  const paths: Record<IconKind, ReactNode> = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M13 14h3M7 18h3"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.4-4 3-6 7.5-6s7.1 2 7.5 6"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></>,
  };
  return (
    <svg
      className="dashboard-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

function isValidUtcIso(value: unknown): boolean {
  if (typeof value !== 'string' || !value.endsWith('Z')) return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function isValidAvailabilityOffer(item: unknown): item is CustomerAvailabilityOffer {
  if (!item || typeof item !== 'object') return false;
  const offer = item as Record<string, unknown>;
  if (typeof offer.slotId !== 'string' || offer.slotId.trim().length === 0) return false;
  if (typeof offer.tutorRef !== 'string' || offer.tutorRef.trim().length === 0) return false;
  if (!isValidUtcIso(offer.startsAt) || !isValidUtcIso(offer.endsAt)) return false;
  const startTime = Date.parse(offer.startsAt as string);
  const endTime = Date.parse(offer.endsAt as string);
  return startTime < endTime;
}

async function fetchAvailability(
  externalSignal: AbortSignal,
  expectedBinding: string,
): Promise<AvailabilityResponse> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (externalSignal.aborted) stop();
  else externalSignal.addEventListener('abort', stop, { once: true });
  const timeout = window.setTimeout(stop, 10_000);
  try {
    const response = await fetch('/api/v1/customer/availability', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.code ?? 'HTTP_' + response.status);
    }
    if (response.headers.get('X-NutTiew-Session-Binding') !== expectedBinding) {
      throw new Error('SESSION_MISMATCH');
    }
    if (
      !payload ||
      typeof payload !== 'object' ||
      !Array.isArray(payload.data) ||
      !isValidUtcIso(payload?.meta?.evaluatedAt) ||
      typeof payload?.meta?.requestId !== 'string' ||
      payload.meta.requestId.trim().length === 0 ||
      !payload.data.every(isValidAvailabilityOffer)
    ) {
      throw new Error('INVALID_AVAILABILITY_RESPONSE');
    }
    return payload as AvailabilityResponse;
  } finally {
    window.clearTimeout(timeout);
    externalSignal.removeEventListener('abort', stop);
  }
}

function isAccessDeniedOrExpired(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === 'UNAUTHENTICATED' ||
      error.message === 'HTTP_401' ||
      error.message === 'FORBIDDEN' ||
      error.message === 'HTTP_403' ||
      error.message === 'SESSION_MISMATCH')
  );
}

type DateGroup = {
  dayKey: string;
  dateLabel: string;
  items: CustomerAvailabilityOffer[];
};

function groupOffersByBangkokDate(offers: CustomerAvailabilityOffer[]): DateGroup[] {
  const groups: DateGroup[] = [];
  for (const offer of offers) {
    const start = new Date(offer.startsAt);
    const dayKey = bangkokDayKey(start);
    const last = groups[groups.length - 1];
    if (last && last.dayKey === dayKey) {
      last.items.push(offer);
    } else {
      groups.push({
        dayKey,
        dateLabel: bangkokLongDate(start),
        items: [offer],
      });
    }
  }
  return groups;
}

export function CustomerAvailability({
  accountId,
  sessionBinding,
  onLogout,
  logoutBusy,
  logoutError,
  onUnauthorized,
}: {
  accountId: string;
  sessionBinding: string;
  onLogout: () => void | Promise<void>;
  logoutBusy: boolean;
  logoutError: string;
  onUnauthorized: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [offers, setOffers] = useState<CustomerAvailabilityOffer[]>([]);
  const [evaluatedAt, setEvaluatedAt] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState('');
  const [hasConfirmedResponse, setHasConfirmedResponse] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const version = useRef(0);
  const pendingGet = useRef<AbortController | null>(null);
  const selectedRef = useRef<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const shortId = accountId.replaceAll('-', '').slice(-8);

  const selectOffer = (slotId: string | null) => {
    selectedRef.current = slotId;
    setSelectedSlotId(slotId);
    setStaleNotice('');
  };

  const clearProtectedState = () => {
    setOffers([]);
    setEvaluatedAt(null);
    selectedRef.current = null;
    setSelectedSlotId(null);
    setStaleNotice('');
    setHasConfirmedResponse(false);
  };

  const refresh = async (showLoading = false) => {
    const current = ++version.current;
    pendingGet.current?.abort();
    const controller = new AbortController();
    pendingGet.current = controller;
    if (showLoading) setLoading(true);
    try {
      const result = await fetchAvailability(controller.signal, sessionBinding);
      if (version.current === current) {
        const previousSelected = selectedRef.current;
        const stillAvailable =
          previousSelected !== null &&
          result.data.some(item => item.slotId === previousSelected);
        if (previousSelected !== null && !stillAvailable) {
          selectedRef.current = null;
          setSelectedSlotId(null);
          setStaleNotice(
            'ช่วงเวลาที่เลือกไว้ก่อนหน้านี้ไม่ว่างหรือเกินเวลาปิดรับแล้ว กรุณาเลือกช่วงเวลาใหม่จากรายการล่าสุด',
          );
        } else {
          setStaleNotice('');
        }
        setOffers(result.data);
        setEvaluatedAt(result.meta.evaluatedAt);
        setHasConfirmedResponse(true);
        setListError('');
      }
    } catch (error) {
      if (version.current === current) {
        if (isAccessDeniedOrExpired(error)) {
          clearProtectedState();
          onUnauthorized();
        } else if (!controller.signal.aborted) {
          clearProtectedState();
          setListError('ไม่สามารถโหลดช่วงเวลาติวที่พร้อมให้เลือกได้ กรุณาลองใหม่');
          queueMicrotask(() => errorRef.current?.focus());
        }
      }
    } finally {
      if (version.current === current) {
        setLoading(false);
        pendingGet.current = null;
      }
    }
  };

  useEffect(() => {
    void refresh(true);
    return () => {
      version.current++;
      pendingGet.current?.abort();
    };
    // Component is keyed by sessionBinding in main.tsx; remounts on session change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    version.current++;
    pendingGet.current?.abort();
    clearProtectedState();
    void onLogout();
  };

  const selectedOffer =
    selectedSlotId !== null
      ? offers.find(item => item.slotId === selectedSlotId) ?? null
      : null;
  const dateGroups = groupOffersByBangkokDate(offers);

  return (
    <div className="customer-app">
      <aside
        className={'customer-sidebar' + (menuOpen ? ' customer-sidebar-open' : '')}
        aria-label="เมนูสำหรับ Customer"
      >
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <strong>NutTiew</strong>
            <small>CUSTOMER WORKSPACE</small>
          </div>
          <button
            type="button"
            className="sidebar-menu-button"
            aria-expanded={menuOpen}
            aria-controls="customer-sidebar-navigation"
            aria-label={menuOpen ? 'ปิดเมนูนำทาง' : 'เปิดเมนูนำทาง'}
            onClick={() => setMenuOpen(open => !open)}
          >
            <Icon kind="menu" />
          </button>
        </div>

        <nav
          id="customer-sidebar-navigation"
          className="sidebar-navigation"
          aria-label="ทางลัดบัญชี Customer"
        >
          <span className="sidebar-section-label">WORKSPACE</span>
          <a
            className="sidebar-nav-link sidebar-nav-active"
            aria-current="page"
            href="#availability-section"
            onClick={() => setMenuOpen(false)}
          >
            <Icon kind="calendar" />
            <span>เลือกช่วงเวลาติว</span>
            <span className="nav-active-marker" aria-hidden="true" />
          </a>
          <a
            className="sidebar-nav-link"
            href="#account-details"
            onClick={() => setMenuOpen(true)}
          >
            <Icon kind="user" />
            <span>บัญชีของฉัน</span>
          </a>
        </nav>

        <div className="sidebar-account" id="account-details">
          <span className="sidebar-section-label">ACCOUNT</span>
          <div className="account-avatar" aria-hidden="true">C</div>
          <div className="account-description">
            <strong>Customer</strong>
            <small>
              บัญชี #<span className="account-id-ref">{shortId}</span>
            </small>
          </div>
          <button
            type="button"
            className="sidebar-logout"
            disabled={logoutBusy}
            onClick={handleLogout}
          >
            <Icon kind="logout" />
            <span>{logoutBusy ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}</span>
          </button>
        </div>
      </aside>

      <div className="customer-main-area">
        <div className="dashboard-topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-first">NutTiew</span>
            <span aria-hidden="true">/</span>
            <strong>เลือกช่วงเวลาติว</strong>
          </div>
          <div className="account-status">
            <span
              className={
                logoutBusy || logoutError
                  ? 'status-live-dot status-dot-warning'
                  : 'status-live-dot'
              }
              aria-hidden="true"
            />
            <span>
              {logoutBusy
                ? 'กำลังออกจากระบบ…'
                : logoutError
                  ? 'เซสชันรอการยืนยัน'
                  : 'เข้าสู่ระบบแล้ว'}
            </span>
            <span className="topbar-tutor">Customer · #{shortId}</span>
          </div>
        </div>

        <div className="customer-inner">
          {logoutError && (
            <p className="dashboard-auth-error" role="alert">
              {logoutError}
            </p>
          )}

          <header className="availability-hero">
            <div className="availability-hero-copy">
              <h2 className="dashboard-kicker">ยินดีต้อนรับ</h2>
              <h1 id="availability-heading">เลือกช่วงเวลาติว</h1>
              <p className="availability-helper">
                เวลาที่แสดงเป็นเวลาประเทศไทย <strong>Asia/Bangkok (UTC+07:00)</strong>
              </p>
              {evaluatedAt && !listError && (
                <p className="availability-evaluated-at">
                  ตรวจสอบล่าสุด:{' '}
                  <time dateTime={evaluatedAt}>
                    {bangkokLongDate(new Date(evaluatedAt))}{' '}
                    {bangkokClock(new Date(evaluatedAt))} น.
                  </time>{' '}
                  (Asia/Bangkok)
                </p>
              )}
            </div>
            <button
              type="button"
              className="availability-refresh-button"
              disabled={loading || logoutBusy}
              onClick={() => void refresh(true)}
            >
              โหลดข้อมูลล่าสุด
            </button>
          </header>

          {staleNotice && (
            <div className="availability-surface availability-stale-notice" role="alert">
              {staleNotice}
            </div>
          )}

          {selectedOffer && !loading && !listError && (
            <section
              id="selected-offer-summary"
              className="availability-surface selected-summary-surface"
              aria-labelledby="selected-offer-heading"
              role="status"
            >
              <div className="selected-summary-copy">
                <h2 id="selected-offer-heading">ช่วงเวลาที่เลือกไว้</h2>
                <p className="selected-summary-details">
                  {bangkokLongDate(new Date(selectedOffer.startsAt))} •{' '}
                  {bangkokClock(new Date(selectedOffer.startsAt))}–
                  {bangkokClock(new Date(selectedOffer.endsAt))} น.
                  {bangkokDayKey(new Date(selectedOffer.startsAt)) !==
                    bangkokDayKey(new Date(selectedOffer.endsAt)) &&
                    ' (สิ้นสุดในวันถัดไป)'}{' '}
                  • รหัสอ้างอิงติวเตอร์: {selectedOffer.tutorRef}
                </p>
                <p className="selection-not-booking-note">
                  การเลือกช่วงเวลานี้ยังไม่ใช่การจอง และยังไม่ได้ล็อกสิทธิ์จนกว่าจะยืนยันการจองในขั้นตอนถัดไป
                </p>
              </div>
              <button
                type="button"
                className="clear-selection-button"
                onClick={() => selectOffer(null)}
              >
                ยกเลิกการเลือก
              </button>
            </section>
          )}

          <section id="availability-section" aria-labelledby="availability-heading">
            {loading ? (
              <div className="availability-surface availability-loading" role="status">
                กำลังโหลดช่วงเวลาติวที่พร้อมให้เลือก…
              </div>
            ) : listError ? (
              <div className="availability-surface availability-error" role="alert">
                <p
                  id="availability-error"
                  className="error"
                  tabIndex={-1}
                  ref={errorRef}
                >
                  {listError}
                </p>
                <button
                  type="button"
                  className="retry-button"
                  onClick={() => void refresh(true)}
                >
                  โหลดอีกครั้ง
                </button>
              </div>
            ) : offers.length === 0 ? (
              hasConfirmedResponse && !logoutBusy && !logoutError ? (
                <div className="availability-surface availability-empty" role="status">
                  <p className="empty-slots">ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก</p>
                </div>
              ) : null
            ) : (
              <div className="availability-surface">
                <div className="availability-list-header" role="status">
                  <span>รายการช่วงเวลาที่พร้อมให้เลือกตามลำดับเวลาเริ่ม</span>
                  <span className="availability-count-badge">
                    {offers.length} ช่วงเวลา
                  </span>
                </div>
                {dateGroups.map(group => (
                  <div className="availability-date-group" key={group.dayKey}>
                    <h2 className="availability-date-heading">{group.dateLabel}</h2>
                    <ul
                      className="availability-offer-list"
                      aria-label={`ช่วงเวลาติววันที่ ${group.dateLabel}`}
                    >
                      {group.items.map(offer => {
                        const start = new Date(offer.startsAt);
                        const end = new Date(offer.endsAt);
                        const crossMidnight =
                          bangkokDayKey(start) !== bangkokDayKey(end);
                        const isSelected = selectedSlotId === offer.slotId;
                        return (
                          <li
                            key={offer.slotId}
                            data-testid="availability-offer"
                            data-offer-slot-id={offer.slotId}
                            data-tutor-ref={offer.tutorRef}
                            className={
                              'availability-offer-row' +
                              (isSelected ? ' availability-offer-selected' : '')
                            }
                          >
                            <div className="availability-offer-main">
                              <div className="offer-hours">
                                <time dateTime={offer.startsAt}>
                                  {bangkokClock(start)}
                                </time>
                                <span aria-hidden="true">–</span>
                                <time dateTime={offer.endsAt}>
                                  {bangkokClock(end)}
                                </time>
                                {crossMidnight && (
                                  <span className="offer-next-day">
                                    สิ้นสุดในวันถัดไป
                                  </span>
                                )}
                              </div>
                              <div className="offer-date-line">
                                {bangkokLongDate(start)} • 60 นาที (Asia/Bangkok)
                              </div>
                              <div className="offer-tutor-ref">
                                รหัสอ้างอิงติวเตอร์: <span>{offer.tutorRef}</span>
                              </div>
                              {isSelected && (
                                <div className="offer-selected-status">
                                  สถานะ: เลือกไว้แล้ว (ยังไม่ใช่การจอง)
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              className="offer-select-button"
                              aria-pressed={isSelected}
                              onClick={() => selectOffer(offer.slotId)}
                            >
                              {isSelected ? 'เลือกช่วงเวลานี้แล้ว' : 'เลือกช่วงเวลานี้'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <footer className="dashboard-footer">
            <span>NutTiew · Customer availability</span>
            <span>ข้อมูลช่วงเวลาที่พร้อมให้เลือกจากเซิร์ฟเวอร์เท่านั้น</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
