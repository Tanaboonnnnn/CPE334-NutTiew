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

export type ConfirmedBookingDto = {
  id: string;
  slotId: string;
  startsAt: string;
  endsAt: string;
  status: 'Booked';
};

type BookingPostResponse = {
  httpStatus: 200 | 201;
  data: ConfirmedBookingDto;
  requestId: string;
};

type BookingBannerState =
  | {
      kind: 'confirmed-new';
      booking: ConfirmedBookingDto;
      tutorRef: string;
    }
  | {
      kind: 'confirmed-replay';
      booking: ConfirmedBookingDto;
      tutorRef: string;
    }
  | {
      kind: 'conflict' | 'not-eligible' | 'service-unavailable';
      message: string;
    };

type UnknownBookingOutcome = {
  slotId: string;
  tutorRef: string;
  startsAt: string;
  endsAt: string;
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

function isValidBookingDto(item: unknown): item is ConfirmedBookingDto {
  if (!item || typeof item !== 'object') return false;
  const dto = item as Record<string, unknown>;
  if (typeof dto.id !== 'string' || dto.id.trim().length === 0) return false;
  if (typeof dto.slotId !== 'string' || dto.slotId.trim().length === 0) return false;
  if (dto.status !== 'Booked') return false;
  if (!isValidUtcIso(dto.startsAt) || !isValidUtcIso(dto.endsAt)) return false;
  return Date.parse(dto.startsAt as string) < Date.parse(dto.endsAt as string);
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

/**
 * F-S1-04 UI §2 step 2: Obtain the Session-bound CSRF token from GET /api/v1/auth/csrf,
 * then immediately call GET /api/v1/auth/me and verify that the returned session binding
 * and identity still match the initial /auth/me binding and Customer accountId.
 */
async function bootstrapVerifiedCsrfToken(
  externalSignal: AbortSignal,
  expectedAccountId: string,
  expectedBinding: string,
): Promise<string> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (externalSignal.aborted) stop();
  else externalSignal.addEventListener('abort', stop, { once: true });
  const timeout = window.setTimeout(stop, 10_000);
  try {
    const csrfResponse = await fetch('/api/v1/auth/csrf', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    const csrfPayload = await csrfResponse.json().catch(() => ({}));
    if (!csrfResponse.ok) {
      throw new Error(csrfPayload?.error?.code ?? 'HTTP_' + csrfResponse.status);
    }
    const token = csrfPayload?.csrfToken;
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new Error('CSRF_TOKEN_INVALID');
    }

    // Re-verify /api/v1/auth/me after /api/v1/auth/csrf (UI spec §2 step 2 & BOOK-28)
    const meResponse = await fetch('/api/v1/auth/me', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    const mePayload = await meResponse.json().catch(() => ({}));
    if (!meResponse.ok) {
      throw new Error(mePayload?.error?.code ?? 'HTTP_' + meResponse.status);
    }
    const returnedBinding = meResponse.headers.get('X-NutTiew-Session-Binding');
    const returnedUser = mePayload?.user as { id?: string; role?: string } | undefined;
    if (
      !returnedBinding ||
      returnedBinding !== expectedBinding ||
      !returnedUser ||
      returnedUser.role !== 'Customer' ||
      returnedUser.id !== expectedAccountId
    ) {
      throw new Error('SESSION_BINDING_MISMATCH');
    }
    return token;
  } finally {
    window.clearTimeout(timeout);
    externalSignal.removeEventListener('abort', stop);
  }
}

async function submitCustomerBooking(
  externalSignal: AbortSignal,
  slotId: string,
  csrfToken: string,
  expectedBinding: string,
): Promise<BookingPostResponse> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (externalSignal.aborted) stop();
  else externalSignal.addEventListener('abort', stop, { once: true });
  const timeout = window.setTimeout(stop, 10_000);
  try {
    const response = await fetch('/api/v1/customer/bookings', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        'X-NutTiew-Expected-Session-Binding': expectedBinding,
      },
      body: JSON.stringify({ slotId }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.code ?? 'HTTP_' + response.status);
    }
    if (
      (response.status !== 200 && response.status !== 201) ||
      !isValidBookingDto(payload?.data) ||
      typeof payload?.meta?.requestId !== 'string'
    ) {
      throw new Error('BOOKING_OUTCOME_UNKNOWN');
    }
    return {
      httpStatus: response.status as 200 | 201,
      data: payload.data,
      requestId: payload.meta.requestId,
    };
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
      error.message === 'SESSION_MISMATCH' ||
      error.message === 'SESSION_BINDING_MISMATCH' ||
      error.message === 'CSRF_DENIED' ||
      error.message === 'ORIGIN_DENIED')
  );
}

function isUnknownCommitError(error: unknown): boolean {
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error.name === 'AbortError' || error.name === 'TypeError')
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    (error.message === 'BOOKING_OUTCOME_UNKNOWN' ||
      error.message === 'HTTP_502' ||
      error.message === 'HTTP_504')
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
  onClearLogoutError,
  onUnauthorized,
}: {
  accountId: string;
  sessionBinding: string;
  onLogout: () => void | Promise<void>;
  logoutBusy: boolean;
  logoutError: string;
  onClearLogoutError?: () => void;
  onUnauthorized: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [offers, setOffers] = useState<CustomerAvailabilityOffer[]>([]);
  const [evaluatedAt, setEvaluatedAt] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedOfferSnapshot, setSelectedOfferSnapshot] =
    useState<CustomerAvailabilityOffer | null>(null);
  const [staleNotice, setStaleNotice] = useState('');
  const [hasConfirmedResponse, setHasConfirmedResponse] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [csrfLoading, setCsrfLoading] = useState(true);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingBanner, setBookingBanner] = useState<BookingBannerState | null>(null);
  const [unknownOutcome, setUnknownOutcome] = useState<UnknownBookingOutcome | null>(null);

  const version = useRef(0);
  const sessionEpoch = useRef(0);
  const pendingGet = useRef<AbortController | null>(null);
  const pendingPost = useRef<AbortController | null>(null);
  const selectedRef = useRef<string | null>(null);
  const unknownOutcomeRef = useRef<UnknownBookingOutcome | null>(null);
  const submittingRef = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const shortId = accountId.replaceAll('-', '').slice(-8);

  const selectOffer = (slotId: string | null) => {
    if (submittingRef.current) return;
    // UI spec §4: While outcome is unknown, do not offer a different Slot as a replacement
    // for the unresolved intent. First retry/reconcile the original request.
    if (unknownOutcomeRef.current && slotId !== unknownOutcomeRef.current.slotId) {
      return;
    }
    selectedRef.current = slotId;
    setSelectedSlotId(slotId);
    const matched = slotId !== null ? offers.find(item => item.slotId === slotId) ?? null : null;
    setSelectedOfferSnapshot(matched);
    setStaleNotice('');
    setBookingBanner(null);
  };

  const clearProtectedState = () => {
    sessionEpoch.current++;
    setOffers([]);
    setEvaluatedAt(null);
    selectedRef.current = null;
    setSelectedSlotId(null);
    setSelectedOfferSnapshot(null);
    setStaleNotice('');
    setHasConfirmedResponse(false);
    setCsrfToken(null);
    setBookingBanner(null);
    unknownOutcomeRef.current = null;
    setUnknownOutcome(null);
    submittingRef.current = false;
    setSubmittingBooking(false);
  };

  const refresh = async (showLoading = false, preserveBanner = false) => {
    const current = ++version.current;
    pendingGet.current?.abort();
    const controller = new AbortController();
    pendingGet.current = controller;
    if (showLoading) setLoading(true);
    try {
      const [result, verifiedCsrf] = await Promise.all([
        fetchAvailability(controller.signal, sessionBinding),
        csrfToken
          ? Promise.resolve(csrfToken)
          : bootstrapVerifiedCsrfToken(controller.signal, accountId, sessionBinding),
      ]);
      if (version.current === current) {
        setCsrfToken(verifiedCsrf);
        setCsrfLoading(false);
        const previousSelected = selectedRef.current;
        const matchedOffer =
          previousSelected !== null
            ? result.data.find(item => item.slotId === previousSelected) ?? null
            : null;
        if (
          previousSelected !== null &&
          !matchedOffer &&
          !unknownOutcomeRef.current &&
          !preserveBanner
        ) {
          selectedRef.current = null;
          setSelectedSlotId(null);
          setSelectedOfferSnapshot(null);
          setStaleNotice(
            'ช่วงเวลาที่เลือกไว้ก่อนหน้านี้ไม่ว่างหรือเกินเวลาปิดรับแล้ว กรุณาเลือกช่วงเวลาใหม่จากรายการล่าสุด',
          );
        } else {
          if (matchedOffer) setSelectedOfferSnapshot(matchedOffer);
          if (!preserveBanner) setStaleNotice('');
        }
        setOffers(result.data);
        setEvaluatedAt(result.meta.evaluatedAt);
        setHasConfirmedResponse(true);
        setListError('');
        onClearLogoutError?.();
      }
    } catch (error) {
      if (version.current === current) {
        setCsrfLoading(false);
        if (isAccessDeniedOrExpired(error)) {
          clearProtectedState();
          onUnauthorized();
        } else if (!controller.signal.aborted) {
          setOffers([]);
          setEvaluatedAt(null);
          setHasConfirmedResponse(false);
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
      sessionEpoch.current++;
      pendingGet.current?.abort();
      pendingPost.current?.abort();
    };
    // Component is keyed by sessionBinding in main.tsx; remounts on session change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    version.current++;
    sessionEpoch.current++;
    pendingGet.current?.abort();
    pendingPost.current?.abort();
    clearProtectedState();
    void onLogout();
  };

  const confirmSelectedBooking = async (targetOffer: {
    slotId: string;
    tutorRef: string;
    startsAt: string;
    endsAt: string;
  }) => {
    if (submittingRef.current || logoutBusy) return;
    submittingRef.current = true;
    setSubmittingBooking(true);
    setStaleNotice('');
    setBookingBanner(null);

    const capturedEpoch = sessionEpoch.current;
    const capturedBinding = sessionBinding;
    const capturedSlotId = targetOffer.slotId;

    const controller = new AbortController();
    pendingPost.current = controller;

    try {
      let activeCsrf = csrfToken;
      if (!activeCsrf) {
        setCsrfLoading(true);
        activeCsrf = await bootstrapVerifiedCsrfToken(
          controller.signal,
          accountId,
          capturedBinding,
        );
        if (
          controller.signal.aborted ||
          sessionEpoch.current !== capturedEpoch ||
          sessionBinding !== capturedBinding
        ) {
          return;
        }
        setCsrfToken(activeCsrf);
        setCsrfLoading(false);
      }

      const result = await submitCustomerBooking(
        controller.signal,
        capturedSlotId,
        activeCsrf,
        capturedBinding,
      );

      // UI spec §2 step 6: Apply response only if captured auth/session epoch, binding and slotId still match
      if (
        controller.signal.aborted ||
        sessionEpoch.current !== capturedEpoch ||
        sessionBinding !== capturedBinding ||
        selectedRef.current !== capturedSlotId
      ) {
        return;
      }

      unknownOutcomeRef.current = null;
      setUnknownOutcome(null);
      selectedRef.current = null;
      setSelectedSlotId(null);
      setSelectedOfferSnapshot(null);
      setBookingBanner({
        kind: result.httpStatus === 201 ? 'confirmed-new' : 'confirmed-replay',
        booking: result.data,
        tutorRef: targetOffer.tutorRef,
      });
      await refresh(false, true);
    } catch (error) {
      if (
        controller.signal.aborted ||
        sessionEpoch.current !== capturedEpoch ||
        sessionBinding !== capturedBinding
      ) {
        return;
      }

      if (isAccessDeniedOrExpired(error)) {
        clearProtectedState();
        onUnauthorized();
        return;
      }

      if (isUnknownCommitError(error)) {
        const pendingUnknown: UnknownBookingOutcome = {
          slotId: capturedSlotId,
          tutorRef: targetOffer.tutorRef,
          startsAt: targetOffer.startsAt,
          endsAt: targetOffer.endsAt,
        };
        unknownOutcomeRef.current = pendingUnknown;
        setUnknownOutcome(pendingUnknown);
        selectedRef.current = capturedSlotId;
        setSelectedSlotId(capturedSlotId);
        return;
      }

      const code = error instanceof Error ? error.message : '';
      if (code === 'SLOT_UNAVAILABLE' || code === 'SLOT_NOT_FOUND' || code === 'HTTP_404') {
        unknownOutcomeRef.current = null;
        setUnknownOutcome(null);
        selectedRef.current = null;
        setSelectedSlotId(null);
        setSelectedOfferSnapshot(null);
        setBookingBanner({
          kind: 'conflict',
          message: 'ช่วงเวลาที่เลือกไม่ว่างแล้ว กรุณาเลือกช่วงเวลาอื่นจากรายการล่าสุด',
        });
        await refresh(false, true);
      } else if (code === 'CUSTOMER_OVERLAP') {
        unknownOutcomeRef.current = null;
        setUnknownOutcome(null);
        selectedRef.current = null;
        setSelectedSlotId(null);
        setSelectedOfferSnapshot(null);
        setBookingBanner({
          kind: 'conflict',
          message: 'คุณมีการจองอื่นในช่วงเวลาเดียวกันหรือซ้อนทับกันอยู่แล้ว กรุณาเลือกช่วงเวลาอื่น',
        });
        await refresh(false, true);
      } else if (code === 'BOOKING_NOT_ELIGIBLE' || code === 'HTTP_422') {
        unknownOutcomeRef.current = null;
        setUnknownOutcome(null);
        selectedRef.current = null;
        setSelectedSlotId(null);
        setSelectedOfferSnapshot(null);
        setBookingBanner({
          kind: 'not-eligible',
          message: 'ช่วงเวลานี้ใกล้เวลาเริ่มน้อยกว่า 60 นาที จึงไม่สามารถจองได้แล้ว',
        });
        await refresh(false, true);
      } else {
        // 503 SERVICE_UNAVAILABLE or TRANSACTION_RETRY_EXHAUSTED (known rollback / no commit)
        setBookingBanner({
          kind: 'service-unavailable',
          message: 'ระบบไม่สามารถดำเนินการจองได้ชั่วคราว กรุณาลองยืนยันการจองอีกครั้ง',
        });
      }
    } finally {
      if (sessionEpoch.current === capturedEpoch) {
        submittingRef.current = false;
        setSubmittingBooking(false);
        setCsrfLoading(false);
        pendingPost.current = null;
      }
    }
  };

  const activeOffer =
    unknownOutcome ??
    (selectedSlotId !== null
      ? (offers.find(item => item.slotId === selectedSlotId) ?? selectedOfferSnapshot)
      : null);
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
              disabled={loading || logoutBusy || submittingBooking}
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

          {bookingBanner && (bookingBanner.kind === 'confirmed-new' || bookingBanner.kind === 'confirmed-replay') && (
            <section
              id="booking-confirmed-banner"
              data-testid="booking-confirmed-banner"
              className="availability-surface booking-confirmed-surface"
              role="status"
              aria-live="polite"
            >
              <div className="selected-summary-copy">
                <h2>
                  {bookingBanner.kind === 'confirmed-new'
                    ? 'จองสำเร็จ'
                    : 'ยืนยันการจองเดิมแล้ว (มีรายการจองนี้อยู่แล้ว)'}
                </h2>
                <p className="selected-summary-details">
                  {bangkokLongDate(new Date(bookingBanner.booking.startsAt))} •{' '}
                  {bangkokClock(new Date(bookingBanner.booking.startsAt))}–
                  {bangkokClock(new Date(bookingBanner.booking.endsAt))} น. (Asia/Bangkok) • รหัสอ้างอิงติวเตอร์:{' '}
                  {bookingBanner.tutorRef}
                </p>
                <p className="booking-confirmed-meta">
                  รหัสการจอง: <strong data-testid="confirmed-booking-id">{bookingBanner.booking.id}</strong> • สถานะ:{' '}
                  <strong>{bookingBanner.booking.status}</strong>
                </p>
              </div>
            </section>
          )}

          {bookingBanner &&
            bookingBanner.kind !== 'confirmed-new' &&
            bookingBanner.kind !== 'confirmed-replay' && (
              <div
                id="booking-error-banner"
                data-testid="booking-error-banner"
                className="availability-surface availability-stale-notice"
                role="alert"
                aria-live="polite"
              >
                {bookingBanner.message}
              </div>
            )}

          {activeOffer && !loading && !listError && (
            <section
              id="selected-offer-summary"
              className="availability-surface selected-summary-surface"
              aria-labelledby="selected-offer-heading"
              role="status"
              aria-live="polite"
            >
              <div className="selected-summary-copy">
                <h2 id="selected-offer-heading">
                  {unknownOutcome ? 'รอการยืนยันผลการจองช่วงเวลาติว' : 'ยืนยันการจองช่วงเวลาติว — ช่วงเวลาที่เลือกไว้'}
                </h2>
                <p className="selected-summary-details">
                  {bangkokLongDate(new Date(activeOffer.startsAt))} •{' '}
                  {bangkokClock(new Date(activeOffer.startsAt))}–
                  {bangkokClock(new Date(activeOffer.endsAt))} น.
                  {bangkokDayKey(new Date(activeOffer.startsAt)) !==
                    bangkokDayKey(new Date(activeOffer.endsAt)) &&
                    ' (สิ้นสุดในวันถัดไป)'}{' '}
                  • รหัสอ้างอิงติวเตอร์: {activeOffer.tutorRef}
                </p>
                {unknownOutcome ? (
                  <p className="selection-not-booking-note" role="alert">
                    ยังไม่สามารถยืนยันผลการจองได้จากเซิร์ฟเวอร์ กรุณาส่งคำขอเดิมซ้ำเพื่อตรวจสอบหรือยืนยันรหัสการจองเดิมก่อนเลือกช่วงเวลาอื่น
                  </p>
                ) : (
                  <p className="selection-not-booking-note">
                    การเลือกช่วงเวลานี้ยังไม่ใช่การจอง และยังไม่ได้ล็อกสิทธิ์จนกว่าจะยืนยันการจองในขั้นตอนถัดไป
                  </p>
                )}
              </div>
              <div className="selected-summary-actions">
                {unknownOutcome ? (
                  <button
                    type="button"
                    className="confirm-booking-button"
                    disabled={submittingBooking || csrfLoading || logoutBusy}
                    onClick={() => void confirmSelectedBooking(activeOffer)}
                  >
                    {submittingBooking ? 'กำลังยืนยันการจอง…' : 'ส่งคำขอเดิมอีกครั้ง'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="confirm-booking-button"
                      disabled={submittingBooking || csrfLoading || logoutBusy}
                      onClick={() => void confirmSelectedBooking(activeOffer)}
                    >
                      {submittingBooking ? 'กำลังยืนยันการจอง…' : 'ยืนยันการจอง'}
                    </button>
                    <button
                      type="button"
                      className="clear-selection-button"
                      disabled={submittingBooking}
                      onClick={() => selectOffer(null)}
                    >
                      ยกเลิกการเลือก
                    </button>
                  </>
                )}
              </div>
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
              ) : logoutBusy || logoutError ? (
                <div className="availability-surface availability-uncertain" role="status">
                  <p className="availability-uncertain-copy">
                    {logoutBusy
                      ? 'กำลังออกจากระบบ…'
                      : 'ยังไม่สามารถยืนยันการออกจากระบบได้ ข้อมูลช่วงเวลาถูกซ่อนไว้เพื่อความปลอดภัย'}
                  </p>
                  {logoutError && (
                    <button
                      type="button"
                      className="retry-button"
                      onClick={() => void refresh(true)}
                    >
                      ตรวจสอบเซสชันอีกครั้ง
                    </button>
                  )}
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
                        const lockedToOtherUnknown =
                          unknownOutcome !== null && unknownOutcome.slotId !== offer.slotId;
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
                              disabled={submittingBooking || lockedToOtherUnknown}
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
