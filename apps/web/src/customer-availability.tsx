import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { bangkokClock, bangkokDayKey, bangkokLongDate } from './tutor-calendar.js';
import {
  DEFAULT_VISIBLE_TIME_GROUPS,
  WEEKDAY_LABELS_MON_FIRST,
  bangkokLongDateFromDayKey,
  buildAvailabilityCalendarIndex,
  buildMonthGrid,
  computeOfferDurationMinutes,
  formatBangkokMonthYear,
  groupDayOffersByExactInterval,
  monthKeyFromDayKey,
  shiftMonthKey,
  sliceVisibleTimeGroups,
  type CustomerAvailabilityOffer,
} from './customer-availability-calendar.js';
import './tutor-dashboard.css';
import './customer-availability.css';

export type { CustomerAvailabilityOffer };

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


export type CustomerBookingItem = {
  id: string;
  slotId: string;
  tutorId: string;
  tutorRef: string;
  startsAt: string;
  endsAt: string;
  status: 'Booked' | 'Cancelled';
  displayStatus: 'Booked' | 'Past' | 'Cancelled';
  cancellationActor: 'Customer' | 'Tutor' | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  hasRescheduled?: boolean;
  createdAt: string;
};

export type CustomerBookingDetail = CustomerBookingItem & {
  updatedAt: string;
};

export type CustomerNotificationItem = {
  id: string;
  kind: 'TutorCancelled';
  createdAt: string;
  readAt: string | null;
  reason: string;
  booking: {
    id: string;
    slotId: string;
    tutorRef: string;
    startsAt: string;
    endsAt: string;
    status: 'Cancelled';
    cancelledAt: string;
  };
};

type UnknownBookingOutcome = {
  slotId: string;
  tutorRef: string;
  startsAt: string;
  endsAt: string;
};

type IconKind = 'calendar' | 'user' | 'logout' | 'menu' | 'clock' | 'bell';
function Icon({ kind }: { kind: IconKind }) {
  const paths: Record<IconKind, ReactNode> = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M13 14h3M7 18h3"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.4-4 3-6 7.5-6s7.1 2 7.5 6"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></>,
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
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

async function fetchRescheduleOptions(
  externalSignal: AbortSignal,
  bookingId: string,
  expectedBinding: string,
): Promise<AvailabilityResponse> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (externalSignal.aborted) stop();
  else externalSignal.addEventListener('abort', stop, { once: true });
  const timeout = window.setTimeout(stop, 10_000);
  try {
    const response = await fetch(
      '/api/v1/customer/bookings/' + encodeURIComponent(bookingId) + '/reschedule/options',
      {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      },
    );
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
      error.message === 'ORIGIN_DENIED')
  );
}

function isSessionBindingOrCsrfMismatch(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === 'SESSION_BINDING_MISMATCH' || error.message === 'CSRF_DENIED')
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

function bookingLabel(status: CustomerBookingItem['displayStatus']) {
  return status === 'Cancelled' ? 'ยกเลิกแล้ว' : status === 'Past' ? 'สิ้นสุดแล้ว' : 'ยืนยันแล้ว';
}

function CancellationDialog({ booking, busy, feedback, uncertain, enabled, close, confirm, check }: {
  booking: CustomerBookingItem; busy: boolean; feedback: string; uncertain: boolean; enabled: boolean;
  close: () => void; confirm: () => void; check: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    heading.current?.focus();
    return () => { node?.close(); };
  }, []);
  useEffect(() => { if (busy) heading.current?.focus(); }, [busy]);
  return (
    <dialog ref={dialog} className="customer-modal cancellation-dialog" aria-modal="true"
      aria-labelledby="cancel-heading" aria-describedby="cancel-summary cancel-rule cancel-feedback"
      aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
      <div className="modal-header"><h2 ref={heading} id="cancel-heading" tabIndex={-1}>ยกเลิกการจอง</h2></div>
      <p id="cancel-summary"><strong>{booking.tutorRef}</strong><br />
        {bangkokLongDate(new Date(booking.startsAt))}, {bangkokClock(new Date(booking.startsAt))} – {bangkokClock(new Date(booking.endsAt))} น. (Asia/Bangkok)</p>
      <p id="cancel-rule">ยกเลิกได้ก่อนเวลาเริ่มอย่างน้อย 30 นาที และย้อนกลับไม่ได้</p>
      <p id="cancel-feedback" role="status">{busy ? 'กำลังดำเนินการ…' : feedback}</p>
      <div className="modal-actions cancellation-actions">
        <button type="button" className="view-detail-btn" disabled={busy} onClick={close}>ปิด</button>
        {uncertain ? <button type="button" className="modal-close-btn" disabled={busy} onClick={check}>ตรวจสอบสถานะการจอง</button> :
          <button type="button" className="modal-close-btn" disabled={busy || !enabled} onClick={confirm}>ยืนยันการยกเลิก</button>}
      </div>
    </dialog>
  );
}

function RescheduleDialog({
  booking,
  offers,
  offersLoading,
  offersError,
  selectedSlotId,
  onSelectSlot,
  onReloadOffers,
  busy,
  feedback,
  uncertain,
  enabled,
  close,
  confirm,
  check,
}: {
  booking: CustomerBookingItem;
  offers: CustomerAvailabilityOffer[];
  offersLoading: boolean;
  offersError: string;
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  onReloadOffers: () => void;
  busy: boolean;
  feedback: string;
  uncertain: boolean;
  enabled: boolean;
  close: () => void;
  confirm: () => void;
  check: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    heading.current?.focus();
    return () => { node?.close(); };
  }, []);
  useEffect(() => { if (busy) heading.current?.focus(); }, [busy]);
  const selectedOffer = offers.find(o => o.slotId === selectedSlotId) ?? null;

  return (
    <dialog
      ref={dialog}
      className="customer-modal reschedule-dialog"
      aria-modal="true"
      aria-labelledby="reschedule-heading"
      aria-describedby="reschedule-rule reschedule-feedback"
      aria-busy={busy}
      onCancel={event => { event.preventDefault(); if (!busy) close(); }}
    >
      <div className="modal-header">
        <h2 ref={heading} id="reschedule-heading" tabIndex={-1}>เลื่อนนัด</h2>
      </div>
      <p id="reschedule-rule" className="reschedule-rule-note">
        เลื่อนนัดได้เพียง 1 ครั้งเท่านั้น • ทั้งเวลาเดิมและเวลาใหม่ต้องเหลืออย่างน้อย 60 นาทีก่อนเริ่มติว (Asia/Bangkok)
      </p>

      <div className="reschedule-comparison">
        <div className="reschedule-box">
          <span className="reschedule-box-label">นัดหมายเดิม</span>
          <strong>{booking.tutorRef}</strong>
          <span>
            {bangkokLongDate(new Date(booking.startsAt))}, {bangkokClock(new Date(booking.startsAt))} – {bangkokClock(new Date(booking.endsAt))} น. (Asia/Bangkok)
          </span>
        </div>
        <div className="reschedule-box">
          <span className="reschedule-box-label">ช่วงเวลาใหม่ที่เลือก</span>
          {selectedOffer ? (
            <>
              <strong>{selectedOffer.tutorRef}</strong>
              <span>
                {bangkokLongDate(new Date(selectedOffer.startsAt))}, {bangkokClock(new Date(selectedOffer.startsAt))} – {bangkokClock(new Date(selectedOffer.endsAt))} น. (Asia/Bangkok)
              </span>
            </>
          ) : (
            <span className="reschedule-placeholder">ยังไม่ได้เลือกช่วงเวลาใหม่</span>
          )}
        </div>
      </div>

      {!uncertain && (
        <div className="reschedule-offers-section">
          <div className="reschedule-offers-header">
            <span>เลือกช่วงเวลาใหม่ (รวมทุกผู้สอนที่เปิดสอน)</span>
            <button type="button" className="view-detail-btn" disabled={busy || offersLoading} onClick={onReloadOffers}>
              รีเฟรชตัวเลือก
            </button>
          </div>
          {offersLoading ? (
            <p role="status">กำลังโหลดช่วงเวลาที่เปิดรับจอง...</p>
          ) : offersError ? (
            <p role="alert">{offersError}</p>
          ) : offers.length === 0 ? (
            <p>ยังไม่มีช่วงเวลาอื่นที่เปิดรับจองในขณะนี้</p>
          ) : (
            <ul className="reschedule-offer-list" role="radiogroup" aria-label="ช่วงเวลาใหม่สำหรับเลื่อนนัด">
              {offers.map(offer => {
                const isSelected = offer.slotId === selectedSlotId;
                const label = `${bangkokLongDate(new Date(offer.startsAt))} ${bangkokClock(new Date(offer.startsAt))} – ${bangkokClock(new Date(offer.endsAt))} น. (Asia/Bangkok) • ${offer.tutorRef}`;
                return (
                  <li key={offer.slotId}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={label}
                      data-testid="reschedule-offer-option"
                      data-slot-id={offer.slotId}
                      className={`reschedule-offer-btn${isSelected ? ' is-selected' : ''}`}
                      disabled={busy}
                      onClick={() => onSelectSlot(offer.slotId)}
                    >
                      <span>{bangkokLongDate(new Date(offer.startsAt))}, {bangkokClock(new Date(offer.startsAt))} – {bangkokClock(new Date(offer.endsAt))} น. (Asia/Bangkok)</span>
                      <strong>{offer.tutorRef}</strong>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <p id="reschedule-feedback" role="status">{busy ? 'กำลังดำเนินการ…' : feedback}</p>
      <div className="modal-actions cancellation-actions">
        <button type="button" className="view-detail-btn" disabled={busy} onClick={close}>ปิด</button>
        {uncertain ? (
          <button type="button" className="modal-close-btn" disabled={busy} onClick={check}>ตรวจสอบสถานะการจอง</button>
        ) : (
          <button
            type="button"
            className="modal-close-btn"
            data-testid="confirm-reschedule-btn"
            disabled={busy || !enabled || !selectedSlotId}
            onClick={confirm}
          >
            ยืนยันการเลื่อนนัด
          </button>
        )}
      </div>
    </dialog>
  );
}

export function CustomerAvailability({
  accountId,
  sessionBinding,
  onLogout,
  logoutBusy,
  logoutError,
  onClearLogoutError,
  onUnauthorized,
  onSessionBindingChanged,
}: {
  accountId: string;
  sessionBinding: string;
  onLogout: () => void | Promise<void>;
  logoutBusy: boolean;
  logoutError: string;
  onClearLogoutError?: () => void;
  onUnauthorized: () => void;
  onSessionBindingChanged?: () => void | Promise<void>;
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
  const [csrfError, setCsrfError] = useState('');
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [activeTab, setActiveTab] = useState<'availability' | 'bookings' | 'notifications' | 'account'>('availability');
  const [myBookings, setMyBookings] = useState<CustomerBookingItem[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingsError, setBookingsError] = useState('');
  const [myNotifications, setMyNotifications] = useState<CustomerNotificationItem[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [selectedNotification, setSelectedNotification] = useState<CustomerNotificationItem | null>(null);
  const [loadingNotificationDetail, setLoadingNotificationDetail] = useState(false);
  const [notificationDetailError, setNotificationDetailError] = useState('');
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [notificationStatusMessage, setNotificationStatusMessage] = useState('');
  const [selectedBookingDetail, setSelectedBookingDetail] = useState<CustomerBookingDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [cancelTarget, setCancelTarget] = useState<CustomerBookingItem | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState('');
  const [cancelNotice, setCancelNotice] = useState('');
  const [uncertain, setUncertain] = useState<ReadonlySet<string>>(new Set());
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const cancelRequest = useRef<AbortController | null>(null);
  const cancelInvoker = useRef<HTMLButtonElement | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<CustomerBookingItem | null>(null);
  const [rescheduleSlotId, setRescheduleSlotId] = useState<string | null>(null);
  const [rescheduleOffers, setRescheduleOffers] = useState<CustomerAvailabilityOffer[]>([]);
  const [rescheduleOffersLoading, setRescheduleOffersLoading] = useState(false);
  const [rescheduleOffersError, setRescheduleOffersError] = useState('');
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleFeedback, setRescheduleFeedback] = useState('');
  const [rescheduleNotice, setRescheduleNotice] = useState('');
  const [rescheduleUsedIds, setRescheduleUsedIds] = useState<ReadonlySet<string>>(new Set());
  const [rescheduleUncertain, setRescheduleUncertain] = useState<ReadonlySet<string>>(new Set());
  const rescheduleRequest = useRef<AbortController | null>(null);
  const rescheduleOffersVersion = useRef(0);
  const pendingRescheduleOffers = useRef<AbortController | null>(null);
  const rescheduleInvoker = useRef<HTMLButtonElement | null>(null);
  const [bookingBanner, setBookingBanner] = useState<BookingBannerState | null>(null);
  const [unknownOutcome, setUnknownOutcome] = useState<UnknownBookingOutcome | null>(null);
  const [viewedMonthKey, setViewedMonthKey] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [expandedTimeKeys, setExpandedTimeKeys] = useState<Record<string, boolean>>({});
  const [showAllTimeGroups, setShowAllTimeGroups] = useState(false);
  const [calendarLiveMessage, setCalendarLiveMessage] = useState('');

  const version = useRef(0);
  const csrfVersion = useRef(0);
  const sessionEpoch = useRef(0);
  const bookingsVersion = useRef(0);
  const detailVersion = useRef(0);
  const notificationsVersion = useRef(0);
  const notificationDetailVersion = useRef(0);
  const pendingGet = useRef<AbortController | null>(null);
  const pendingCsrf = useRef<AbortController | null>(null);
  const pendingPost = useRef<AbortController | null>(null);
  const pendingBookingsGet = useRef<AbortController | null>(null);
  const pendingDetailGet = useRef<AbortController | null>(null);
  const pendingNotificationsGet = useRef<AbortController | null>(null);
  const pendingNotificationDetailGet = useRef<AbortController | null>(null);
  const markReadRequest = useRef<AbortController | null>(null);
  const selectedRef = useRef<string | null>(null);
  const unknownOutcomeRef = useRef<UnknownBookingOutcome | null>(null);
  const selectedDayRef = useRef<string | null>(null);
  const viewedMonthRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const pendingFocusGroupKeyRef = useRef<string | null>(null);
  const timeGroupToggleRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const accountHeadingRef = useRef<HTMLHeadingElement>(null);
  const availabilityHeadingRef = useRef<HTMLHeadingElement>(null);
  const bookingsHeadingRef = useRef<HTMLHeadingElement>(null);
  const notificationsHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingTabFocusRef = useRef<'availability' | 'bookings' | 'notifications' | 'account' | null>(null);

  const navigateTab = (tab: 'availability' | 'bookings' | 'notifications' | 'account') => {
    pendingTabFocusRef.current = tab;
    setActiveTab(tab);
    setMenuOpen(false);
  };

  useEffect(() => {
    const target = pendingTabFocusRef.current;
    if (!target || target !== activeTab) return;
    pendingTabFocusRef.current = null;
    if (target === 'account') accountHeadingRef.current?.focus();
    else if (target === 'bookings') bookingsHeadingRef.current?.focus();
    else if (target === 'notifications') notificationsHeadingRef.current?.focus();
    else availabilityHeadingRef.current?.focus();
  }, [activeTab]);

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
    version.current++;
    pendingGet.current?.abort();
    pendingPost.current?.abort();
    cancelRequest.current?.abort();
    cancelRequest.current = null;
    setCancelTarget(null);
    setCancelBusy(false);
    setCancelFeedback('');
    setCancelNotice('');
    setUncertain(new Set());
    setClosed(new Set());
    rescheduleRequest.current?.abort();
    rescheduleRequest.current = null;
    rescheduleOffersVersion.current++;
    pendingRescheduleOffers.current?.abort();
    pendingRescheduleOffers.current = null;
    setRescheduleTarget(null);
    setRescheduleSlotId(null);
    setRescheduleOffers([]);
    setRescheduleOffersLoading(false);
    setRescheduleOffersError('');
    setRescheduleBusy(false);
    setRescheduleFeedback('');
    setRescheduleNotice('');
    setRescheduleUsedIds(new Set());
    setRescheduleUncertain(new Set());
    pendingFocusGroupKeyRef.current = null;
    sessionEpoch.current++;
    csrfVersion.current++;
    bookingsVersion.current++;
    detailVersion.current++;
    notificationsVersion.current++;
    notificationDetailVersion.current++;
    pendingCsrf.current?.abort();
    pendingBookingsGet.current?.abort();
    pendingDetailGet.current?.abort();
    pendingNotificationsGet.current?.abort();
    pendingNotificationDetailGet.current?.abort();
    markReadRequest.current?.abort();
    markReadRequest.current = null;
    setMyNotifications([]);
    setLoadingNotifications(false);
    setNotificationsError('');
    setSelectedNotification(null);
    setLoadingNotificationDetail(false);
    setNotificationDetailError('');
    setMarkingReadId(null);
    setNotificationStatusMessage('');
    setOffers([]);
    setEvaluatedAt(null);
    selectedRef.current = null;
    setSelectedSlotId(null);
    setSelectedOfferSnapshot(null);
    selectedDayRef.current = null;
    setSelectedDayKey(null);
    viewedMonthRef.current = null;
    setViewedMonthKey(null);
    setExpandedTimeKeys({});
    setShowAllTimeGroups(false);
    setCalendarLiveMessage('');
    setStaleNotice('');
    setHasConfirmedResponse(false);
    setCsrfToken(null);
    setCsrfLoading(false);
    setCsrfError('');
    setBookingBanner(null);
    unknownOutcomeRef.current = null;
    setUnknownOutcome(null);
    submittingRef.current = false;
    setSubmittingBooking(false);
    setMyBookings([]);
    setSelectedBookingDetail(null);
    setLoadingDetail(false);
    setDetailError('');
    setBookingsError('');
    setLoadingBookings(false);
  };

  const handleSessionBindingChanged = () => {
    version.current++;
    csrfVersion.current++;
    bookingsVersion.current++;
    detailVersion.current++;
    rescheduleOffersVersion.current++;
    sessionEpoch.current++;
    pendingGet.current?.abort();
    pendingCsrf.current?.abort();
    pendingPost.current?.abort();
    pendingBookingsGet.current?.abort();
    pendingDetailGet.current?.abort();
    pendingRescheduleOffers.current?.abort();
    clearProtectedState();
    if (onSessionBindingChanged) {
      void onSessionBindingChanged();
    } else {
      onUnauthorized();
    }
  };

  const loadCsrfBootstrap = async () => {
    const currentCsrf = ++csrfVersion.current;
    const capturedEpoch = sessionEpoch.current;
    const capturedBinding = sessionBinding;
    pendingCsrf.current?.abort();
    const controller = new AbortController();
    pendingCsrf.current = controller;
    setCsrfLoading(true);
    setCsrfError('');
    try {
      const verifiedToken = await bootstrapVerifiedCsrfToken(
        controller.signal,
        accountId,
        capturedBinding,
      );
      if (
        csrfVersion.current === currentCsrf &&
        sessionEpoch.current === capturedEpoch &&
        sessionBinding === capturedBinding
      ) {
        setCsrfToken(verifiedToken);
        setCsrfError('');
      }
    } catch (error) {
      if (
        csrfVersion.current === currentCsrf &&
        sessionEpoch.current === capturedEpoch &&
        sessionBinding === capturedBinding
      ) {
        setCsrfToken(null);
        if (isSessionBindingOrCsrfMismatch(error)) {
          handleSessionBindingChanged();
        } else if (isAccessDeniedOrExpired(error)) {
          clearProtectedState();
          onUnauthorized();
        } else if (!controller.signal.aborted) {
          setCsrfError('ยังไม่สามารถเตรียมโทเค็นความปลอดภัยสำหรับการจองได้ กรุณาลองโหลดโทเค็นอีกครั้งก่อนยืนยันการจอง');
        }
      }
    } finally {
      if (
        csrfVersion.current === currentCsrf &&
        sessionEpoch.current === capturedEpoch &&
        sessionBinding === capturedBinding
      ) {
        setCsrfLoading(false);
        pendingCsrf.current = null;
      }
    }
  };

  const refresh = async (showLoading = false, preserveBanner = false) => {
    const current = ++version.current;
    pendingGet.current?.abort();
    const controller = new AbortController();
    pendingGet.current = controller;
    if (showLoading) setLoading(true);
    if (!csrfToken) {
      void loadCsrfBootstrap();
    }
    try {
      const result = await fetchAvailability(controller.signal, sessionBinding);
      if (version.current === current) {
        const previousSelected = selectedRef.current;
        const matchedOffer =
          previousSelected !== null
            ? result.data.find(item => item.slotId === previousSelected) ?? null
            : null;
        if (
          previousSelected !== null &&
          !matchedOffer &&
          !unknownOutcomeRef.current
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
        const nextIndex = buildAvailabilityCalendarIndex(result.data, result.meta.evaluatedAt);
        if (result.data.length === 0) {
          selectedDayRef.current = null;
          setSelectedDayKey(null);
          viewedMonthRef.current = null;
          setViewedMonthKey(null);
          pendingFocusGroupKeyRef.current = null;
          setExpandedTimeKeys({});
          setShowAllTimeGroups(false);
          setCalendarLiveMessage('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก');
        } else {
          const initialDay = nextIndex.earliestDayKey!;
          const initialMonth = nextIndex.earliestMonthKey!;
          const activeDay = selectedDayRef.current;
          const activeDayMonth = activeDay ? monthKeyFromDayKey(activeDay) : null;
          const activeDayOutsideHorizon =
            activeDayMonth !== null &&
            ((nextIndex.minMonthKey !== null && activeDayMonth < nextIndex.minMonthKey) ||
              (nextIndex.maxMonthKey !== null && activeDayMonth > nextIndex.maxMonthKey));
          if (activeDay === null || activeDayOutsideHorizon) {
            selectedDayRef.current = initialDay;
            setSelectedDayKey(initialDay);
            viewedMonthRef.current = initialMonth;
            setViewedMonthKey(initialMonth);
            pendingFocusGroupKeyRef.current = null;
            setExpandedTimeKeys({});
            setShowAllTimeGroups(false);
            const initialCount = nextIndex.offersByDay.get(initialDay)?.length ?? 0;
            setCalendarLiveMessage(
              `เลือกวันที่ ${bangkokLongDateFromDayKey(initialDay)} พบ ${initialCount} ช่วงเวลา`,
            );
          } else {
            const activeMonth =
              viewedMonthRef.current &&
              (!nextIndex.minMonthKey || viewedMonthRef.current >= nextIndex.minMonthKey) &&
              (!nextIndex.maxMonthKey || viewedMonthRef.current <= nextIndex.maxMonthKey)
                ? viewedMonthRef.current
                : initialMonth;
            viewedMonthRef.current = activeMonth;
            setViewedMonthKey(activeMonth);
            if (monthKeyFromDayKey(activeDay) === activeMonth) {
              const updatedCount = nextIndex.offersByDay.get(activeDay)?.length ?? 0;
              setCalendarLiveMessage(
                updatedCount > 0
                  ? `เลือกวันที่ ${bangkokLongDateFromDayKey(activeDay)} พบ ${updatedCount} ช่วงเวลา`
                  : `วันที่ ${bangkokLongDateFromDayKey(activeDay)} ไม่มีช่วงเวลาว่างแล้ว`,
              );
            } else {
              const mCount = nextIndex.monthOfferCount(activeMonth);
              setCalendarLiveMessage(
                mCount > 0
                  ? `แสดงปฏิทินเดือน ${formatBangkokMonthYear(activeMonth)} มี ${mCount} ช่วงเวลา`
                  : `เดือน ${formatBangkokMonthYear(activeMonth)} ยังไม่มีช่วงเวลาว่าง`,
              );
            }
          }
        }
        setOffers(result.data);
        setEvaluatedAt(result.meta.evaluatedAt);
        setHasConfirmedResponse(true);
        setListError('');
        onClearLogoutError?.();
      }
    } catch (error) {
      if (version.current === current) {
        if (isAccessDeniedOrExpired(error)) {
          clearProtectedState();
          onUnauthorized();
        } else if (!controller.signal.aborted) {
          setOffers([]);
          setEvaluatedAt(null);
          selectedDayRef.current = null;
          setSelectedDayKey(null);
          viewedMonthRef.current = null;
          setViewedMonthKey(null);
          pendingFocusGroupKeyRef.current = null;
          setExpandedTimeKeys({});
          setShowAllTimeGroups(false);
          setCalendarLiveMessage('');
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
      csrfVersion.current++;
      bookingsVersion.current++;
      detailVersion.current++;
      sessionEpoch.current++;
      pendingGet.current?.abort();
      pendingCsrf.current?.abort();
      pendingPost.current?.abort();
      cancelRequest.current?.abort();
      rescheduleRequest.current?.abort();
      rescheduleOffersVersion.current++;
      pendingRescheduleOffers.current?.abort();
      notificationsVersion.current++;
      notificationDetailVersion.current++;
      pendingNotificationsGet.current?.abort();
      pendingNotificationDetailGet.current?.abort();
      markReadRequest.current?.abort();
      pendingBookingsGet.current?.abort();
      pendingDetailGet.current?.abort();
    };
    // Component is keyed by sessionBinding in main.tsx; remounts on session change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMyBookings = async () => {
    if (logoutBusy || logoutError) return;
    const current = ++bookingsVersion.current;
    const capturedEpoch = sessionEpoch.current;
    const capturedBinding = sessionBinding;
    pendingBookingsGet.current?.abort();
    const controller = new AbortController();
    pendingBookingsGet.current = controller;
    setLoadingBookings(true);
    setBookingsError('');
    try {
      const res = await fetch('/api/v1/customer/bookings', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (
        bookingsVersion.current !== current ||
        sessionEpoch.current !== capturedEpoch ||
        sessionBinding !== capturedBinding ||
        controller.signal.aborted
      ) return;

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearProtectedState();
          onUnauthorized();
          return;
        }
        throw new Error('HTTP_' + res.status);
      }

      if (capturedBinding && res.headers.get('X-NutTiew-Session-Binding') !== capturedBinding) {
        handleSessionBindingChanged();
        return;
      }
      const body = await res.json();
      if (
        bookingsVersion.current === current &&
        sessionEpoch.current === capturedEpoch &&
        sessionBinding === capturedBinding &&
        !controller.signal.aborted
      ) {
        if (Array.isArray(body?.data)) {
          setMyBookings(body.data);
          setBookingsError('');
        } else {
          setBookingsError('ข้อมูลการจองไม่ถูกต้อง');
        }
      }
    } catch {
      if (
        bookingsVersion.current === current &&
        sessionEpoch.current === capturedEpoch &&
        sessionBinding === capturedBinding &&
        !controller.signal.aborted
      ) {
        setBookingsError('ไม่สามารถโหลดข้อมูลการจองได้ในขณะนี้');
      }
    } finally {
      if (bookingsVersion.current === current && sessionEpoch.current === capturedEpoch) {
        setLoadingBookings(false);
        pendingBookingsGet.current = null;
      }
    }
  };

  const openBookingDetail = async (bookingId: string) => {
    if (logoutBusy || logoutError) return;
    const current = ++detailVersion.current;
    const capturedEpoch = sessionEpoch.current;
    const capturedBinding = sessionBinding;
    pendingDetailGet.current?.abort();
    const controller = new AbortController();
    pendingDetailGet.current = controller;
    setLoadingDetail(true);
    setDetailError('');
    setSelectedBookingDetail(null);
    try {
      const res = await fetch('/api/v1/customer/bookings/' + bookingId, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (
        detailVersion.current !== current ||
        sessionEpoch.current !== capturedEpoch ||
        sessionBinding !== capturedBinding ||
        controller.signal.aborted
      ) return;

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearProtectedState();
          onUnauthorized();
          return;
        }
        if (res.status === 404) {
          setDetailError('BOOKING_NOT_FOUND');
          return;
        }
        throw new Error('HTTP_' + res.status);
      }

      if (capturedBinding && res.headers.get('X-NutTiew-Session-Binding') !== capturedBinding) {
        handleSessionBindingChanged();
        return;
      }
      const body = await res.json();
      if (
        detailVersion.current === current &&
        sessionEpoch.current === capturedEpoch &&
        sessionBinding === capturedBinding &&
        !controller.signal.aborted
      ) {
        if (body?.data?.id === bookingId && ['Booked', 'Cancelled'].includes(body.data.status)) {
          const latest = body.data as CustomerBookingDetail;
          setSelectedBookingDetail(latest);
          setMyBookings(rows => rows.map(row => row.id === bookingId ? { ...latest, hasRescheduled: row.hasRescheduled } : row));
          setDetailError('');
          return latest;
        } else {
          setDetailError('LOAD_FAILED');
        }
      }
    } catch {
      if (
        detailVersion.current === current &&
        sessionEpoch.current === capturedEpoch &&
        sessionBinding === capturedBinding &&
        !controller.signal.aborted
      ) {
        setDetailError('LOAD_FAILED');
      }
    } finally {
      if (detailVersion.current === current && sessionEpoch.current === capturedEpoch) {
        setLoadingDetail(false);
        pendingDetailGet.current = null;
      }
    }
  };

  const fetchMyNotifications = async () => {
    if (logoutBusy || logoutError) return;
    const current = ++notificationsVersion.current;
    const capturedEpoch = sessionEpoch.current;
    const capturedBinding = sessionBinding;
    pendingNotificationsGet.current?.abort();
    const controller = new AbortController();
    pendingNotificationsGet.current = controller;
    setLoadingNotifications(true);
    setNotificationsError('');
    try {
      const res = await fetch('/api/v1/customer/notifications', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (
        notificationsVersion.current !== current ||
        sessionEpoch.current !== capturedEpoch ||
        sessionBinding !== capturedBinding ||
        controller.signal.aborted
      ) return;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearProtectedState();
          onUnauthorized();
          return;
        }
        throw new Error('HTTP_' + res.status);
      }
      if (capturedBinding && res.headers.get('X-NutTiew-Session-Binding') !== capturedBinding) {
        handleSessionBindingChanged();
        return;
      }
      const body = await res.json();
      if (
        notificationsVersion.current === current &&
        sessionEpoch.current === capturedEpoch &&
        sessionBinding === capturedBinding &&
        !controller.signal.aborted
      ) {
        if (Array.isArray(body?.data)) {
          const items = body.data as CustomerNotificationItem[];
          setMyNotifications(items);
          setSelectedNotification(prev => (prev ? items.find(n => n.id === prev.id) ?? prev : null));
          setNotificationsError('');
        } else {
          setNotificationsError('ไม่สามารถโหลดรายการแจ้งเตือนได้ในขณะนี้');
        }
      }
    } catch {
      if (
        notificationsVersion.current === current &&
        sessionEpoch.current === capturedEpoch &&
        sessionBinding === capturedBinding &&
        !controller.signal.aborted
      ) {
        setNotificationsError('ไม่สามารถโหลดรายการแจ้งเตือนได้ในขณะนี้ กรุณาลองใหม่');
      }
    } finally {
      if (notificationsVersion.current === current && sessionEpoch.current === capturedEpoch) {
        setLoadingNotifications(false);
        pendingNotificationsGet.current = null;
      }
    }
  };

  const openNotificationDetail = async (notificationId: string) => {
    if (logoutBusy || logoutError) return;
    const current = ++notificationDetailVersion.current;
    const capturedEpoch = sessionEpoch.current;
    const capturedBinding = sessionBinding;
    pendingNotificationDetailGet.current?.abort();
    const controller = new AbortController();
    pendingNotificationDetailGet.current = controller;
    setLoadingNotificationDetail(true);
    setNotificationDetailError('');
    setNotificationStatusMessage('');
    try {
      const res = await fetch('/api/v1/customer/notifications/' + encodeURIComponent(notificationId), {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (
        notificationDetailVersion.current !== current ||
        sessionEpoch.current !== capturedEpoch ||
        sessionBinding !== capturedBinding ||
        controller.signal.aborted
      ) return;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearProtectedState();
          onUnauthorized();
          return;
        }
        if (res.status === 404) {
          setSelectedNotification(null);
          setNotificationDetailError('ไม่พบการแจ้งเตือนนี้');
          return;
        }
        throw new Error('HTTP_' + res.status);
      }
      if (capturedBinding && res.headers.get('X-NutTiew-Session-Binding') !== capturedBinding) {
        handleSessionBindingChanged();
        return;
      }
      const body = await res.json();
      if (
        notificationDetailVersion.current === current &&
        sessionEpoch.current === capturedEpoch &&
        sessionBinding === capturedBinding &&
        !controller.signal.aborted
      ) {
        if (body?.data?.id === notificationId && body.data.kind === 'TutorCancelled') {
          const latest = body.data as CustomerNotificationItem;
          setSelectedNotification(latest);
          setMyNotifications(rows => rows.map(r => (r.id === notificationId ? latest : r)));
          setNotificationDetailError('');
          if (!csrfToken && !csrfLoading) void loadCsrfBootstrap();
        } else {
          setNotificationDetailError('ไม่สามารถโหลดรายละเอียดการแจ้งเตือนได้ กรุณาลองใหม่');
        }
      }
    } catch {
      if (
        notificationDetailVersion.current === current &&
        sessionEpoch.current === capturedEpoch &&
        sessionBinding === capturedBinding &&
        !controller.signal.aborted
      ) {
        setNotificationDetailError('ไม่สามารถโหลดรายละเอียดการแจ้งเตือนได้ กรุณาลองใหม่');
      }
    } finally {
      if (notificationDetailVersion.current === current && sessionEpoch.current === capturedEpoch) {
        setLoadingNotificationDetail(false);
        pendingNotificationDetailGet.current = null;
      }
    }
  };

  const markNotificationRead = async (notificationId: string) => {
    if (logoutBusy || logoutError || markingReadId || markReadRequest.current) return;
    if (!csrfToken) {
      if (!csrfLoading) void loadCsrfBootstrap();
      setNotificationStatusMessage('กำลังเตรียมเซสชัน กรุณาลองอีกครั้ง');
      return;
    }
    const epoch = sessionEpoch.current;
    const capturedBinding = sessionBinding;
    const controller = new AbortController();
    markReadRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    setMarkingReadId(notificationId);
    setNotificationStatusMessage('');
    try {
      const res = await fetch('/api/v1/customer/notifications/' + encodeURIComponent(notificationId) + '/read', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'X-NutTiew-Expected-Session-Binding': capturedBinding,
        },
        body: '{}',
      });
      const body = await res.json().catch(() => null);
      if (sessionEpoch.current !== epoch || sessionBinding !== capturedBinding) return;
      const errCode = body?.error?.code;
      if (
        errCode === 'SESSION_BINDING_MISMATCH' ||
        errCode === 'CSRF_DENIED' ||
        (res.ok && res.headers.get('X-NutTiew-Session-Binding') !== capturedBinding)
      ) {
        handleSessionBindingChanged();
        return;
      }
      if (res.status === 401 || res.status === 403) {
        clearProtectedState();
        onUnauthorized();
        return;
      }
      if (res.status === 404) {
        setSelectedNotification(null);
        setNotificationDetailError('ไม่พบการแจ้งเตือนนี้');
        return;
      }
      if (res.status === 200 && body?.data?.id === notificationId && body.data.readAt) {
        const updated = body.data as CustomerNotificationItem;
        setMyNotifications(rows => rows.map(r => (r.id === notificationId ? updated : r)));
        setSelectedNotification(prev => (prev?.id === notificationId ? updated : prev));
        setNotificationStatusMessage('ทำเครื่องหมายว่าอ่านแล้ว คุณยังสามารถกลับมาอ่านการแจ้งเตือนนี้ได้เสมอ');
      } else {
        setNotificationStatusMessage('ไม่สามารถทำเครื่องหมายว่าอ่านแล้วได้ในขณะนี้ กรุณาลองใหม่');
      }
    } catch {
      if (sessionEpoch.current === epoch) {
        setNotificationStatusMessage('ไม่สามารถทำเครื่องหมายว่าอ่านแล้วได้ในขณะนี้ กรุณาลองใหม่');
      }
    } finally {
      window.clearTimeout(timeout);
      if (markReadRequest.current === controller) {
        markReadRequest.current = null;
        setMarkingReadId(null);
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'bookings') {
      void fetchMyBookings();
    } else if (activeTab === 'notifications') {
      void fetchMyNotifications();
    }
  }, [activeTab]);

  useEffect(() => {
    if (cancelTarget || rescheduleTarget || (!selectedBookingDetail && !detailError && !loadingDetail)) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedBookingDetail(null);
        setDetailError('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedBookingDetail, detailError, loadingDetail, cancelTarget, rescheduleTarget]);

  const canCancel = (booking: CustomerBookingItem) => booking.status === 'Booked' &&
    booking.displayStatus === 'Booked' && !closed.has(booking.id) && !rescheduleUncertain.has(booking.id);

  const isRescheduleUsed = (booking: CustomerBookingItem) =>
    Boolean(booking.hasRescheduled || rescheduleUsedIds.has(booking.id) || myBookings.find(r => r.id === booking.id)?.hasRescheduled);

  const canReschedule = (booking: CustomerBookingItem) => booking.status === 'Booked' &&
    booking.displayStatus === 'Booked' && !isRescheduleUsed(booking) && !closed.has(booking.id) && !uncertain.has(booking.id);

  function closeReschedule() {
    rescheduleOffersVersion.current++;
    pendingRescheduleOffers.current?.abort();
    pendingRescheduleOffers.current = null;
    setRescheduleOffersLoading(false);
    setRescheduleTarget(null);
    setRescheduleSlotId(null);
    const invoker = rescheduleInvoker.current;
    window.requestAnimationFrame(() => {
      if (invoker?.isConnected) invoker.focus();
      else (document.getElementById('modal-heading') ?? bookingsHeadingRef.current)?.focus();
    });
  }

  async function loadRescheduleOffers(bookingId: string) {
    const reqVersion = ++rescheduleOffersVersion.current;
    const epoch = sessionEpoch.current;
    pendingRescheduleOffers.current?.abort();
    const controller = new AbortController();
    pendingRescheduleOffers.current = controller;
    setRescheduleOffers([]);
    setRescheduleOffersLoading(true);
    setRescheduleOffersError('');
    try {
      const result = await fetchRescheduleOptions(controller.signal, bookingId, sessionBinding);
      if (
        rescheduleOffersVersion.current !== reqVersion ||
        sessionEpoch.current !== epoch ||
        controller.signal.aborted
      ) {
        return;
      }
      setRescheduleOffers(result.data);
    } catch (error) {
      if (
        rescheduleOffersVersion.current !== reqVersion ||
        sessionEpoch.current !== epoch ||
        controller.signal.aborted
      ) {
        return;
      }
      if (isSessionBindingOrCsrfMismatch(error)) {
        handleSessionBindingChanged(); return;
      }
      if (isAccessDeniedOrExpired(error)) {
        clearProtectedState(); onUnauthorized(); return;
      }
      setRescheduleOffersError('ไม่สามารถโหลดช่วงเวลาที่เปิดรับจองได้ กรุณาลองใหม่');
    } finally {
      if (rescheduleOffersVersion.current === reqVersion && sessionEpoch.current === epoch) {
        setRescheduleOffersLoading(false);
        pendingRescheduleOffers.current = null;
      }
    }
  }

  async function checkReschedule() {
    if (!rescheduleTarget || rescheduleRequest.current || rescheduleBusy) return;
    const id = rescheduleTarget.id;
    const previousSlotId = rescheduleTarget.slotId;
    const epoch = sessionEpoch.current;
    setRescheduleBusy(true);
    const latest = await openBookingDetail(id);
    if (sessionEpoch.current !== epoch) return;
    setRescheduleBusy(false);
    if (!latest) { setRescheduleFeedback('ตรวจสอบสถานะไม่ได้ กรุณาลองอีกครั้ง'); return; }
    setRescheduleUncertain(previous => { const next = new Set(previous); next.delete(id); return next; });
    if (latest.slotId !== previousSlotId && latest.status === 'Booked') {
      setRescheduleUsedIds(previous => new Set(previous).add(id));
      setRescheduleNotice('เลื่อนนัดสำเร็จแล้ว');
    } else {
      setRescheduleNotice(latest.status === 'Cancelled' ? 'การจองนี้ถูกยกเลิกแล้ว' : 'ตรวจสอบแล้ว การจองยังอยู่ที่เวลาเดิม');
    }
    closeReschedule();
    void fetchMyBookings();
    void refresh(false, true);
  }

  async function confirmReschedule() {
    if (!rescheduleTarget || !rescheduleSlotId || !canReschedule(rescheduleTarget) || !csrfToken || logoutBusy || logoutError || rescheduleRequest.current || rescheduleUncertain.has(rescheduleTarget.id)) return;
    const id = rescheduleTarget.id;
    const targetSlotId = rescheduleSlotId;
    const epoch = sessionEpoch.current;
    const request = new AbortController();
    rescheduleRequest.current = request;
    const timeout = window.setTimeout(() => request.abort(), 10_000);
    setRescheduleBusy(true);
    setRescheduleFeedback('');
    const markUnknown = () => {
      setRescheduleUncertain(previous => new Set(previous).add(id));
      setRescheduleFeedback('ยังยืนยันผลการเลื่อนนัดไม่ได้ กรุณาตรวจสอบสถานะก่อนทำรายการอีกครั้ง');
    };
    try {
      const response = await fetch('/api/v1/customer/bookings/' + encodeURIComponent(id) + '/reschedule', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: request.signal,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, 'X-NutTiew-Expected-Session-Binding': sessionBinding },
        body: JSON.stringify({ slotId: targetSlotId }),
      });
      const body = await response.json().catch(() => null);
      if (sessionEpoch.current !== epoch) return;
      const errCode = body?.error?.code;
      if (errCode === 'SESSION_BINDING_MISMATCH' || errCode === 'CSRF_DENIED' ||
          (response.ok && response.headers.get('X-NutTiew-Session-Binding') !== sessionBinding)) {
        handleSessionBindingChanged(); return;
      }
      if (response.status === 401 || response.status === 403) { clearProtectedState(); onUnauthorized(); return; }
      if (response.status === 200 && body?.data?.id === id && body.data.status === 'Booked' && body.data.slotId === targetSlotId) {
        const data = body.data as CustomerBookingDetail;
        detailVersion.current++;
        pendingDetailGet.current?.abort();
        setLoadingDetail(false);
        setRescheduleUsedIds(previous => new Set(previous).add(id));
        setMyBookings(rows => rows.map(row => row.id === id ? { ...data, hasRescheduled: true } : row));
        setSelectedBookingDetail(row => row?.id === id ? data : row);
        closeReschedule();
        setRescheduleNotice('เลื่อนนัดสำเร็จแล้ว');
        void fetchMyBookings();
        void refresh(false, true);
      } else if (errCode === 'RESCHEDULE_ALREADY_USED') {
        setRescheduleUsedIds(previous => new Set(previous).add(id));
        setRescheduleFeedback('การจองนี้ใช้สิทธิ์เลื่อนนัดครบ 1 ครั้งแล้ว');
        if (selectedBookingDetail?.id === id) void openBookingDetail(id);
        void fetchMyBookings();
      } else if (errCode === 'SLOT_UNAVAILABLE' || errCode === 'SLOT_NOT_FOUND') {
        setRescheduleOffers(prev => prev.filter(o => o.slotId !== targetSlotId));
        setRescheduleSlotId(null);
        setRescheduleFeedback('ช่วงเวลาที่เลือกไม่ว่างแล้ว กรุณาเลือกช่วงเวลาใหม่');
      } else if (errCode === 'CUSTOMER_OVERLAP') {
        setRescheduleFeedback('ช่วงเวลาที่เลือกทับซ้อนกับการจองอื่นของคุณ');
      } else if (errCode === 'RESCHEDULE_WINDOW_CLOSED') {
        setRescheduleFeedback('เลื่อนนัดไม่ได้ เพราะเวลานัดเดิมหรือเวลาใหม่เหลือไม่ถึง 60 นาทีก่อนเริ่มติว');
      } else if (errCode === 'RESCHEDULE_NOT_APPLICABLE' || response.status === 404) {
        setClosed(previous => new Set(previous).add(id));
        setRescheduleFeedback(response.status === 404 ? 'ไม่พบข้อมูลการจองนี้' : 'ไม่สามารถเลื่อนนัดรายการนี้ได้');
        if (selectedBookingDetail?.id === id) void openBookingDetail(id);
        void fetchMyBookings();
      } else if (errCode === 'SERVICE_UNAVAILABLE' || errCode === 'TRANSACTION_RETRY_EXHAUSTED' || response.status === 400) {
        setRescheduleFeedback('ยังเลื่อนนัดไม่ได้ กรุณาลองใหม่');
      } else {
        markUnknown();
      }
    } catch {
      if (sessionEpoch.current === epoch) markUnknown();
    } finally {
      window.clearTimeout(timeout);
      if (rescheduleRequest.current === request) { rescheduleRequest.current = null; setRescheduleBusy(false); }
    }
  }

  function renderReschedule(booking: CustomerBookingItem) {
    if (booking.status === 'Booked' && booking.displayStatus === 'Booked' && isRescheduleUsed(booking)) {
      return <span className="reschedule-used-note" data-testid="reschedule-used-note">ใช้สิทธิ์เลื่อนนัดแล้ว (1 ครั้ง)</span>;
    }
    return canReschedule(booking) && (
      <button
        type="button"
        className="view-detail-btn reschedule-booking-btn"
        data-testid="reschedule-booking"
        onClick={event => {
          rescheduleInvoker.current = event.currentTarget;
          setRescheduleTarget(booking);
          setRescheduleSlotId(null);
          setRescheduleNotice('');
          setRescheduleFeedback(rescheduleUncertain.has(booking.id) ? 'กรุณาตรวจสอบผลก่อนเลื่อนนัดอีกครั้ง' : '');
          if (!csrfToken && !csrfLoading) void loadCsrfBootstrap();
          if (!rescheduleUncertain.has(booking.id)) void loadRescheduleOffers(booking.id);
        }}
      >
        {rescheduleUncertain.has(booking.id) ? 'ตรวจสอบผลการเลื่อนนัด' : 'เลื่อนนัด'}
      </button>
    );
  }

  function closeCancel() {
    setCancelTarget(null);
    const invoker = cancelInvoker.current;
    window.requestAnimationFrame(() => {
      if (invoker?.isConnected) invoker.focus();
      else (document.getElementById('modal-heading') ?? bookingsHeadingRef.current)?.focus();
    });
  }

  async function checkCancellation() {
    if (!cancelTarget || cancelRequest.current || cancelBusy) return;
    const id = cancelTarget.id;
    const epoch = sessionEpoch.current;
    setCancelBusy(true);
    const latest = await openBookingDetail(id);
    if (sessionEpoch.current !== epoch) return;
    setCancelBusy(false);
    if (!latest) { setCancelFeedback('ตรวจสอบสถานะไม่ได้ กรุณาลองอีกครั้ง'); return; }
    setUncertain(previous => { const next = new Set(previous); next.delete(id); return next; });
    closeCancel();
    setCancelNotice(latest.status === 'Cancelled' ? 'การจองนี้ยกเลิกแล้ว' : 'ตรวจสอบแล้ว การจองยังไม่ถูกยกเลิก');
    void fetchMyBookings();
    void refresh(false, true);
  }

  async function confirmCancellation() {
    if (!cancelTarget || !canCancel(cancelTarget) || !csrfToken || logoutBusy || logoutError || cancelRequest.current || uncertain.has(cancelTarget.id)) return;
    const id = cancelTarget.id;
    const epoch = sessionEpoch.current;
    const request = new AbortController();
    cancelRequest.current = request;
    const timeout = window.setTimeout(() => request.abort(), 10_000);
    setCancelBusy(true);
    setCancelFeedback('');
    const markUnknown = () => {
      setUncertain(previous => new Set(previous).add(id));
      setCancelFeedback('ยังยืนยันผลการยกเลิกไม่ได้ กรุณาตรวจสอบสถานะก่อนทำรายการอีกครั้ง');
    };
    try {
      const response = await fetch('/api/v1/customer/bookings/' + encodeURIComponent(id) + '/cancel', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: request.signal,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, 'X-NutTiew-Expected-Session-Binding': sessionBinding },
        body: '{}',
      });
      const body = await response.json().catch(() => null);
      if (sessionEpoch.current !== epoch) return;
      const code = body?.error?.code;
      if (code === 'SESSION_BINDING_MISMATCH' || code === 'CSRF_DENIED' ||
          (response.ok && response.headers.get('X-NutTiew-Session-Binding') !== sessionBinding)) {
        handleSessionBindingChanged(); return;
      }
      if (response.status === 401 || response.status === 403) { clearProtectedState(); onUnauthorized(); return; }
      if (response.status === 200 && body?.data?.id === id && body.data.status === 'Cancelled' && body.data.displayStatus === 'Cancelled') {
        const data = body.data as CustomerBookingDetail;
        detailVersion.current++;
        pendingDetailGet.current?.abort();
        setLoadingDetail(false);
        setMyBookings(rows => rows.map(row => row.id === id ? { ...data, hasRescheduled: row.hasRescheduled } : row));
        setSelectedBookingDetail(row => row?.id === id ? data : row);
        closeCancel();
        setCancelNotice('ยกเลิกการจองแล้ว');
        void fetchMyBookings();
        void refresh(false, true);
      } else if (response.status === 409 || response.status === 422 || response.status === 404) {
        setClosed(previous => new Set(previous).add(id));
        setCancelFeedback(response.status === 422 ? 'ยกเลิกไม่ได้ เพราะเหลือเวลาไม่ถึง 30 นาทีก่อนเริ่มติว' :
          response.status === 409 ? 'การจองนี้ไม่สามารถยกเลิกได้แล้ว' : 'ไม่พบข้อมูลการจองนี้');
        if (selectedBookingDetail?.id === id) void openBookingDetail(id);
        void fetchMyBookings();
      } else if (code === 'SERVICE_UNAVAILABLE' || code === 'TRANSACTION_RETRY_EXHAUSTED' || response.status === 400) {
        setCancelFeedback('ยังยกเลิกการจองไม่ได้ กรุณาลองใหม่');
      } else {
        markUnknown();
      }
    } catch {
      if (sessionEpoch.current === epoch) markUnknown();
    } finally {
      window.clearTimeout(timeout);
      if (cancelRequest.current === request) { cancelRequest.current = null; setCancelBusy(false); }
    }
  }

  function renderCancel(booking: CustomerBookingItem) {
    return canCancel(booking) && <button type="button" className="view-detail-btn cancel-booking-btn" data-testid="cancel-booking"
      onClick={event => {
        cancelInvoker.current = event.currentTarget;
        setCancelTarget(booking);
        setCancelNotice('');
        setCancelFeedback(uncertain.has(booking.id) ? 'กรุณาตรวจสอบผลก่อนยกเลิกอีกครั้ง' : '');
        if (!csrfToken && !csrfLoading) void loadCsrfBootstrap();
      }}>
      {uncertain.has(booking.id) ? 'ตรวจสอบผลการยกเลิก' : 'ยกเลิกการจอง'}
    </button>;
  }

  const handleLogout = () => {
    version.current++;
    csrfVersion.current++;
    bookingsVersion.current++;
    detailVersion.current++;
    rescheduleOffersVersion.current++;
    sessionEpoch.current++;
    pendingGet.current?.abort();
    pendingCsrf.current?.abort();
    pendingPost.current?.abort();
    pendingBookingsGet.current?.abort();
    pendingDetailGet.current?.abort();
    pendingRescheduleOffers.current?.abort();
    clearProtectedState();
    void onLogout();
  };

  const confirmSelectedBooking = async (targetOffer: {
    slotId: string;
    tutorRef: string;
    startsAt: string;
    endsAt: string;
  }) => {
    if (submittingRef.current || logoutBusy || !csrfToken) return;
    submittingRef.current = true;
    setSubmittingBooking(true);
    setStaleNotice('');
    setBookingBanner(null);

    const capturedEpoch = sessionEpoch.current;
    const capturedBinding = sessionBinding;
    const capturedSlotId = targetOffer.slotId;
    const activeCsrf = csrfToken;

    const controller = new AbortController();
    pendingPost.current = controller;

    try {
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

      if (isSessionBindingOrCsrfMismatch(error)) {
        handleSessionBindingChanged();
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

  const calendarIndex = useMemo(
    () => buildAvailabilityCalendarIndex(offers, evaluatedAt),
    [offers, evaluatedAt],
  );
  const effectiveMonthKey = viewedMonthKey ?? calendarIndex.earliestMonthKey;
  const effectiveDayKey = selectedDayKey ?? calendarIndex.earliestDayKey;
  const monthCells = useMemo(
    () =>
      effectiveMonthKey
        ? buildMonthGrid(effectiveMonthKey, calendarIndex.offersByDay)
        : [],
    [effectiveMonthKey, calendarIndex],
  );
  const monthOfferCount = effectiveMonthKey
    ? calendarIndex.monthOfferCount(effectiveMonthKey)
    : 0;
  const isSelectedDayInViewedMonth =
    Boolean(effectiveDayKey) &&
    Boolean(effectiveMonthKey) &&
    monthKeyFromDayKey(effectiveDayKey!) === effectiveMonthKey;
  const dayOffers =
    isSelectedDayInViewedMonth && effectiveDayKey
      ? (calendarIndex.offersByDay.get(effectiveDayKey) ?? [])
      : [];
  const dayTimeGroups = useMemo(
    () => groupDayOffersByExactInterval(dayOffers),
    [dayOffers],
  );
  const { visibleGroups: visibleTimeGroups, hiddenCount: hiddenTimeGroupCount } =
    sliceVisibleTimeGroups(
      dayTimeGroups,
      showAllTimeGroups,
      DEFAULT_VISIBLE_TIME_GROUPS,
    );

  const prevMonthCandidate = effectiveMonthKey
    ? shiftMonthKey(effectiveMonthKey, -1)
    : null;
  const nextMonthCandidate = effectiveMonthKey
    ? shiftMonthKey(effectiveMonthKey, 1)
    : null;
  const canGoPrevMonth = Boolean(
    prevMonthCandidate &&
      calendarIndex.minMonthKey &&
      prevMonthCandidate >= calendarIndex.minMonthKey,
  );
  const canGoNextMonth = Boolean(
    nextMonthCandidate &&
      calendarIndex.maxMonthKey &&
      nextMonthCandidate <= calendarIndex.maxMonthKey,
  );

  const handleChangeMonth = (delta: -1 | 1) => {
    if (!effectiveMonthKey) return;
    const candidate = shiftMonthKey(effectiveMonthKey, delta);
    if (calendarIndex.minMonthKey && candidate < calendarIndex.minMonthKey) return;
    if (calendarIndex.maxMonthKey && candidate > calendarIndex.maxMonthKey) return;
    viewedMonthRef.current = candidate;
    setViewedMonthKey(candidate);
    pendingFocusGroupKeyRef.current = null;
    setExpandedTimeKeys({});
    setShowAllTimeGroups(false);
    const countInMonth = calendarIndex.monthOfferCount(candidate);
    const label = formatBangkokMonthYear(candidate);
    setCalendarLiveMessage(
      countInMonth > 0
        ? `แสดงปฏิทินเดือน ${label} มี ${countInMonth} ช่วงเวลา`
        : `เดือน ${label} ยังไม่มีช่วงเวลาว่าง`,
    );
  };

  const handleSelectDay = (dayKey: string) => {
    const countForDay = calendarIndex.offersByDay.get(dayKey)?.length ?? 0;
    if (countForDay === 0) return;
    selectedDayRef.current = dayKey;
    setSelectedDayKey(dayKey);
    const targetMonth = monthKeyFromDayKey(dayKey);
    viewedMonthRef.current = targetMonth;
    setViewedMonthKey(targetMonth);
    pendingFocusGroupKeyRef.current = null;
    setExpandedTimeKeys({});
    setShowAllTimeGroups(false);
    setCalendarLiveMessage(
      `เลือกวันที่ ${bangkokLongDateFromDayKey(dayKey)} พบ ${countForDay} ช่วงเวลา`,
    );
  };

  const toggleTimeGroup = (groupKey: string) => {
    setExpandedTimeKeys(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const handleShowMoreTimeGroups = () => {
    const firstRevealedGroup = dayTimeGroups[DEFAULT_VISIBLE_TIME_GROUPS];
    pendingFocusGroupKeyRef.current = firstRevealedGroup?.key ?? null;
    setShowAllTimeGroups(true);
  };

  useEffect(() => {
    const targetKey = pendingFocusGroupKeyRef.current;
    if (!showAllTimeGroups || !targetKey) return;
    const targetButton = timeGroupToggleRefs.current.get(targetKey);
    pendingFocusGroupKeyRef.current = null;
    if (targetButton && document.contains(targetButton)) {
      targetButton.focus();
    }
  }, [showAllTimeGroups, visibleTimeGroups]);

  const renderSelectedOfferSummary = () => {
    if (!activeOffer) return null;
    return (
      <section
        id="selected-offer-summary"
        className="availability-surface selected-summary-surface"
        aria-labelledby="selected-offer-heading"
        role="status"
        aria-live="polite"
      >
        <div className="selected-summary-copy">
          <span className="availability-step-kicker">3. ตรวจสรุปและยืนยันการจอง</span>
          <h2 id="selected-offer-heading">
            {unknownOutcome
              ? 'รอการยืนยันผลการจองช่วงเวลาติว'
              : 'ยืนยันการจองช่วงเวลาติว — ช่วงเวลาที่เลือกไว้'}
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
          {csrfError && (
            <p
              id="booking-csrf-error"
              data-testid="booking-csrf-error"
              className="selection-not-booking-note"
              role="alert"
            >
              {csrfError}
            </p>
          )}
        </div>
        <div className="selected-summary-actions">
          {unknownOutcome ? (
            <>
              <button
                type="button"
                className="confirm-booking-button"
                disabled={submittingBooking || csrfLoading || !csrfToken || logoutBusy}
                onClick={() => void confirmSelectedBooking(activeOffer)}
              >
                {submittingBooking ? 'กำลังยืนยันการจอง…' : 'ส่งคำขอเดิมอีกครั้ง'}
              </button>
              {csrfError && (
                <button
                  type="button"
                  className="clear-selection-button"
                  disabled={csrfLoading || submittingBooking || logoutBusy}
                  onClick={() => void loadCsrfBootstrap()}
                >
                  เตรียมการจองอีกครั้ง
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="confirm-booking-button"
                disabled={submittingBooking || csrfLoading || !csrfToken || logoutBusy}
                onClick={() => void confirmSelectedBooking(activeOffer)}
              >
                {submittingBooking ? 'กำลังยืนยันการจอง…' : 'ยืนยันการจอง'}
              </button>
              {csrfError && (
                <button
                  type="button"
                  className="clear-selection-button"
                  disabled={csrfLoading || submittingBooking || logoutBusy}
                  onClick={() => void loadCsrfBootstrap()}
                >
                  เตรียมการจองอีกครั้ง
                </button>
              )}
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
    );
  };

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
            href="#availability-section"
            className={'sidebar-nav-link' + (activeTab === 'availability' ? ' sidebar-nav-active' : '')}
            aria-current={activeTab === 'availability' ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); navigateTab('availability'); }}
          >
            <Icon kind="calendar" />
            <span>เลือกช่วงเวลาติว</span>
            {activeTab === 'availability' && <span className="nav-active-marker" aria-hidden="true" />}
          </a>
          <a
            href="#customer-bookings-section"
            className={'sidebar-nav-link' + (activeTab === 'bookings' ? ' sidebar-nav-active' : '')}
            aria-current={activeTab === 'bookings' ? 'page' : undefined}
            data-testid="nav-my-bookings"
            onClick={(e) => { e.preventDefault(); navigateTab('bookings'); }}
          >
            <Icon kind="clock" />
            <span>การจองของฉัน</span>
            {activeTab === 'bookings' && <span className="nav-active-marker" aria-hidden="true" />}
          </a>
          <a
            href="#customer-notifications-section"
            className={'sidebar-nav-link' + (activeTab === 'notifications' ? ' sidebar-nav-active' : '')}
            aria-current={activeTab === 'notifications' ? 'page' : undefined}
            data-testid="nav-customer-notifications"
            onClick={(e) => { e.preventDefault(); navigateTab('notifications'); }}
          >
            <Icon kind="bell" />
            <span>การแจ้งเตือน</span>
            {myNotifications.filter(n => n.readAt === null).length > 0 && (
              <span className="notification-nav-count" aria-label={`ยังไม่ได้อ่าน ${myNotifications.filter(n => n.readAt === null).length} รายการ`}>
                {myNotifications.filter(n => n.readAt === null).length}
              </span>
            )}
            {activeTab === 'notifications' && <span className="nav-active-marker" aria-hidden="true" />}
          </a>
          <a
            className={'sidebar-nav-link' + (activeTab === 'account' ? ' sidebar-nav-active' : '')}
            aria-current={activeTab === 'account' ? 'page' : undefined}
            href="#customer-account-panel"
            data-testid="nav-customer-account"
            onClick={(e) => { e.preventDefault(); navigateTab('account'); }}
          >
            <Icon kind="user" />
            <span>บัญชีของฉัน</span>
            {activeTab === 'account' && <span className="nav-active-marker" aria-hidden="true" />}
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
            <strong>
              {activeTab === 'availability'
                ? 'เลือกช่วงเวลาติว'
                : activeTab === 'bookings'
                  ? 'การจองของฉัน'
                  : activeTab === 'notifications'
                    ? 'การแจ้งเตือน'
                    : 'บัญชีของฉัน'}
            </strong>
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

          {activeTab === 'account' ? (
            <section
              id="customer-account-panel"
              className="availability-surface customer-account-panel"
              aria-labelledby="customer-account-heading"
            >
              <div className="account-panel-header">
                <div>
                  <p className="dashboard-kicker">AUTHENTICATED SESSION</p>
                  <h1 id="customer-account-heading" tabIndex={-1} ref={accountHeadingRef}>บัญชีของฉัน</h1>
                  <p className="account-panel-subtitle">
                    ข้อมูลบัญชีแบบอ่านอย่างเดียวจากเซสชันที่ยืนยันตัวตนแล้ว
                  </p>
                </div>
                <button
                  type="button"
                  className="account-back-button"
                  onClick={() => navigateTab('availability')}
                >
                  กลับไปเลือกช่วงเวลาติว
                </button>
              </div>
              <dl className="account-readonly-grid">
                <div className="account-readonly-item">
                  <dt>บทบาท (Role)</dt>
                  <dd>Customer</dd>
                </div>
                <div className="account-readonly-item">
                  <dt>รหัสบัญชีอ้างอิง</dt>
                  <dd><code>#{shortId}</code></dd>
                </div>
                <div className="account-readonly-item">
                  <dt>เขตเวลาเริ่มต้น</dt>
                  <dd>Asia/Bangkok (UTC+07:00)</dd>
                </div>
              </dl>
              <div className="account-panel-actions">
                <button
                  type="button"
                  className="account-panel-logout"
                  disabled={logoutBusy}
                  onClick={handleLogout}
                >
                  <Icon kind="logout" />
                  <span>{logoutBusy ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}</span>
                </button>
              </div>
            </section>
          ) : activeTab === 'notifications' ? (
            logoutBusy || logoutError ? (
              <div className="availability-surface" role="status">
                <p>เซสชันกำลังออกจากระบบหรือรอการยืนยัน ข้อมูลการแจ้งเตือนถูกซ่อนเพื่อความปลอดภัย</p>
              </div>
            ) : (
            <section id="customer-notifications-section" className="customer-notifications-section" aria-labelledby="customer-notifications-heading">
              <header className="availability-hero">
                <div className="availability-hero-copy">
                  <h2 className="dashboard-kicker">PRIVATE NOTICES</h2>
                  <h1 id="customer-notifications-heading" tabIndex={-1} ref={notificationsHeadingRef}>การแจ้งเตือน</h1>
                  <p className="availability-helper">
                    การแจ้งเตือนเมื่อผู้สอนยกเลิกนัดหมาย • เวลาประเทศไทย <strong>Asia/Bangkok (UTC+07:00)</strong>
                  </p>
                </div>
                <div className="availability-hero-actions">
                  <button
                    type="button"
                    className="refresh-availability-button"
                    data-testid="refresh-notifications-btn"
                    disabled={loadingNotifications}
                    onClick={() => void fetchMyNotifications()}
                  >
                    {loadingNotifications ? 'กำลังโหลด…' : 'รีเฟรช'}
                  </button>
                </div>
              </header>

              <p className="notification-live-status" role="status" aria-live="polite" data-testid="notification-live-status">
                {notificationStatusMessage}
              </p>

              {loadingNotifications && (
                <div className="availability-surface" role="status">
                  <p>กำลังโหลดรายการแจ้งเตือน...</p>
                </div>
              )}

              {notificationsError && (
                <div className="customer-bookings-error availability-surface" role="alert">
                  <p>{notificationsError}</p>
                  <button type="button" onClick={() => void fetchMyNotifications()}>ลองใหม่อีกครั้ง</button>
                </div>
              )}

              {!loadingNotifications && !notificationsError && myNotifications.length === 0 && (
                <div className="customer-bookings-empty availability-surface" data-testid="notifications-empty-state">
                  <p>ยังไม่มีการแจ้งเตือน เมื่อผู้สอนยกเลิกนัดหมายของคุณ ข้อความแจ้งเตือนและเหตุผลจะแสดงที่นี่</p>
                </div>
              )}

              {!loadingNotifications && !notificationsError && myNotifications.length > 0 && (
                <div className="notifications-layout">
                  <ul className="notifications-list" data-testid="customer-notifications-list" aria-label="รายการแจ้งเตือนการยกเลิกนัดหมาย">
                    {myNotifications.map(n => {
                      const unread = n.readAt === null;
                      const isSelected = selectedNotification?.id === n.id;
                      const intervalLabel = `${bangkokLongDate(new Date(n.booking.startsAt))} ${bangkokClock(new Date(n.booking.startsAt))} – ${bangkokClock(new Date(n.booking.endsAt))} น. (Asia/Bangkok)`;
                      const preview = n.reason.length > 90 ? n.reason.slice(0, 90) + '…' : n.reason;
                      return (
                        <li key={n.id} data-notification-id={n.id}>
                          <button
                            type="button"
                            className={'notification-row-btn availability-surface' + (unread ? ' is-unread' : '') + (isSelected ? ' is-selected' : '')}
                            data-testid="notification-item"
                            aria-current={isSelected ? 'true' : undefined}
                            aria-label={`${unread ? 'ยังไม่ได้อ่าน' : 'อ่านแล้ว'} ผู้สอน ${n.booking.tutorRef} ${intervalLabel}`}
                            onClick={() => void openNotificationDetail(n.id)}
                          >
                            <div className="notification-row-top">
                              <span className="booking-tutor-ref">ผู้สอนยกเลิกนัด: <strong>{n.booking.tutorRef}</strong></span>
                              <span
                                className={unread ? 'notification-badge-unread' : 'notification-badge-read'}
                                data-testid="notification-read-badge"
                              >
                                {unread ? 'ยังไม่ได้อ่าน' : 'อ่านแล้ว'}
                              </span>
                            </div>
                            <p className="notification-row-interval">{intervalLabel}</p>
                            <p className="notification-row-preview">{preview}</p>
                            <p className="notification-row-time">
                              แจ้งเตือนเมื่อ {bangkokLongDate(new Date(n.createdAt))} {bangkokClock(new Date(n.createdAt))} น. (Asia/Bangkok)
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  <section
                    className="notification-detail-panel availability-surface"
                    data-testid="notification-detail-panel"
                    aria-labelledby="notification-detail-heading"
                  >
                    <h2 id="notification-detail-heading">รายละเอียดการแจ้งเตือน</h2>
                    {loadingNotificationDetail ? (
                      <p role="status">กำลังโหลดรายละเอียดการแจ้งเตือน...</p>
                    ) : notificationDetailError ? (
                      <p role="alert">{notificationDetailError}</p>
                    ) : selectedNotification ? (
                      <div className="notification-detail-content">
                        <dl className="detail-dl">
                          <dt>สถานะการอ่าน</dt>
                          <dd data-testid="notification-detail-read-status">
                            {selectedNotification.readAt
                              ? `อ่านแล้วเมื่อ ${bangkokLongDate(new Date(selectedNotification.readAt))} ${bangkokClock(new Date(selectedNotification.readAt))} น. (Asia/Bangkok)`
                              : 'ยังไม่ได้อ่าน'}
                          </dd>
                          <dt>รหัสการจอง (Booking ID)</dt>
                          <dd><code data-testid="notification-detail-booking-id">{selectedNotification.booking.id}</code></dd>
                          <dt>ผู้สอน (Tutor)</dt>
                          <dd><strong>{selectedNotification.booking.tutorRef}</strong></dd>
                          <dt>วันและเวลานัดหมายเดิม</dt>
                          <dd>
                            {bangkokLongDate(new Date(selectedNotification.booking.startsAt))}, {bangkokClock(new Date(selectedNotification.booking.startsAt))} – {bangkokClock(new Date(selectedNotification.booking.endsAt))} น. (Asia/Bangkok)
                          </dd>
                          <dt>เวลาที่ผู้สอนยกเลิก</dt>
                          <dd>
                            {bangkokLongDate(new Date(selectedNotification.booking.cancelledAt))} {bangkokClock(new Date(selectedNotification.booking.cancelledAt))} น. (Asia/Bangkok)
                          </dd>
                          <dt>เหตุผลที่ผู้สอนยกเลิก</dt>
                          <dd className="tutor-cancel-reason-detail" data-testid="notification-detail-reason">
                            {selectedNotification.reason}
                          </dd>
                        </dl>
                        <div className="notification-detail-actions">
                          {selectedNotification.readAt === null && (
                            <button
                              type="button"
                              className="modal-close-btn"
                              data-testid="mark-notification-read-btn"
                              disabled={markingReadId === selectedNotification.id}
                              aria-busy={markingReadId === selectedNotification.id}
                              onClick={() => void markNotificationRead(selectedNotification.id)}
                            >
                              {markingReadId === selectedNotification.id ? 'กำลังบันทึก…' : 'ทำเครื่องหมายว่าอ่านแล้ว'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p>เลือกรายการแจ้งเตือนทางซ้ายเพื่อดูเหตุผลและรายละเอียดการยกเลิก</p>
                    )}
                  </section>
                </div>
              )}
            </section>
            )
          ) : activeTab === 'bookings' ? (
            logoutBusy || logoutError ? (
              <div className="availability-surface" role="status">
                <p>เซสชันกำลังออกจากระบบหรือรอการยืนยัน ข้อมูลการจองถูกซ่อนเพื่อความปลอดภัย</p>
              </div>
            ) : (
            <section id="customer-bookings-section" className="customer-bookings-section" aria-labelledby="customer-bookings-heading">
              <header className="availability-hero">
                <div className="availability-hero-copy">
                  <h2 className="dashboard-kicker">YOUR RESERVATIONS</h2>
                  <h1 id="customer-bookings-heading" tabIndex={-1} ref={bookingsHeadingRef}>การจองของฉัน</h1>
                  <p className="availability-helper">
                    เวลาที่แสดงเป็นเวลาประเทศไทย <strong>Asia/Bangkok (UTC+07:00)</strong>
                  </p>
                </div>
                <div className="availability-hero-actions">
                  <button
                    type="button"
                    className="refresh-availability-button"
                    data-testid="refresh-bookings-btn"
                    disabled={loadingBookings}
                    onClick={() => void fetchMyBookings()}
                  >
                    {loadingBookings ? 'กำลังโหลด…' : 'รีเฟรช'}
                  </button>
                </div>
              </header>

              {loadingBookings && (
                <div className="availability-surface" role="status">
                  <p>กำลังโหลดรายการจองของคุณ...</p>
                </div>
              )}

              {bookingsError && (
                <div className="customer-bookings-error availability-surface" role="alert">
                  <p>{bookingsError}</p>
                  <button type="button" onClick={() => void fetchMyBookings()}>ลองใหม่อีกครั้ง</button>
                </div>
              )}

              {!loadingBookings && !bookingsError && myBookings.length === 0 && (
                <div className="customer-bookings-empty availability-surface">
                  <p>คุณยังไม่มีประวัติการจองติว</p>
                  <button
                    type="button"
                    data-testid="empty-browse-availability-btn"
                    onClick={() => setActiveTab('availability')}
                  >
                    ค้นหาตารางติวเพื่อเริ่มจอง
                  </button>
                </div>
              )}

              {!loadingBookings && !bookingsError && myBookings.length > 0 && (
                <div className="customer-bookings-list" data-testid="customer-bookings-list">
                  {myBookings.map(b => (
                    <div key={b.id} className="customer-booking-card availability-surface" data-testid="customer-booking-card" data-booking-id={b.id}>
                      <div className="card-top-row">
                        <span className="booking-tutor-ref">ผู้สอน: <strong>{b.tutorRef}</strong></span>
                        <span
                          className={b.displayStatus === 'Booked' ? 'badge-booked' : 'badge-past'}
                          data-testid="customer-booking-status-badge"
                        >
                          {bookingLabel(b.displayStatus)}
                        </span>
                      </div>
                      <div className="card-mid-row">
                        <p className="booking-time-interval">
                          {bangkokLongDate(new Date(b.startsAt))}, {bangkokClock(new Date(b.startsAt))} – {bangkokClock(new Date(b.endsAt))} น. (Asia/Bangkok)
                        </p>
                        <p className="booking-code-row">
                          รหัสการจอง: <code data-testid="booking-card-id">{b.id}</code>
                        </p>
                      </div>
                      <div className="card-action-row">
                        <button
                          type="button"
                          className="view-detail-btn"
                          data-testid="view-booking-detail"
                          onClick={() => void openBookingDetail(b.id)}
                        >
                          ดูรายละเอียด
                        </button>
                        {renderReschedule(b)}
                        {renderCancel(b)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            )
          ) : (
            <>
              <header className="availability-hero">
            <div className="availability-hero-copy">
              <h2 className="dashboard-kicker">ยินดีต้อนรับ</h2>
              <h1 id="availability-heading" tabIndex={-1} ref={availabilityHeadingRef}>เลือกช่วงเวลาติว</h1>
              <p className="availability-helper">
                เลือกวันที่สะดวก แล้วเลือกช่วงเวลา • เวลาที่แสดงเป็นเวลาประเทศไทย{' '}
                <strong>Asia/Bangkok (UTC+07:00)</strong>
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
            ) : offers.length === 0 ? (
              hasConfirmedResponse ? (
                <>
                  <div className="availability-surface availability-empty" role="status">
                    <p className="empty-slots">ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก</p>
                  </div>
                  {renderSelectedOfferSummary()}
                </>
              ) : null
            ) : (
              <div className="availability-workspace-container">
                <div className="availability-workspace">
                  <div className="availability-calendar-pane">
                    <section
                      className="availability-surface availability-calendar-card"
                      aria-labelledby="calendar-month-heading"
                    >
                      <div className="calendar-card-header">
                        <span className="availability-step-kicker">1. เลือกวันที่</span>
                        <div className="calendar-month-title-row">
                          <h2 id="calendar-month-heading" data-testid="calendar-month-heading">
                            {effectiveMonthKey ? formatBangkokMonthYear(effectiveMonthKey) : ''}
                          </h2>
                          <span
                            className="calendar-month-count-chip"
                            data-testid="calendar-month-offer-count"
                          >
                            {monthOfferCount > 0 ? `มี ${monthOfferCount} ช่วงเวลา` : 'ไม่มีช่วงเวลา'}
                          </span>
                        </div>
                      </div>

                      <div className="calendar-nav-row" aria-label="เปลี่ยนเดือนบนปฏิทิน">
                        <button
                          type="button"
                          className="calendar-nav-button"
                          data-testid="calendar-prev-month"
                          disabled={!canGoPrevMonth}
                          onClick={() => handleChangeMonth(-1)}
                        >
                          เดือนก่อนหน้า
                        </button>
                        <button
                          type="button"
                          className="calendar-nav-button"
                          data-testid="calendar-next-month"
                          disabled={!canGoNextMonth}
                          onClick={() => handleChangeMonth(1)}
                        >
                          เดือนถัดไป
                        </button>
                      </div>

                      <div className="calendar-weekdays" aria-hidden="true">
                        {WEEKDAY_LABELS_MON_FIRST.map(label => (
                          <span key={label} className="calendar-weekday-cell">
                            {label}
                          </span>
                        ))}
                      </div>

                      <div className="calendar-day-grid" data-testid="calendar-day-grid">
                        {monthCells.map(cell => {
                          if (cell.kind === 'spacer') {
                            return (
                              <div
                                key={cell.key}
                                className="calendar-day-spacer"
                                aria-hidden="true"
                              />
                            );
                          }
                          const isEmptyDay = cell.offerCount === 0;
                          const isSelected = !isEmptyDay && cell.dayKey === effectiveDayKey;
                          return (
                            <button
                              key={cell.key}
                              type="button"
                              data-testid={`calendar-day-${cell.dayKey}`}
                              data-day-key={cell.dayKey}
                              data-offer-count={cell.offerCount}
                              disabled={isEmptyDay}
                              aria-pressed={isEmptyDay ? undefined : isSelected}
                              aria-label={cell.ariaLabel}
                              className={
                                'calendar-day-button' +
                                (isEmptyDay ? ' calendar-day-empty' : ' calendar-day-available') +
                                (isSelected ? ' calendar-day-selected' : '')
                              }
                              onClick={() => handleSelectDay(cell.dayKey)}
                            >
                              <span className="calendar-day-num">{cell.dayNumber}</span>
                              {isEmptyDay ? (
                                <span className="calendar-day-zero" aria-hidden="true">
                                  —
                                </span>
                              ) : (
                                <span className="calendar-day-offers">
                                  <span className="calendar-day-offers-count">
                                    {cell.offerCount}
                                  </span>
                                  <span className="calendar-day-offers-unit">ช่วงเวลา</span>
                                </span>
                              )}
                              {isSelected && (
                                <span className="calendar-day-selected-cue" aria-hidden="true">
                                  เลือกอยู่
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <p
                        className="availability-live-region"
                        data-testid="calendar-live-status"
                        role="status"
                        aria-live="polite"
                      >
                        {calendarLiveMessage}
                      </p>
                    </section>
                  </div>

                  <div className="availability-day-pane">
                    <section
                      className="availability-surface availability-day-card"
                      aria-labelledby="selected-day-heading"
                    >
                      {monthOfferCount === 0 ? (
                        <>
                          <div className="availability-day-header">
                            <div className="availability-day-header-copy">
                              <span className="availability-step-kicker">2. เลือกช่วงเวลา</span>
                              <h2 id="selected-day-heading">
                                {effectiveMonthKey ? formatBangkokMonthYear(effectiveMonthKey) : ''}
                              </h2>
                            </div>
                            <span className="availability-count-badge">0 ช่วงเวลา</span>
                          </div>
                          <div
                            className="availability-day-empty-panel"
                            data-testid="calendar-month-empty"
                            role="status"
                          >
                            <p className="availability-day-empty-title">
                              ยังไม่มีช่วงเวลาว่างในเดือนที่เลือก
                            </p>
                            <p className="availability-day-empty-copy">
                              กรุณาใช้ปุ่มเดือนก่อนหน้าหรือเดือนถัดไปเพื่อเลือกวันที่มีช่วงเวลาเปิดรับ
                            </p>
                          </div>
                        </>
                      ) : !isSelectedDayInViewedMonth || !effectiveDayKey ? (
                        <>
                          <div className="availability-day-header">
                            <div className="availability-day-header-copy">
                              <span className="availability-step-kicker">2. เลือกช่วงเวลา</span>
                              <h2 id="selected-day-heading">
                                {effectiveMonthKey ? formatBangkokMonthYear(effectiveMonthKey) : ''}
                              </h2>
                            </div>
                            <span className="availability-count-badge">
                              {monthOfferCount} ช่วงเวลาในเดือนนี้
                            </span>
                          </div>
                          <div
                            className="availability-day-empty-panel"
                            data-testid="calendar-select-day-prompt"
                            role="status"
                          >
                            <p className="availability-day-empty-title">
                              กรุณาเลือกวันที่จากปฏิทิน
                            </p>
                            <p className="availability-day-empty-copy">
                              เดือนนี้มีทั้งหมด {monthOfferCount} ช่วงเวลาว่าง กดเลือกวันที่ที่แสดงจำนวนช่วงเวลาเพื่อดูรายการเวลา
                            </p>
                          </div>
                        </>
                      ) : dayOffers.length === 0 ? (
                        <>
                          <div className="availability-day-header">
                            <div className="availability-day-header-copy">
                              <span className="availability-step-kicker">2. เลือกช่วงเวลา</span>
                              <h2 id="selected-day-heading">
                                {bangkokLongDateFromDayKey(effectiveDayKey)}
                              </h2>
                            </div>
                            <span className="availability-count-badge">0 ช่วงเวลา</span>
                          </div>
                          <div
                            className="availability-day-empty-panel"
                            data-testid="calendar-day-empty"
                            role="status"
                          >
                            <p className="availability-day-empty-title">
                              ยังไม่มีช่วงเวลาว่างในวันที่เลือก
                            </p>
                            <p className="availability-day-empty-copy">
                              ช่วงเวลาในวันที่ {bangkokLongDateFromDayKey(effectiveDayKey)} อาจถูกจองแล้ว กรุณาเลือกวันอื่นที่มีช่วงเวลาว่างในปฏิทิน
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="availability-day-header">
                            <div className="availability-day-header-copy">
                              <span className="availability-step-kicker">2. เลือกช่วงเวลา</span>
                              <h2 id="selected-day-heading" data-testid="selected-day-heading">
                                {bangkokLongDateFromDayKey(effectiveDayKey)}
                              </h2>
                              <p className="availability-day-subtitle">
                                จัดกลุ่มตามเวลาเริ่ม–สิ้นสุดจริง (Asia/Bangkok) • กดเพื่อดูตัวเลือก
                              </p>
                            </div>
                            <span
                              className="availability-count-badge"
                              data-testid="day-offer-count-badge"
                            >
                              {dayOffers.length} ช่วงเวลา
                            </span>
                          </div>

                          <div className="time-group-list" data-testid="time-group-list">
                            {visibleTimeGroups.map(group => {
                              const isExpanded = Boolean(expandedTimeKeys[group.key]);
                              const durationMinutes = computeOfferDurationMinutes(group.items[0]);
                              const hasSelectedOffer =
                                selectedSlotId !== null &&
                                group.items.some(item => item.slotId === selectedSlotId);
                              return (
                                <div
                                  key={group.key}
                                  className={
                                    'time-group-item' + (isExpanded ? ' time-group-expanded' : '')
                                  }
                                  data-testid="time-group-item"
                                  data-time-group-key={group.key}
                                >
                                  <button
                                    type="button"
                                    ref={el => {
                                      if (el) {
                                        timeGroupToggleRefs.current.set(group.key, el);
                                      } else {
                                        timeGroupToggleRefs.current.delete(group.key);
                                      }
                                    }}
                                    className="time-group-toggle"
                                    data-testid="time-group-toggle"
                                    aria-expanded={isExpanded}
                                    onClick={() => toggleTimeGroup(group.key)}
                                  >
                                    <span className="time-group-main">
                                      <span className="time-group-clock">
                                        {group.startClock}–{group.endClock} น.
                                      </span>
                                      {group.crossMidnight && (
                                        <span className="offer-next-day">สิ้นสุดในวันถัดไป</span>
                                      )}
                                      {hasSelectedOffer && (
                                        <span className="time-group-selected-tag">เลือกอยู่</span>
                                      )}
                                    </span>
                                    <span className="time-group-meta">
                                      <span className="time-group-duration">
                                        {durationMinutes} นาที
                                      </span>
                                      <span className="time-group-count">
                                        {group.items.length} ตัวเลือก
                                      </span>
                                      <span className="time-group-chevron" aria-hidden="true">
                                        {isExpanded ? '▴' : '▾'}
                                      </span>
                                    </span>
                                  </button>

                                  {isExpanded && (
                                    <ul
                                      className="availability-offer-list"
                                      aria-label={`ช่วงเวลาติว ${group.startClock}–${group.endClock} น. วันที่ ${group.dateLabel}`}
                                    >
                                      {group.items.map(offer => {
                                        const start = new Date(offer.startsAt);
                                        const end = new Date(offer.endsAt);
                                        const crossMidnight =
                                          bangkokDayKey(start) !== bangkokDayKey(end);
                                        const isSelected = selectedSlotId === offer.slotId;
                                        const lockedToOtherUnknown =
                                          unknownOutcome !== null &&
                                          unknownOutcome.slotId !== offer.slotId;
                                        const offerMinutes = computeOfferDurationMinutes(offer);
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
                                                {bangkokLongDate(start)} • {offerMinutes} นาที
                                                {' '}(Asia/Bangkok)
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
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {hiddenTimeGroupCount > 0 && (
                            <div className="time-group-more-wrap">
                              <button
                                type="button"
                                className="show-more-times-button"
                                data-testid="show-more-times-btn"
                                onClick={handleShowMoreTimeGroups}
                              >
                                ดูเวลาเพิ่มเติม (อีก {hiddenTimeGroupCount} ช่วงเวลา)
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </section>

                    {renderSelectedOfferSummary()}
                  </div>
                </div>
              </div>
            )}
          </section>

          <footer className="dashboard-footer">
            <span>NutTiew · Customer availability</span>
            <span>ข้อมูลช่วงเวลาที่พร้อมให้เลือกจากเซิร์ฟเวอร์เท่านั้น</span>
          </footer>
            </>
          )}

          <p role="status" className={cancelNotice || rescheduleNotice ? 'availability-surface' : undefined}>{cancelNotice || rescheduleNotice}</p>
          {!logoutBusy && !logoutError && rescheduleTarget && (
            <RescheduleDialog
              booking={rescheduleTarget}
              offers={rescheduleOffers}
              offersLoading={rescheduleOffersLoading}
              offersError={rescheduleOffersError}
              selectedSlotId={rescheduleSlotId}
              onSelectSlot={setRescheduleSlotId}
              onReloadOffers={() => void loadRescheduleOffers(rescheduleTarget.id)}
              busy={rescheduleBusy}
              feedback={rescheduleFeedback || csrfError}
              uncertain={rescheduleUncertain.has(rescheduleTarget.id)}
              enabled={canReschedule(rescheduleTarget) && !!csrfToken}
              close={closeReschedule}
              confirm={() => void confirmReschedule()}
              check={() => void checkReschedule()}
            />
          )}
          {!logoutBusy && !logoutError && cancelTarget && (
            <CancellationDialog booking={cancelTarget} busy={cancelBusy} feedback={cancelFeedback || csrfError}
              uncertain={uncertain.has(cancelTarget.id)} enabled={canCancel(cancelTarget) && !!csrfToken}
              close={closeCancel} confirm={() => void confirmCancellation()} check={() => void checkCancellation()} />
          )}
          {!logoutBusy && !logoutError && (selectedBookingDetail || detailError || loadingDetail) && (
            <div
              className="customer-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-heading"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setSelectedBookingDetail(null);
                  setDetailError('');
                }
              }}
            >
              <div className="customer-modal" id="customer-booking-detail-modal">
                <div className="modal-header">
                  <h2 id="modal-heading" tabIndex={-1}>รายละเอียดการจอง</h2>
                  <button
                    type="button"
                    className="modal-close-icon-btn"
                    data-testid="close-detail-btn"
                    aria-label="ปิดรายละเอียดการจอง"
                    onClick={() => { setSelectedBookingDetail(null); setDetailError(''); }}
                  >
                    ✕
                  </button>
                </div>
                {loadingDetail ? (
                  <div className="modal-content">
                    <p>กำลังโหลดรายละเอียด...</p>
                  </div>
                ) : detailError === 'BOOKING_NOT_FOUND' ? (
                  <div className="modal-content not-found-state">
                    <p role="alert">ไม่พบข้อมูลการจองนี้</p>
                    <button
                      type="button"
                      className="modal-close-btn"
                      data-testid="modal-back-btn"
                      onClick={() => { setSelectedBookingDetail(null); setDetailError(''); }}
                    >
                      กลับสู่รายการจอง
                    </button>
                  </div>
                ) : selectedBookingDetail ? (
                  <div className="modal-content">
                    <dl className="detail-dl">
                      <dt>รหัสการจอง (Booking ID)</dt>
                      <dd><code data-testid="detail-booking-id">{selectedBookingDetail.id}</code></dd>
                      <dt>ผู้สอน (Tutor)</dt>
                      <dd><strong>{selectedBookingDetail.tutorRef}</strong></dd>
                      <dt>วันและเวลาติว (Appointment Time)</dt>
                      <dd>
                        {bangkokLongDate(new Date(selectedBookingDetail.startsAt))}, {bangkokClock(new Date(selectedBookingDetail.startsAt))} – {bangkokClock(new Date(selectedBookingDetail.endsAt))} น. (Asia/Bangkok)
                      </dd>
                      <dt>สถานะ (Status)</dt>
                      <dd>
                        <span className={selectedBookingDetail.displayStatus === 'Booked' ? 'badge-booked' : 'badge-past'} data-testid="detail-status-badge">
                          {bookingLabel(selectedBookingDetail.displayStatus)}
                        </span>
                        {selectedBookingDetail.displayStatus === 'Past' && (
                          <span className="past-notice"> • การนัดหมายนี้สิ้นสุดลงแล้ว</span>
                        )}
                      </dd>
                      <dt>วันที่ทำรายการ (Booked At)</dt>
                      <dd>{bangkokLongDate(new Date(selectedBookingDetail.createdAt))} {bangkokClock(new Date(selectedBookingDetail.createdAt))} น.</dd>
                      {selectedBookingDetail.cancellationActor === 'Tutor' && selectedBookingDetail.cancellationReason && <>
                        <dt>เหตุผลที่ผู้สอนยกเลิก</dt>
                        <dd className="tutor-cancel-reason-detail" data-testid="detail-tutor-cancellation-reason">{selectedBookingDetail.cancellationReason}</dd>
                      </>}
                    </dl>
                    <div className="modal-actions cancellation-actions">
                      {renderReschedule(selectedBookingDetail)}
                      {renderCancel(selectedBookingDetail)}
                      <button
                        type="button"
                        className="modal-close-btn"
                        data-testid="close-detail-btn-bottom"
                        onClick={() => { setSelectedBookingDetail(null); setDetailError(''); }}
                      >
                        ปิด / กลับสู่รายการ
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
