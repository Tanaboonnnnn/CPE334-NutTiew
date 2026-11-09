import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AllSlotsAgenda, SlotCalendar, bangkokClock, bangkokLongDate, type OfferedSlot } from './tutor-calendar.js';
import { TutorDashboardShell } from './tutor-dashboard-shell.js';

type SlotList = { data: OfferedSlot[]; meta: { requestId: string } };
export type TutorScheduleBooking = {
  id: string;
  slotId: string;
  tutorId: string;
  customerRef: string;
  startsAt: string;
  endsAt: string;
  status: 'Booked';
  displayStatus: 'Booked' | 'Past';
  createdAt: string;
};


/** A Bangkok wall-clock input must never be interpreted in the device's timezone. */
function bangkokStart(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const result = new Date(date + 'T' + time + ':00.000+07:00');
  return Number.isNaN(result.getTime()) ? null : result;
}
const bangkokTime = (instant: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);
const bangkokDayKey = (instant: Date) => new Date(instant.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

async function apiJson<T>(
  path: string, init: RequestInit = {}, externalSignal?: AbortSignal, expectedBinding?: string,
): Promise<T> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (externalSignal?.aborted) stop();
  else externalSignal?.addEventListener('abort', stop, { once: true });
  const timeout = window.setTimeout(stop, 10_000);
  try {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.code ?? 'HTTP_' + response.status);
    if (expectedBinding && response.headers.get('X-NutTiew-Session-Binding') !== expectedBinding) {
      throw new Error('SESSION_MISMATCH');
    }
    return payload as T;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', stop);
  }
}

/** A failed POST response may be lost even after the server has committed. */
function isUncertainWrite(error: unknown): boolean {
  if (error && typeof error === 'object' && 'name' in error &&
      (error.name === 'AbortError' || error.name === 'TypeError')) return true;
  return error instanceof Error && (
    error.message === 'SERVICE_UNAVAILABLE' ||
    error.message === 'HTTP_502' || error.message === 'HTTP_503' || error.message === 'HTTP_504'
  );
}

function userMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'SLOT_OVERLAP') return 'ช่วงเวลานี้ทับกับเวลาที่คุณเปิดไว้แล้ว กรุณาเลือกเวลาใหม่';
  if (code === 'SLOT_INVALID_TIME') return 'ต้องเลือกเวลาเริ่มที่ยังไม่ผ่านไปแล้วตามเวลาประเทศไทย';
  if (code === 'INVALID_INPUT') return 'วันที่หรือเวลาไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
  if (code === 'CSRF_DENIED' || code === 'ORIGIN_DENIED') return 'ไม่สามารถตรวจสอบความปลอดภัยของคำขอได้ กรุณาเข้าสู่ระบบใหม่';
  if (isUncertainWrite(error)) return 'ยังยืนยันผลการบันทึกไม่ได้ โปรดตรวจสอบรายการด้านล่างก่อนลองอีกครั้ง';
  return 'ไม่สามารถดำเนินการได้ โปรดลองอีกครั้ง';
}
function accessExpired(error: unknown) {
  return error instanceof Error && (
    error.message === 'UNAUTHENTICATED' || error.message === 'FORBIDDEN' ||
    error.message === 'SESSION_MISMATCH'
  );
}

export function TutorAvailability({
  onUnauthorized, accountId, sessionBinding, onLogout, logoutBusy, logoutError, canMutate,
}: {
  onUnauthorized: () => void;
  accountId: string;
  sessionBinding: string;
  onLogout: () => void | Promise<void>;
  logoutBusy: boolean;
  logoutError: string;
  canMutate: () => boolean;
}) {
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [calendarStart, setCalendarStart] = useState(() => bangkokDayKey(new Date()));
  const [slots, setSlots] = useState<OfferedSlot[]>([]);
  const [bookings, setBookings] = useState<TutorScheduleBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [bookingsError, setBookingsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [reconciliationPending, setReconciliationPending] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const version = useRef(0);
  const pendingGet = useRef<AbortController | null>(null);
  const pendingPost = useRef<AbortController | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const preview = bangkokStart(date, startTime);
  const end = preview ? new Date(preview.getTime() + 3_600_000) : null;

  const refresh = async (showLoading = false) => {
    const current = ++version.current;
    pendingGet.current?.abort();
    const controller = new AbortController();
    pendingGet.current = controller;
    if (showLoading) {
      setLoading(true);
      setLoadingBookings(true);
    }
    try {
      const [slotResult, bookingResult] = await Promise.all([
        apiJson<SlotList>('/api/v1/tutor/slots', {}, controller.signal, sessionBinding),
        apiJson<{ data: TutorScheduleBooking[]; meta: { requestId: string; evaluatedAt: string } }>(
          '/api/v1/tutor/bookings', {}, controller.signal, sessionBinding
        ),
      ]);
      if (version.current === current) {
        setSlots(slotResult.data);
        setBookings(bookingResult.data);
        setListError('');
        setBookingsError('');
        setReconciliationPending(false);
      }
    } catch (e) {
      if (version.current === current) {
        if (accessExpired(e)) {
          setSlots([]);
          setBookings([]);
          onUnauthorized();
        } else if (!controller.signal.aborted) {
          setListError('ไม่สามารถโหลดรายการเวลาติวได้ กรุณาลองใหม่');
          setBookingsError('ไม่สามารถโหลดรายการนัดหมายได้');
        }
      }
    } finally {
      if (version.current === current) {
        setLoading(false);
        setLoadingBookings(false);
        pendingGet.current = null;
      }
    }
  };

  useEffect(() => {
    void refresh(true);
    return () => {
      version.current++;
      pendingGet.current?.abort();
      pendingPost.current?.abort();
    };
    // This component is keyed by the authenticated User; remount on identity switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!canMutate() || creating || reconciliationPending) return;
    setNotice('');
    setError('');
    if (!preview) {
      setError('กรุณาเลือกวันที่และเวลาเริ่มให้ถูกต้อง');
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    const controller = new AbortController();
    pendingPost.current = controller;
    setCreating(true);
    try {
      const { csrfToken } = await apiJson<{ csrfToken: string }>('/api/v1/auth/csrf', {}, controller.signal);
      // Do not turn a CSRF response started before Logout into a new Slot
      // POST after the user has asked to hide/suspend the Tutor dashboard.
      if (!canMutate() || controller.signal.aborted) return;
      await apiJson('/api/v1/tutor/slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken,
          'X-NutTiew-Expected-Session-Binding': sessionBinding,
        },
        body: JSON.stringify({ startsAt: preview.toISOString() }),
      }, controller.signal);
      if (!controller.signal.aborted) {
        setNotice('บันทึกเวลาติวสำเร็จ');
        setCalendarStart(date);
        await refresh();
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        if (accessExpired(e)) { setSlots([]); onUnauthorized(); }
        else {
          const unknownOutcome = isUncertainWrite(e);
          if (unknownOutcome) setReconciliationPending(true);
          setError(userMessage(e));
          queueMicrotask(() => errorRef.current?.focus());
          if (unknownOutcome) {
            // Hold duplicate submission until an authenticated own-list read
            // has reconciled the possibly committed POST. On GET failure, the
            // existing "โหลดอีกครั้ง" control is the only recovery path.
            await refresh(true);
          }
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setCreating(false);
        pendingPost.current = null;
      }
    }
  };

  return <TutorDashboardShell accountId={accountId} onLogout={onLogout} logoutBusy={logoutBusy} logoutError={logoutError}>
    <section className="dashboard-overview" aria-label="สรุปเวลาติวจริงจากฐานข้อมูล">
      <div className="overview-tile">
        <span className="overview-label">ช่วงเวลาที่เปิดไว้ทั้งหมด</span>
        <div><strong>{loading || listError ? '—' : slots.length}</strong><span>ช่วงเวลา</span></div>
        <small>นับจาก Slot ของบัญชีนี้เท่านั้น</small>
      </div>
      <div className="overview-tile overview-help">
        <span className="overview-label">ระยะเวลาต่อช่วง</span>
        <div><strong>60</strong><span>นาที</span></div>
        <small>เลือกเวลาเริ่มได้ทุกนาที ไม่จำกัดช่วงเวลาทำการ</small>
      </div>
      <div className="overview-tile overview-timezone">
        <span className="overview-label">เขตเวลาที่ใช้</span>
        <div><strong className="overview-timezone-text">UTC+07:00</strong></div>
        <small>Asia/Bangkok • ไม่ขึ้นกับ Timezone ของอุปกรณ์</small>
      </div>
    </section>

    <div className="dashboard-workspace">
      {loading || listError
        ? <div className="dashboard-card loading-agenda" role="status">
          {loading ? 'กำลังโหลดปฏิทินเวลาติว…' : 'ยังไม่สามารถแสดงปฏิทินได้ กรุณาโหลดรายการเวลาติวอีกครั้ง'}
        </div>
        : <SlotCalendar slots={slots} startDay={calendarStart} onChangeDay={setCalendarStart}/>}
      <section className="dashboard-card create-card" aria-labelledby="create-slot-heading" id="create-slot">
        <div className="create-card-heading">
          <p className="dashboard-kicker">NEW AVAILABILITY</p>
          <h2 id="create-slot-heading">เปิดช่วงเวลาติวใหม่</h2>
          <p>เลือกวันที่และเวลาเริ่ม ระบบจะกำหนดเวลาสิ้นสุดให้อัตโนมัติ</p>
        </div>
        <form className="slot-form" onSubmit={create}>
          <div className="slot-fields">
            <div>
              <label htmlFor="slot-date">วันที่</label>
              <input id="slot-date" type="date" value={date} onChange={e => setDate(e.target.value)}
                aria-invalid={!!error} aria-describedby={error ? 'slot-error' : undefined} required />
            </div>
            <div>
              <label htmlFor="slot-start">เวลาเริ่ม</label>
              <input id="slot-start" type="time" step={60} value={startTime} onChange={e => setStartTime(e.target.value)}
                aria-invalid={!!error} aria-describedby={error ? 'slot-error' : undefined} required />
            </div>
          </div>
          <div className="slot-preview" aria-live="polite">
            <span>เวลาสิ้นสุด (+60 นาที)</span>
            <output aria-label="เวลาสิ้นสุด">{end ? bangkokTime(end) : '—'}</output>
            {end && bangkokDayKey(end) !== date && <small>สิ้นสุดในวันถัดไป</small>}
          </div>
          <button type="submit" className="create-submit" disabled={!canMutate() || creating || reconciliationPending}>
            {creating ? 'กำลังบันทึก…' : 'เพิ่มเวลาติว'}
          </button>
          {error && <p id="slot-error" className="error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
          {notice && <p className="success" role="status">{notice}</p>}
        </form>
        <div className="create-privacy-note">
          <span className="privacy-shield" aria-hidden="true">✓</span>
          ตารางเวลานี้แสดงให้เฉพาะบัญชี Tutor ของคุณ
        </div>
      </section>
    </div>

    {loading ? <div className="dashboard-card loading-agenda" role="status">กำลังโหลดรายการเวลาติว…</div> : listError
      ? <div className="dashboard-list-error" role="alert">
        <p className="error">ไม่สามารถโหลดรายการเวลาติวได้ กรุณาลองใหม่</p>
        <button className="retry-button" type="button" onClick={() => void refresh(true)}>โหลดอีกครั้ง</button>
      </div>
      : <AllSlotsAgenda slots={slots}/>}

    <section className="dashboard-card agenda-card" id="tutor-schedule-bookings-section" aria-labelledby="schedule-bookings-title">
      <div className="agenda-header">
        <div>
          <p className="dashboard-kicker">SCHEDULE BOOKINGS</p>
          <h2 id="schedule-bookings-title">รายการนัดหมายบนตารางสอนของคุณ</h2>
          <p className="agenda-subtitle">การจองที่ได้รับการยืนยันบนช่วงเวลาที่คุณเปิดสอน</p>
        </div>
        <span className="agenda-count">{bookings.length} รายการ</span>
      </div>
      {loadingBookings ? (
        <p className="empty-slots">กำลังโหลดรายการนัดหมาย...</p>
      ) : bookingsError ? (
        <div className="dashboard-list-error" role="alert">
          <p className="error">{bookingsError}</p>
          <button className="retry-button" type="button" onClick={() => void refresh(true)}>โหลดอีกครั้ง</button>
        </div>
      ) : bookings.length === 0 ? (
        <p className="empty-slots">ยังไม่มีผู้จองในช่วงเวลาที่คุณเปิดสอน</p>
      ) : (
        <ul className="slot-list" aria-label="รายการนัดหมายบนตารางสอน">
          {bookings.map(b => {
            const start = new Date(b.startsAt);
            const end = new Date(b.endsAt);
            return (
              <li key={b.id} className="slot-item customer-booking-item" data-booking-id={b.id}>
                <div className="agenda-color-mark" style={{ background: '#202b44' }} aria-hidden="true" />
                <div className="agenda-row-main">
                  <div className="slot-item-date">{bangkokLongDate(start)}</div>
                  <div className="slot-item-hours">
                    <time dateTime={b.startsAt}>{bangkokClock(start)}</time>
                    <span aria-hidden="true">–</span>
                    <time dateTime={b.endsAt}>{bangkokClock(end)}</time> น. (Asia/Bangkok)
                  </div>
                  <div style={{ fontSize: '13px', color: '#58697f', marginTop: '4px' }}>
                    ผู้จอง: <strong data-testid="tutor-booking-customer-ref">{b.customerRef}</strong> • รหัสการจอง: <code data-testid="schedule-booking-id">{b.id}</code>
                  </div>
                </div>
                <div className="slot-tags">
                  <span className={b.displayStatus === 'Past' ? 'badge-past' : 'badge-booked'} data-testid="tutor-booking-status-badge">
                    {b.displayStatus === 'Past' ? 'สิ้นสุดแล้ว (Past)' : 'มีนัดหมาย (Booked)'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  </TutorDashboardShell>;
}
