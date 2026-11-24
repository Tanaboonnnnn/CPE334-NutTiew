import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { AllSlotsAgenda, SlotCalendar, bangkokClock, bangkokLongDate, isFutureOffer, type OfferedSlot, type TutorSlot } from './tutor-calendar.js';
import { TutorDashboardShell } from './tutor-dashboard-shell.js';
import { computeTutorKpis, selectNextTutorLesson, type TutorBookingSummary } from './tutor-metrics.js';

type SlotList = { data: TutorSlot[]; meta: { requestId:string; evaluatedAt:string } };
export type TutorScheduleBooking = TutorBookingSummary;
type TutorSummaryActiveBooking = {
  id: string;
  slotId: string;
  customerRef: string;
  startsAt: string;
  endsAt: string;
  status: 'Booked';
  displayStatus: 'Booked';
  createdAt: string;
};
type TutorSummaryPastBooking = {
  id: string;
  slotId: string;
  customerRef: string;
  startsAt: string;
  endsAt: string;
  status: 'Booked';
  displayStatus: 'Past';
  createdAt: string;
};
type TutorSummaryCancelled = Omit<TutorSummaryPastBooking, 'status' | 'displayStatus'> & {
  status: 'Cancelled';
  displayStatus: 'Cancelled';
  cancellationActor: 'Customer' | 'Tutor';
  cancelledAt: string;
};
type TutorSummaryPayload = {
  data: {
    upcomingBookedCount: number;
    upcomingBooked: TutorSummaryActiveBooking[];
    inProgressBookedCount: number;
    inProgressBooked: TutorSummaryActiveBooking[];
    pastBookedCount: number;
    pastBooked: TutorSummaryPastBooking[];
    cancelledCount: number;
    cancelled: TutorSummaryCancelled[];
  };
  meta: { requestId: string; evaluatedAt: string };
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

type CancelState = 'editing' | 'stale' | 'unknown';

function TutorCancelDialog({ booking, reason, onReason, onDismiss, onConfirm, onReconcile, busy, state, message }: {
  booking: TutorScheduleBooking; reason: string; onReason: (reason: string) => void;
  onDismiss: () => void; onConfirm: (event: FormEvent) => void; onReconcile: () => void;
  busy: boolean; state: CancelState; message: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const el = dialog.current;
    if (!el) return;
    el.showModal();
    title.current?.focus();
    return () => { if (el.open) el.close(); };
  }, []);
  return <dialog ref={dialog} className="tutor-cancel-dialog" aria-modal="true"
    aria-labelledby="tutor-cancel-title" aria-describedby="tutor-cancel-description" aria-busy={busy}
    onCancel={e => { e.preventDefault(); if (!busy && state !== 'unknown') onDismiss(); }}>
    <form noValidate onSubmit={onConfirm}>
      <h2 id="tutor-cancel-title" ref={title} tabIndex={-1}>ยกเลิกนัดหมาย</h2>
      <p>{bangkokLongDate(new Date(booking.startsAt))} · {bangkokClock(new Date(booking.startsAt))}–{bangkokClock(new Date(booking.endsAt))} น. (Asia/Bangkok) · {booking.customerRef}</p>
      <p id="tutor-cancel-description">ยกเลิกได้ก่อนเริ่มอย่างน้อย 60 นาที ช่วงเวลานี้จะถูกถอนและไม่เปิดให้จองอีก ผู้จองจะได้รับเหตุผลเป็นการส่วนตัว</p>
      <label htmlFor="tutor-cancel-reason">เหตุผลที่ยกเลิก (จำเป็น)</label>
      <textarea id="tutor-cancel-reason" value={reason} onChange={e => onReason(e.target.value)} rows={4}
        aria-required="true" aria-invalid={state === 'editing' && !!message ? true : undefined}
        aria-describedby="tutor-cancel-hint tutor-cancel-message" disabled={busy || state !== 'editing'} />
      <small id="tutor-cancel-hint">ใส่เหตุผลที่มีตัวอักษรอย่างน้อยหนึ่งตัว ความยาวไม่เกิน 500 อักขระ Unicode</small>
      <p id="tutor-cancel-message" role="status" className="tutor-cancel-message">{message}</p>
      <div className="tutor-cancel-actions">
        {state !== 'unknown' && <button type="button" className="retry-button" disabled={busy} onClick={onDismiss}>ปิด</button>}
        {state === 'unknown'
          ? <button type="button" className="retry-button" disabled={busy} onClick={onReconcile}>ตรวจสอบรายการนัดหมาย</button>
          : <button type="submit" className="tutor-cancel-confirm" disabled={busy || state !== 'editing'}>ยืนยันการยกเลิก</button>}
      </div>
    </form>
  </dialog>;
}

function tutorCancellationEligible(booking: TutorScheduleBooking, evaluatedAt: string) {
  // A server snapshot controls presentation only; the live DB clock controls the write.
  return booking.displayStatus === 'Booked' && Date.parse(booking.startsAt) - Date.parse(evaluatedAt) >= 60 * 60_000;
}

type WithdrawDialogState = 'editing'|'unknown'|'stale';

function WithdrawConfirmation({slot, state, busy, message, close, confirm, reconcile}: {
  slot:TutorSlot; state:WithdrawDialogState; busy:boolean; message:string;
  close:()=>void; confirm:()=>void; reconcile:()=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  useLayoutEffect(()=>{
    const node=dialog.current;
    if(!node)return;
    node.showModal();
    heading.current?.focus();
    return ()=>{if(node.open)node.close();};
  },[]);
  return <dialog ref={dialog} className="tutor-cancel-dialog" aria-modal="true" aria-busy={busy}
    aria-labelledby="withdraw-title" aria-describedby="withdraw-description"
    onCancel={e=>{e.preventDefault();if(!busy&&state!=='unknown')close();}}>
    <form onSubmit={e=>{e.preventDefault();if(state==='editing'&&!busy)confirm();}}>
      <h2 id="withdraw-title" tabIndex={-1} ref={heading}>ถอนช่วงเวลาติว</h2>
      <p>{bangkokLongDate(new Date(slot.startsAt))} · {bangkokClock(new Date(slot.startsAt))}–{bangkokClock(new Date(slot.endsAt))} น. (Asia/Bangkok)</p>
      <p id="withdraw-description">ผู้เรียนจะจองช่วงเวลานี้ไม่ได้ ระบบจะเก็บรายการไว้เป็นประวัติ และเปิดช่วงเวลาเดิมด้วยรหัสนี้อีกไม่ได้</p>
      <p role="status" className="tutor-cancel-message">{message}</p>
      <div className="tutor-cancel-actions">
        {state!=='unknown' && <button type="button" className="retry-button" onClick={close} disabled={busy}>ปิด</button>}
        {state==='unknown' ?
          <button type="button" className="retry-button" onClick={reconcile} disabled={busy}>ตรวจสอบรายการช่วงเวลา</button>
          :<button type="submit" className="tutor-cancel-confirm" disabled={busy||state!=='editing'}>ยืนยันถอนช่วงเวลา</button>}
      </div>
    </form>
  </dialog>;
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
  const [slots, setSlots] = useState<TutorSlot[]>([]);
  const [slotsEvaluatedAt, setSlotsEvaluatedAt]=useState('');
  const [withdrawTarget, setWithdrawTarget]=useState<TutorSlot|null>(null);
  const [withdrawState,setWithdrawState]=useState<WithdrawDialogState>('editing');
  const [withdrawMessage,setWithdrawMessage]=useState('');
  const [withdrawNotice,setWithdrawNotice]=useState('');
  const [withdrawBusy,setWithdrawBusy]=useState(false);
  const pendingWithdrawal=useRef<AbortController|null>(null);
  const withdrawOpener=useRef<HTMLButtonElement|null>(null);
  const restoreWithdrawFocus=useRef(false);

  useEffect(()=>{
    if(withdrawTarget||!restoreWithdrawFocus.current)return;
    restoreWithdrawFocus.current=false;
    const button=withdrawOpener.current;
    withdrawOpener.current=null;
    if(button?.isConnected&&!button.disabled)button.focus();
    else document.getElementById('agenda-title')?.focus();
  },[withdrawTarget]);
  const [bookings, setBookings] = useState<TutorScheduleBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [bookingsError, setBookingsError] = useState('');
  const [bookingsEvaluatedAt, setBookingsEvaluatedAt] = useState('');
  const [summary, setSummary] = useState<TutorSummaryPayload['data'] | null>(null);
  const [summaryEvaluatedAt, setSummaryEvaluatedAt] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [cancelTarget, setCancelTarget] = useState<TutorScheduleBooking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelMessage, setCancelMessage] = useState('');
  const [cancelNotice, setCancelNotice] = useState('');
  const [cancelState, setCancelState] = useState<CancelState>('editing');
  const [cancelBusy, setCancelBusy] = useState(false);
  const cancelInFlight = useRef<AbortController | null>(null);
  const cancelOpener = useRef<HTMLButtonElement | null>(null);
  const scheduleHeading = useRef<HTMLHeadingElement>(null);
  const focusAfterCancel = useRef<{ opener: HTMLButtonElement | null; preferHeading: boolean } | null>(null);

  useEffect(() => {
    if (cancelTarget || !focusAfterCancel.current) return;
    // Run after the native modal closes; it may restore its own previous focus.
    const { opener, preferHeading } = focusAfterCancel.current;
    focusAfterCancel.current = null;
    if (!preferHeading && opener?.isConnected && !opener.disabled) opener.focus();
    else scheduleHeading.current?.focus();
  }, [cancelTarget]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [reconciliationPending, setReconciliationPending] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const slotsVersion = useRef(0);
  const bookingsVersion = useRef(0);
  const summaryVersion = useRef(0);
  const pendingSlotsGet = useRef<AbortController | null>(null);
  const pendingBookingsGet = useRef<AbortController | null>(null);
  const pendingSummaryGet = useRef<AbortController | null>(null);
  const pendingPost = useRef<AbortController | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const preview = bangkokStart(date, startTime);
  const end = preview ? new Date(preview.getTime() + 3_600_000) : null;

  // Derive KPI metrics & Next Booked Lesson strictly from authenticated API state.
  const nowMs = Date.now();
  const activeSlots=slots.filter((slot):slot is OfferedSlot=>slot.lifecycle==='Offered');
  const { offeredCount, occupiedCount, slotsThisWeek } = computeTutorKpis(activeSlots, nowMs);
  const nextLesson = selectNextTutorLesson(bookings, nowMs);

  const refreshSlots = async (showLoading = false) => {
    const current = ++slotsVersion.current;
    pendingSlotsGet.current?.abort();
    const controller = new AbortController();
    pendingSlotsGet.current = controller;
    if (showLoading) {
      setLoading(true);
    }
    try {
      const slotResult = await apiJson<SlotList>(
        '/api/v1/tutor/slots', {}, controller.signal, sessionBinding
      );
      if (slotsVersion.current === current) {
        setSlots(slotResult.data);
        setSlotsEvaluatedAt(slotResult.meta.evaluatedAt);
        setListError('');
        setReconciliationPending(false);
        return slotResult;
      }
    } catch (e) {
      if (slotsVersion.current === current) {
        if (accessExpired(e)) {
          setSlots([]);
          onUnauthorized();
        } else if (!controller.signal.aborted) {
          setListError('ไม่สามารถโหลดรายการเวลาติวได้ กรุณาลองใหม่');
        }
      }
    } finally {
      if (slotsVersion.current === current) {
        setLoading(false);
        pendingSlotsGet.current = null;
      }
    }
    return null;
  };

  const refreshBookings = async (showLoading = false) => {
    const current = ++bookingsVersion.current;
    pendingBookingsGet.current?.abort();
    const controller = new AbortController();
    pendingBookingsGet.current = controller;
    if (showLoading) {
      setLoadingBookings(true);
    }
    try {
      const bookingResult = await apiJson<{ data: TutorScheduleBooking[]; meta: { requestId: string; evaluatedAt: string } }>(
        '/api/v1/tutor/bookings', {}, controller.signal, sessionBinding
      );
      if (bookingsVersion.current === current) {
        setBookings(bookingResult.data);
        setBookingsEvaluatedAt(bookingResult.meta.evaluatedAt);
        setBookingsError('');
        return bookingResult;
      }
    } catch (e) {
      if (bookingsVersion.current === current) {
        if (accessExpired(e)) {
          setBookings([]);
          onUnauthorized();
        } else if (!controller.signal.aborted) {
          setBookingsError('ไม่สามารถโหลดรายการนัดหมายได้');
        }
      }
    } finally {
      if (bookingsVersion.current === current) {
        setLoadingBookings(false);
        pendingBookingsGet.current = null;
      }
    }
    return null;
  };

  const refreshSummary = async (showLoading = false) => {
    const current = ++summaryVersion.current;
    pendingSummaryGet.current?.abort();
    const controller = new AbortController();
    pendingSummaryGet.current = controller;
    if (showLoading) {
      setLoadingSummary(true);
    }
    try {
      const summaryResult = await apiJson<TutorSummaryPayload>(
        '/api/v1/tutor/summary', {}, controller.signal, sessionBinding
      );
      if (summaryVersion.current === current) {
        setSummary(summaryResult.data);
        setSummaryEvaluatedAt(summaryResult.meta.evaluatedAt);
        setSummaryError('');
        return summaryResult;
      }
    } catch (e) {
      if (summaryVersion.current === current) {
        if (accessExpired(e)) {
          setSummary(null);
          setSummaryEvaluatedAt('');
          onUnauthorized();
        } else if (!controller.signal.aborted) {
          setSummary(null);
          setSummaryEvaluatedAt('');
          setSummaryError('ไม่สามารถโหลดสรุปนัดหมายได้ กรุณาลองอีกครั้ง');
        }
      }
    } finally {
      if (summaryVersion.current === current) {
        setLoadingSummary(false);
        pendingSummaryGet.current = null;
      }
    }
    return null;
  };

  const refresh = async (showLoading = false) => {
    await Promise.allSettled([refreshSlots(showLoading), refreshBookings(showLoading), refreshSummary(showLoading)]);
  };

  useEffect(() => {
    void refresh(true);
    return () => {
      slotsVersion.current++;
      bookingsVersion.current++;
      summaryVersion.current++;
      pendingSlotsGet.current?.abort();
      pendingBookingsGet.current?.abort();
      pendingSummaryGet.current?.abort();
      pendingPost.current?.abort();
      cancelInFlight.current?.abort();
      pendingWithdrawal.current?.abort();
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

  const dismissCancellation = (preferHeading = false) => {
    focusAfterCancel.current = { opener: cancelOpener.current, preferHeading };
    cancelOpener.current = null;
    setCancelTarget(null);
    setCancelReason('');
    setCancelMessage('');
    setCancelState('editing');
  };

  const verifyCancellationOutcome = async () => {
    if (!cancelTarget || cancelInFlight.current || cancelBusy || !canMutate()) return;
    setCancelBusy(true);
    try {
      const result = await refreshBookings();
      if (!result || !canMutate()) {
        setCancelMessage('ยังตรวจสอบรายการไม่ได้ กรุณาลองโหลดอีกครั้ง');
        return;
      }
      const remaining = result.data.find(b => b.id === cancelTarget.id);
      if (!remaining) {
        setCancelNotice('ไม่พบนัดหมายนี้ในตารางล่าสุด');
        dismissCancellation(true);
        await refreshSlots();
      } else if (!tutorCancellationEligible(remaining, result.meta.evaluatedAt)) {
        setCancelState('stale');
        setCancelMessage('ขณะนี้ไม่สามารถยกเลิกนัดหมายนี้ได้แล้ว');
      } else {
        setCancelTarget(remaining);
        setCancelState('editing');
        setCancelMessage('นัดหมายยังอยู่ในตาราง ตรวจสอบเหตุผลก่อนยืนยันอีกครั้ง');
      }
    } finally {
      setCancelBusy(false);
    }
  };

  const confirmTutorCancellation = async (event: FormEvent) => {
    event.preventDefault();
    if (!cancelTarget || cancelInFlight.current || cancelState !== 'editing' || cancelBusy || !canMutate()) return;
    const reason = cancelReason.trim();
    if (!/\p{L}/u.test(reason) || /[\u0000\uD800-\uDFFF]/u.test(reason) || [...reason].length > 500) {
      setCancelMessage('กรุณาใส่เหตุผลที่มีตัวอักษรและไม่เกิน 500 อักขระ Unicode');
      document.getElementById('tutor-cancel-reason')?.focus();
      return;
    }
    const controller = new AbortController();
    cancelInFlight.current = controller;
    setCancelMessage('');
    setCancelBusy(true);
    let posted = false;
    try {
      const { csrfToken } = await apiJson<{ csrfToken: string }>('/api/v1/auth/csrf', {}, controller.signal);
      if (!canMutate() || controller.signal.aborted) return;
      posted = true;
      const { data } = await apiJson<{data:{id:string;slotId:string;status:string;cancelledAt:string}}>(
        '/api/v1/tutor/bookings/'+encodeURIComponent(cancelTarget.id)+'/cancel', {
          method:'POST', headers:{
            'Content-Type':'application/json', 'X-CSRF-Token':csrfToken,
            'X-NutTiew-Expected-Session-Binding':sessionBinding,
          }, body:JSON.stringify({reason}),
        }, controller.signal, sessionBinding);
      if (!data || data.id !== cancelTarget.id || data.slotId !== cancelTarget.slotId || data.status !== 'Cancelled' || !Number.isFinite(Date.parse(data.cancelledAt))) {
        throw new Error('MUTATION_OUTCOME_UNKNOWN');
      }
      if (!canMutate() || controller.signal.aborted) return;
      setBookings(previous => previous.filter(b => b.id !== data.id));
      setSlots(previous => previous.map(slot=>slot.id===data.slotId
        ? {...slot,lifecycle:'Withdrawn',occupancy:'Unoccupied',withdrawnAt:data.cancelledAt}:slot));
      setCancelNotice('ยกเลิกนัดหมายและถอนช่วงเวลาเรียบร้อยแล้ว');
      dismissCancellation(true);
      await refresh();
    } catch (e) {
      if (!canMutate() || controller.signal.aborted) return;
      const code = e instanceof Error ? e.message : '';
      if (accessExpired(e) || code === 'SESSION_BINDING_MISMATCH') {
        setBookings([]);
        setSlots([]);
        dismissCancellation(true);
        onUnauthorized();
      } else if (posted && (isUncertainWrite(e) || code === 'MUTATION_OUTCOME_UNKNOWN')) {
        setCancelState('unknown');
        setCancelMessage('ยังยืนยันผลการยกเลิกไม่ได้ กรุณาตรวจสอบรายการนัดหมายก่อนลองอีกครั้ง');
      } else if (['CANCELLATION_WINDOW_CLOSED','BOOKING_NOT_CANCELLABLE','BOOKING_NOT_FOUND'].includes(code)) {
        setCancelState('stale');
        setCancelMessage(code === 'CANCELLATION_WINDOW_CLOSED'
          ? 'ไม่สามารถยกเลิกได้เมื่อเหลือไม่ถึง 60 นาที'
          : 'ไม่สามารถยกเลิกนัดหมายนี้ได้แล้ว');
        await refreshBookings();
      } else {
        setCancelMessage(code === 'INVALID_INPUT' ? 'กรุณาตรวจสอบเหตุผลที่ยกเลิก' : 'ยกเลิกไม่สำเร็จ กรุณาลองอีกครั้ง');
      }
    } finally {
      if (!controller.signal.aborted) {
        cancelInFlight.current = null;
        setCancelBusy(false);
      }
    }
  };

  const dismissWithdraw = () => {
    restoreWithdrawFocus.current=true;
    setWithdrawTarget(null);
    setWithdrawState('editing');
    setWithdrawMessage('');
  };
  const withdrawConflictMessage=(code:string)=>{
    if(code==='SLOT_OCCUPIED')return 'ช่วงนี้มีผู้จองแล้ว ต้องยกเลิกนัดหมายก่อน';
    if(code==='SLOT_ALREADY_WITHDRAWN')return 'ช่วงเวลานี้ถูกถอนไปแล้ว';
    if(code==='SLOT_NOT_WITHDRAWABLE')return 'ถอนช่วงที่เริ่มแล้วหรือผ่านไปแล้วไม่ได้';
    return 'ไม่พบช่วงเวลาที่สามารถถอนได้';
  };
  const reconcileWithdraw = async () => {
    if(!withdrawTarget||withdrawBusy||!canMutate())return;
    setWithdrawBusy(true);
    try{
      const read=await refreshSlots();
      if(!read||!canMutate()){
        setWithdrawMessage('ยังตรวจสอบรายการไม่ได้ ลองโหลดอีกครั้ง');
        return;
      }
      const slot=read.data.find(s=>s.id===withdrawTarget.id);
      if(slot?.lifecycle==='Withdrawn'){
        setWithdrawNotice('ตรวจสอบแล้ว: ช่วงเวลานี้ถูกถอนและยังอยู่ในประวัติ');
        dismissWithdraw();
      }else if(!slot||!isFutureOffer(slot,read.meta.evaluatedAt)||slot.occupancy!=='Unoccupied'){
        setWithdrawState('stale');
        setWithdrawMessage(withdrawConflictMessage(slot?.occupancy==='Occupied'?'SLOT_OCCUPIED':'SLOT_NOT_WITHDRAWABLE'));
      }else{
        setWithdrawTarget(slot);
        setWithdrawState('editing');
        setWithdrawMessage('ช่วงเวลายังเปิดอยู่ ตรวจสอบก่อนกดยืนยันอีกครั้ง');
      }
    }finally{setWithdrawBusy(false);}
  };
  const confirmWithdraw = async () => {
    if(!withdrawTarget||withdrawState!=='editing'||withdrawBusy||pendingWithdrawal.current||!canMutate())return;
    const controller=new AbortController();
    pendingWithdrawal.current=controller;
    setWithdrawBusy(true);
    setWithdrawMessage('');
    let posted=false;
    try{
      const {csrfToken}=await apiJson<{csrfToken:string}>('/api/v1/auth/csrf',{},controller.signal);
      if(!canMutate()||controller.signal.aborted)return;
      posted=true;
      const {data}=await apiJson<{data:TutorSlot}>('/api/v1/tutor/slots/'+encodeURIComponent(withdrawTarget.id)+'/withdraw',{
        method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken,
          'X-NutTiew-Expected-Session-Binding':sessionBinding},body:'{}',
      },controller.signal,sessionBinding);
      if(!data||data.id!==withdrawTarget.id||data.lifecycle!=='Withdrawn'||data.occupancy!=='Unoccupied'||
        !Number.isFinite(Date.parse(data.withdrawnAt)))throw new Error('MUTATION_OUTCOME_UNKNOWN');
      if(!canMutate()||controller.signal.aborted)return;
      setSlots(previous=>previous.map(s=>s.id===data.id?data:s));
      setWithdrawNotice('ถอนช่วงเวลาแล้ว เก็บรายการไว้ในประวัติ');
      dismissWithdraw();
      await refreshSlots();
    }catch(e){
      if(!canMutate()||controller.signal.aborted)return;
      const code=e instanceof Error?e.message:'';
      if(accessExpired(e)||code==='SESSION_BINDING_MISMATCH'){
        setSlots([]);
        setBookings([]);
        dismissWithdraw();
        onUnauthorized();
      }else if(posted&&(isUncertainWrite(e)||code==='MUTATION_OUTCOME_UNKNOWN')){
        setWithdrawState('unknown');
        setWithdrawMessage('ยังยืนยันผลไม่ได้ กรุณาตรวจสอบรายการช่วงเวลาก่อนลองอีกครั้ง');
      }else if(['SLOT_OCCUPIED','SLOT_ALREADY_WITHDRAWN','SLOT_NOT_WITHDRAWABLE','SLOT_NOT_FOUND'].includes(code)){
        setWithdrawState('stale');
        setWithdrawMessage(withdrawConflictMessage(code));
        await refreshSlots();
      }else{
        setWithdrawMessage('ถอนช่วงเวลาไม่สำเร็จ กรุณาลองอีกครั้ง');
      }
    }finally{
      pendingWithdrawal.current=null;
      if(!controller.signal.aborted)setWithdrawBusy(false);
    }
  };

  return <TutorDashboardShell accountId={accountId} onLogout={onLogout} logoutBusy={logoutBusy} logoutError={logoutError}>
    <section className="dashboard-overview" aria-label="สรุปเวลาติวจริงจากฐานข้อมูล">
      <div className="overview-tile">
        <span className="overview-label">ช่วงเวลาที่เปิดไว้ทั้งหมด</span>
        <div><strong>{loading || listError ? '—' : offeredCount}</strong><span>ช่วงเวลา</span></div>
        <small>นับจาก Slot ของบัญชีนี้เท่านั้น (60 นาที/ช่วง)</small>
      </div>
      <div className="overview-tile overview-help">
        <span className="overview-label">ช่วงเวลาที่มีผู้จองแล้ว</span>
        <div><strong>{loading || listError ? '—' : `${occupiedCount} / ${offeredCount}`}</strong><span>มีผู้จอง</span></div>
        <small>สถานะ Occupied บนตารางของคุณ</small>
      </div>
      <div className="overview-tile overview-timezone">
        <span className="overview-label">ช่วงเวลาในสัปดาห์นี้</span>
        <div><strong>{loading || listError ? '—' : `${slotsThisWeek} ช่วง`}</strong><span>สัปดาห์นี้</span></div>
        <small>จ–อา ตามเวลาไทย · UTC+07:00</small>
      </div>
    </section>

    <section className="dashboard-card next-lesson-spotlight" data-testid="tutor-next-booked-lesson" aria-labelledby="next-lesson-heading">
      <div className="next-lesson-header">
        <div>
          <p className="dashboard-kicker">
            {nextLesson?.phase === 'in-progress' ? 'SCHEDULED WINDOW NOW' : 'NEXT BOOKED LESSON'}
          </p>
          <h2 id="next-lesson-heading">
            {nextLesson?.phase === 'in-progress' ? 'นัดหมายที่อยู่ในช่วงเวลาตามตาราง' : 'นัดหมายติวที่ใกล้ที่สุด'}
          </h2>
        </div>
        <a className="next-lesson-jump" href="#tutor-schedule-bookings-section">ดูรายการนัดหมายทั้งหมด ↓</a>
      </div>
      {loadingBookings ? (
        <p className="next-lesson-empty" role="status">กำลังโหลดข้อมูลนัดหมาย…</p>
      ) : bookingsError ? (
        <div className="dashboard-list-error" role="alert">
          <p className="error">{bookingsError}</p>
          <button className="retry-button" type="button" onClick={() => void refreshBookings(true)}>โหลดรายการนัดหมายใหม่</button>
        </div>
      ) : nextLesson ? (
        <div className="next-lesson-body">
          <div className="next-lesson-datetime">
            <strong>{bangkokLongDate(new Date(nextLesson.lesson.startsAt))}</strong>
            <span>
              <time dateTime={nextLesson.lesson.startsAt}>{bangkokClock(new Date(nextLesson.lesson.startsAt))}</time>
              <span aria-hidden="true"> – </span>
              <time dateTime={nextLesson.lesson.endsAt}>{bangkokClock(new Date(nextLesson.lesson.endsAt))}</time> น. (Asia/Bangkok)
            </span>
          </div>
          <div className="next-lesson-meta">
            <span>ผู้จอง: <strong>{nextLesson.lesson.customerRef}</strong></span>
            <span>รหัส: <code>{nextLesson.lesson.id}</code></span>
            <span className={nextLesson.phase === 'in-progress' ? 'badge-occupied' : 'badge-booked'}>
              {nextLesson.phase === 'in-progress' ? 'อยู่ในช่วงเวลานัดหมาย (Booked)' : 'มีนัดหมาย (Booked)'}
            </span>
          </div>
        </div>
      ) : (
        <div className="next-lesson-empty-row">
          <p className="next-lesson-empty">ยังไม่มีนัดหมายติวที่กำลังจะมาถึง</p>
          <button type="button" className="next-lesson-cta" onClick={() => document.getElementById('slot-date')?.focus()}>
            เปิดช่วงเวลาติวเพิ่ม
          </button>
        </div>
      )}
    </section>

    <div className="dashboard-workspace">
      {loading || listError
        ? <div className="dashboard-card loading-agenda" role="status">
          {loading ? 'กำลังโหลดปฏิทินเวลาติว…' : 'ยังไม่สามารถแสดงปฏิทินได้ กรุณาโหลดรายการเวลาติวอีกครั้ง'}
        </div>
        : <SlotCalendar slots={activeSlots} startDay={calendarStart} onChangeDay={setCalendarStart}/>}
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
        <button className="retry-button" type="button" onClick={() => void refreshSlots(true)}>โหลดอีกครั้ง</button>
      </div>
      : <AllSlotsAgenda slots={slots} notice={withdrawNotice} renderAction={slot=>{
        if(!isFutureOffer(slot,slotsEvaluatedAt))return null;
        const occupied=slot.occupancy==='Occupied';
        return <>
          <button type="button" className="retry-button" data-testid="withdraw-slot" disabled={occupied||creating||!canMutate()}
            onClick={e=>{
              if(!canMutate()||creating)return;
              withdrawOpener.current=e.currentTarget;
              setWithdrawNotice('');
              setWithdrawTarget(slot);
            }}>ถอนช่วงเวลา</button>
          {occupied&&<small>มีผู้จองแล้ว ต้องยกเลิกนัดหมายก่อน</small>}
        </>;
      }}/>}
    {withdrawTarget&&<WithdrawConfirmation slot={withdrawTarget} state={withdrawState} busy={withdrawBusy}
      message={withdrawMessage} close={dismissWithdraw} confirm={()=>void confirmWithdraw()} reconcile={()=>void reconcileWithdraw()}/>}

    <section className="dashboard-card agenda-card" id="tutor-schedule-bookings-section" aria-labelledby="schedule-bookings-title">
      <div className="agenda-header">
        <div>
          <p className="dashboard-kicker">SCHEDULE BOOKINGS</p>
          <h2 id="schedule-bookings-title" ref={scheduleHeading} tabIndex={-1}>รายการนัดหมายบนตารางสอนของคุณ</h2>
          <p className="agenda-subtitle">การจองที่ได้รับการยืนยันบนช่วงเวลาที่คุณเปิดสอน</p>
        </div>
        <span className="agenda-count">{bookings.length} รายการ</span>
      </div>
      <p role="status" className="tutor-cancel-notice">{cancelNotice}</p>
      {loadingBookings ? (
        <p className="empty-slots">กำลังโหลดรายการนัดหมาย...</p>
      ) : bookingsError ? (
        <div className="dashboard-list-error" role="alert">
          <p className="error">{bookingsError}</p>
          <button className="retry-button" type="button" onClick={() => void refreshBookings(true)}>โหลดรายการนัดหมายใหม่</button>
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
                  {tutorCancellationEligible(b, bookingsEvaluatedAt)
                    ? <button type="button" className="retry-button" data-testid="tutor-cancel-booking"
                        onClick={e => {
                          if (!canMutate()) return;
                          cancelOpener.current = e.currentTarget;
                          setCancelNotice('');
                          setCancelTarget(b);
                        }}>ยกเลิกนัดหมาย</button>
                    : b.displayStatus === 'Booked' && <small>ยกเลิกได้ก่อนเริ่มอย่างน้อย 60 นาที</small>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>

    <section className="dashboard-card agenda-card" id="tutor-appointment-summary-section" data-testid="tutor-appointment-summary" aria-labelledby="tutor-summary-title">
      <div className="agenda-header">
        <div>
          <p className="dashboard-kicker">APPOINTMENT SUMMARY</p>
          <h2 id="tutor-summary-title">สรุปนัดหมายผู้สอน</h2>
          <p className="agenda-subtitle">สรุปนัดหมายที่กำลังจะมาถึง กำลังดำเนินการ ที่ผ่านมาแล้ว และที่ยกเลิก (Asia/Bangkok)</p>
        </div>
        <button
          type="button"
          className="retry-button"
          data-testid="refresh-tutor-summary"
          disabled={loadingSummary}
          onClick={() => void refreshSummary(true)}
        >
          รีเฟรชสรุป
        </button>
      </div>
      <div aria-live="polite">
        {loadingSummary ? (
          <p className="empty-slots" role="status" data-testid="tutor-summary-loading">กำลังโหลดสรุปนัดหมาย...</p>
        ) : summaryError ? (
          <div className="dashboard-list-error" role="alert" data-testid="tutor-summary-error">
            <p className="error">{summaryError}</p>
            <button className="retry-button" type="button" onClick={() => void refreshSummary(true)}>ลองโหลดสรุปอีกครั้ง</button>
          </div>
        ) : summary ? (
          <>
            {summaryEvaluatedAt && (
              <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#58697f' }} data-testid="tutor-summary-evaluated-at">
                ประเมิน ณ {bangkokLongDate(new Date(summaryEvaluatedAt))} {bangkokClock(new Date(summaryEvaluatedAt))} น. (Asia/Bangkok)
              </p>
            )}
            <section aria-labelledby="tutor-summary-upcoming-title" style={{ marginBottom: '16px' }}>
              <h3 id="tutor-summary-upcoming-title" data-testid="tutor-summary-upcoming-count">
                นัดหมายที่กำลังจะมาถึง (Upcoming Booked): {summary.upcomingBookedCount} รายการ
              </h3>
              {summary.upcomingBooked.length === 0 ? (
                <p className="empty-slots" data-testid="tutor-summary-upcoming-empty">ยังไม่มีนัดหมายที่กำลังจะมาถึง</p>
              ) : (
                <ul className="slot-list" aria-label="รายการนัดหมายที่กำลังจะมาถึง" data-testid="tutor-summary-upcoming-list">
                  {summary.upcomingBooked.map(item => {
                    const start = new Date(item.startsAt);
                    const end = new Date(item.endsAt);
                    return (
                      <li key={item.id} className="slot-item customer-booking-item" data-testid="tutor-summary-upcoming-item" data-booking-id={item.id}>
                        <div className="agenda-color-mark" style={{ background: '#0f766e' }} aria-hidden="true" />
                        <div className="agenda-row-main">
                          <div className="slot-item-date">{bangkokLongDate(start)}</div>
                          <div className="slot-item-hours">
                            <time dateTime={item.startsAt}>{bangkokClock(start)}</time>
                            <span aria-hidden="true">–</span>
                            <time dateTime={item.endsAt}>{bangkokClock(end)}</time> น. (Asia/Bangkok)
                          </div>
                          <div style={{ fontSize: '13px', color: '#58697f', marginTop: '4px' }}>
                            ผู้จอง: <strong data-testid="tutor-summary-upcoming-customer-ref">{item.customerRef}</strong> • รหัสการจอง: <code data-testid="tutor-summary-upcoming-booking-id">{item.id}</code>
                          </div>
                        </div>
                        <div className="slot-tags">
                          <span data-testid="tutor-summary-upcoming-status-badge">มีนัดหมาย (Booked)</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section aria-labelledby="tutor-summary-in-progress-title" style={{ marginBottom: '16px' }}>
              <h3 id="tutor-summary-in-progress-title" data-testid="tutor-summary-in-progress-count">
                กำลังดำเนินการอยู่ (In-Progress Booked): {summary.inProgressBookedCount} รายการ
              </h3>
              {summary.inProgressBooked.length === 0 ? (
                <p className="empty-slots" data-testid="tutor-summary-in-progress-empty">ยังไม่มีนัดหมายที่กำลังดำเนินการอยู่</p>
              ) : (
                <ul className="slot-list" aria-label="รายการนัดหมายที่กำลังดำเนินการอยู่" data-testid="tutor-summary-in-progress-list">
                  {summary.inProgressBooked.map(item => {
                    const start = new Date(item.startsAt);
                    const end = new Date(item.endsAt);
                    return (
                      <li key={item.id} className="slot-item customer-booking-item" data-testid="tutor-summary-in-progress-item" data-booking-id={item.id}>
                        <div className="agenda-color-mark" style={{ background: '#b45309' }} aria-hidden="true" />
                        <div className="agenda-row-main">
                          <div className="slot-item-date">{bangkokLongDate(start)}</div>
                          <div className="slot-item-hours">
                            <time dateTime={item.startsAt}>{bangkokClock(start)}</time>
                            <span aria-hidden="true">–</span>
                            <time dateTime={item.endsAt}>{bangkokClock(end)}</time> น. (Asia/Bangkok)
                          </div>
                          <div style={{ fontSize: '13px', color: '#58697f', marginTop: '4px' }}>
                            ผู้จอง: <strong data-testid="tutor-summary-in-progress-customer-ref">{item.customerRef}</strong> • รหัสการจอง: <code data-testid="tutor-summary-in-progress-booking-id">{item.id}</code>
                          </div>
                        </div>
                        <div className="slot-tags">
                          <span data-testid="tutor-summary-in-progress-status-badge">มีนัดหมาย (Booked)</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section aria-labelledby="tutor-summary-past-title" style={{ marginBottom: '16px' }}>
              <h3 id="tutor-summary-past-title" data-testid="tutor-summary-past-count">
                นัดหมายที่ผ่านมาแล้ว (Past Booked): {summary.pastBookedCount} รายการ
              </h3>
              {summary.pastBooked.length === 0 ? (
                <p className="empty-slots" data-testid="tutor-summary-empty">ยังไม่มีนัดหมายที่ผ่านมาแล้ว</p>
              ) : (
                <ul className="slot-list" aria-label="รายการนัดหมายที่ผ่านมาแล้ว" data-testid="tutor-summary-past-list">
                  {summary.pastBooked.map(item => {
                    const start = new Date(item.startsAt);
                    const end = new Date(item.endsAt);
                    return (
                      <li key={item.id} className="slot-item customer-booking-item" data-testid="tutor-summary-past-item" data-booking-id={item.id}>
                        <div className="agenda-color-mark" style={{ background: '#475569' }} aria-hidden="true" />
                        <div className="agenda-row-main">
                          <div className="slot-item-date">{bangkokLongDate(start)}</div>
                          <div className="slot-item-hours">
                            <time dateTime={item.startsAt}>{bangkokClock(start)}</time>
                            <span aria-hidden="true">–</span>
                            <time dateTime={item.endsAt}>{bangkokClock(end)}</time> น. (Asia/Bangkok)
                          </div>
                          <div style={{ fontSize: '13px', color: '#58697f', marginTop: '4px' }}>
                            ผู้จอง: <strong data-testid="tutor-summary-customer-ref">{item.customerRef}</strong> • รหัสการจอง: <code data-testid="tutor-summary-booking-id">{item.id}</code>
                          </div>
                        </div>
                        <div className="slot-tags">
                          <span className="badge-past" data-testid="tutor-summary-status-badge">สิ้นสุดแล้ว (Past)</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section aria-labelledby="tutor-summary-cancelled-title">
              <h3 id="tutor-summary-cancelled-title" data-testid="tutor-summary-cancelled-count">
                นัดหมายที่ยกเลิกแล้ว (Cancelled): {summary.cancelledCount} รายการ
              </h3>
              {summary.cancelled.length === 0 ? (
                <p className="empty-slots" data-testid="tutor-summary-cancelled-empty">
                  ยังไม่มีนัดหมายที่ถูกยกเลิก
                </p>
              ) : (
                <ul className="slot-list" aria-label="รายการนัดหมายที่ยกเลิกแล้ว">
                  {summary.cancelled.map(item => {
                    const start = new Date(item.startsAt);
                    const end = new Date(item.endsAt);
                    const cancelledAt = new Date(item.cancelledAt);
                    return (
                      <li key={item.id} className="slot-item customer-booking-item">
                        <div className="agenda-row-main">
                          <div className="slot-item-date">{bangkokLongDate(start)}</div>
                          <div className="slot-item-hours">
                            <time dateTime={item.startsAt}>{bangkokClock(start)}</time>
                            <span aria-hidden="true">–</span>
                            <time dateTime={item.endsAt}>{bangkokClock(end)}</time> น. (Asia/Bangkok)
                          </div>
                          <div>ผู้จอง: <strong>{item.customerRef}</strong> • รหัสการจอง: <code>{item.id}</code></div>
                          <div>
                            {item.cancellationActor === 'Customer' ? 'ผู้เรียนยกเลิก' : 'ผู้สอนยกเลิก'} ณ{' '}
                            <time dateTime={item.cancelledAt} data-testid="tutor-summary-cancelled-at">
                              {bangkokLongDate(cancelledAt)} {bangkokClock(cancelledAt)} น. (Asia/Bangkok)
                            </time>
                          </div>
                        </div>
                        <div className="slot-tags">
                          <span>ยกเลิกแล้ว (Cancelled)</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </section>

    {cancelTarget && <TutorCancelDialog booking={cancelTarget} reason={cancelReason} onReason={setCancelReason}
      onDismiss={() => dismissCancellation(cancelState === 'stale')} onConfirm={confirmTutorCancellation}
      onReconcile={() => void verifyCancellationOutcome()} busy={cancelBusy} state={cancelState} message={cancelMessage} />}
  </TutorDashboardShell>;
}
