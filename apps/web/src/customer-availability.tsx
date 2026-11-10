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
  status: 'Booked';
  displayStatus: 'Booked' | 'Past';
  createdAt: string;
};

export type CustomerBookingDetail = CustomerBookingItem & {
  updatedAt: string;
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
  const [activeTab, setActiveTab] = useState<'availability' | 'bookings'>('availability');
  const [myBookings, setMyBookings] = useState<CustomerBookingItem[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingsError, setBookingsError] = useState('');
  const [selectedBookingDetail, setSelectedBookingDetail] = useState<CustomerBookingDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
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
  const pendingGet = useRef<AbortController | null>(null);
  const pendingCsrf = useRef<AbortController | null>(null);
  const pendingPost = useRef<AbortController | null>(null);
  const pendingBookingsGet = useRef<AbortController | null>(null);
  const pendingDetailGet = useRef<AbortController | null>(null);
  const selectedRef = useRef<string | null>(null);
  const unknownOutcomeRef = useRef<UnknownBookingOutcome | null>(null);
  const selectedDayRef = useRef<string | null>(null);
  const viewedMonthRef = useRef<string | null>(null);
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
    csrfVersion.current++;
    bookingsVersion.current++;
    detailVersion.current++;
    pendingCsrf.current?.abort();
    pendingBookingsGet.current?.abort();
    pendingDetailGet.current?.abort();
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
    sessionEpoch.current++;
    pendingGet.current?.abort();
    pendingCsrf.current?.abort();
    pendingPost.current?.abort();
    pendingBookingsGet.current?.abort();
    pendingDetailGet.current?.abort();
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
          setExpandedTimeKeys({});
          setShowAllTimeGroups(false);
          setCalendarLiveMessage('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก');
        } else {
          const initialDay = nextIndex.earliestDayKey!;
          const initialMonth = nextIndex.earliestMonthKey!;
          if (selectedDayRef.current === null) {
            selectedDayRef.current = initialDay;
            setSelectedDayKey(initialDay);
            viewedMonthRef.current = initialMonth;
            setViewedMonthKey(initialMonth);
            setExpandedTimeKeys({});
            setShowAllTimeGroups(false);
            const initialCount = nextIndex.offersByDay.get(initialDay)?.length ?? 0;
            setCalendarLiveMessage(
              `เลือกวันที่ ${bangkokLongDateFromDayKey(initialDay)} พบ ${initialCount} ช่วงเวลา`,
            );
          } else {
            const activeDay = selectedDayRef.current;
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
        if (body?.data && typeof body.data.id === 'string') {
          setSelectedBookingDetail(body.data);
          setDetailError('');
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

  useEffect(() => {
    if (activeTab === 'bookings') {
      void fetchMyBookings();
    }
  }, [activeTab]);

  useEffect(() => {
    if (!selectedBookingDetail && !detailError && !loadingDetail) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedBookingDetail(null);
        setDetailError('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedBookingDetail, detailError, loadingDetail]);

  const handleLogout = () => {
    version.current++;
    csrfVersion.current++;
    bookingsVersion.current++;
    detailVersion.current++;
    sessionEpoch.current++;
    pendingGet.current?.abort();
    pendingCsrf.current?.abort();
    pendingPost.current?.abort();
    pendingBookingsGet.current?.abort();
    pendingDetailGet.current?.abort();
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
            onClick={(e) => { e.preventDefault(); setActiveTab('availability'); setMenuOpen(false); }}
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
            onClick={(e) => { e.preventDefault(); setActiveTab('bookings'); setMenuOpen(false); }}
          >
            <Icon kind="clock" />
            <span>การจองของฉัน</span>
            {activeTab === 'bookings' && <span className="nav-active-marker" aria-hidden="true" />}
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
            <strong>{activeTab === 'availability' ? 'เลือกช่วงเวลาติว' : 'การจองของฉัน'}</strong>
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

          {activeTab === 'bookings' ? (
            logoutBusy || logoutError ? (
              <div className="availability-surface" role="status">
                <p>เซสชันกำลังออกจากระบบหรือรอการยืนยัน ข้อมูลการจองถูกซ่อนเพื่อความปลอดภัย</p>
              </div>
            ) : (
            <section id="customer-bookings-section" className="customer-bookings-section" aria-labelledby="customer-bookings-heading">
              <header className="availability-hero">
                <div className="availability-hero-copy">
                  <h2 className="dashboard-kicker">YOUR RESERVATIONS</h2>
                  <h1 id="customer-bookings-heading">การจองของฉัน</h1>
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
                          className={b.displayStatus === 'Past' ? 'badge-past' : 'badge-booked'}
                          data-testid="customer-booking-status-badge"
                        >
                          {b.displayStatus === 'Past' ? 'สิ้นสุดแล้ว' : 'ยืนยันแล้ว'}
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
              <h1 id="availability-heading">เลือกช่วงเวลาติว</h1>
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
                                onClick={() => setShowAllTimeGroups(true)}
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
                  <h2 id="modal-heading">รายละเอียดการจอง</h2>
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
                        <span className={selectedBookingDetail.displayStatus === 'Past' ? 'badge-past' : 'badge-booked'} data-testid="detail-status-badge">
                          {selectedBookingDetail.displayStatus === 'Past' ? 'สิ้นสุดแล้ว' : 'ยืนยันแล้ว'}
                        </span>
                        {selectedBookingDetail.displayStatus === 'Past' && (
                          <span className="past-notice"> • การนัดหมายนี้สิ้นสุดลงแล้ว</span>
                        )}
                      </dd>
                      <dt>วันที่ทำรายการ (Booked At)</dt>
                      <dd>{bangkokLongDate(new Date(selectedBookingDetail.createdAt))} {bangkokClock(new Date(selectedBookingDetail.createdAt))} น.</dd>
                    </dl>
                    <div className="modal-actions">
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
