import { useEffect, useRef, useState, type FormEvent } from 'react';

type Slot = {
  id: string;
  startsAt: string;
  endsAt: string;
  lifecycle: 'Offered';
  occupancy: 'Unoccupied' | 'Occupied';
};
type SlotList = { data: Slot[]; meta: { requestId: string } };

/** A Bangkok wall-clock input must never be interpreted in the device's timezone. */
function bangkokStart(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const result = new Date(date + 'T' + time + ':00.000+07:00');
  return Number.isNaN(result.getTime()) ? null : result;
}
const bangkokTime = (instant: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);
const bangkokDate = (instant: Date) =>
  new Intl.DateTimeFormat('th-TH-u-ca-gregory-nu-latn', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', year: 'numeric' }).format(instant);
const bangkokDayKey = (instant: Date) => new Date(instant.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

async function apiJson<T>(path: string, init: RequestInit = {}, externalSignal?: AbortSignal): Promise<T> {
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
    return payload as T;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', stop);
  }
}

function userMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'SLOT_OVERLAP') return 'ช่วงเวลานี้ทับกับเวลาที่คุณเปิดไว้แล้ว กรุณาเลือกเวลาใหม่';
  if (code === 'SLOT_INVALID_TIME') return 'ต้องเลือกเวลาเริ่มที่ยังไม่ผ่านไปแล้วตามเวลาประเทศไทย';
  if (code === 'INVALID_INPUT') return 'วันที่หรือเวลาไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
  if (code === 'CSRF_DENIED' || code === 'ORIGIN_DENIED') return 'ไม่สามารถตรวจสอบความปลอดภัยของคำขอได้ กรุณาเข้าสู่ระบบใหม่';
  if (code === 'AbortError' || code === 'SERVICE_UNAVAILABLE') return 'ยังยืนยันผลการบันทึกไม่ได้ โปรดตรวจสอบรายการด้านล่างก่อนลองอีกครั้ง';
  return 'ไม่สามารถดำเนินการได้ โปรดลองอีกครั้ง';
}
function accessExpired(error: unknown) {
  return error instanceof Error && (error.message === 'UNAUTHENTICATED' || error.message === 'FORBIDDEN');
}

export function TutorAvailability({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
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
    if (showLoading) setLoading(true);
    try {
      const result = await apiJson<SlotList>('/api/v1/tutor/slots', {}, controller.signal);
      if (version.current === current) {
        setSlots(result.data);
        setListError('');
      }
    } catch (e) {
      if (version.current === current) {
        if (accessExpired(e)) { setSlots([]); onUnauthorized(); }
        else if (!controller.signal.aborted) setListError('ไม่สามารถโหลดรายการเวลาติวได้ กรุณาลองใหม่');
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
      pendingPost.current?.abort();
    };
    // This component is keyed by the authenticated User; remount on identity switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (creating) return;
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
      await apiJson('/api/v1/tutor/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ startsAt: preview.toISOString() }),
      }, controller.signal);
      if (!controller.signal.aborted) {
        setNotice('บันทึกเวลาติวสำเร็จ');
        await refresh();
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        if (accessExpired(e)) { setSlots([]); onUnauthorized(); }
        else {
          setError(userMessage(e));
          queueMicrotask(() => errorRef.current?.focus());
          if (e instanceof Error && (e.name === 'AbortError' || e.message === 'SERVICE_UNAVAILABLE')) {
            await refresh(); // server might have committed before network failure
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

  return (
    <section className="panel schedule-panel" aria-labelledby="schedule-heading">
      <p className="eyebrow">NutTiew · Tutor availability</p>
      <h2 id="schedule-heading">ตารางเวลาติวของฉัน</h2>
      <p className="subtitle">เปิดช่วงเวลาติวครั้งละ 60 นาทีสำหรับตารางของคุณเท่านั้น</p>
      <div className="timezone-note">เวลาที่แสดงเป็นเวลาไทย · Asia/Bangkok (UTC+07:00)</div>
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
        <button type="submit" disabled={creating}>{creating ? 'กำลังบันทึก…' : 'เพิ่มเวลาติว'}</button>
        {error && <p id="slot-error" className="error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
        {notice && <p className="success" role="status">{notice}</p>}
      </form>
      <div className="schedule-list-heading">
        <h3>เวลาติวที่เปิดไว้</h3>
        <span>{slots.length} ช่วงเวลา</span>
      </div>
      {loading ? <p role="status">กำลังโหลดรายการเวลาติว…</p> : (
        <>
          {listError && <p className="error" role="alert">{listError} <button className="retry-button" type="button" onClick={() => void refresh(true)}>โหลดอีกครั้ง</button></p>}
          {!listError && slots.length === 0 && <p className="empty-slots">ยังไม่มีช่วงเวลาติวที่เปิดไว้</p>}
          {slots.length > 0 && <ul className="slot-list">
            {slots.map(slot => (
              <li key={slot.id} className="slot-item">
                <div>
                  <div className="slot-item-date">{bangkokDate(new Date(slot.startsAt))}</div>
                  <div className="slot-item-hours"><time>{bangkokTime(new Date(slot.startsAt))}</time><span aria-hidden="true">–</span><time>{bangkokTime(new Date(slot.endsAt))}</time></div>
                </div>
                <div className="slot-tags"><span>เปิดช่วงเวลาแล้ว</span><span>{slot.occupancy === 'Occupied' ? 'มีการจองแล้ว' : 'ยังไม่มีการจอง'}</span></div>
              </li>
            ))}
          </ul>}
        </>
      )}
    </section>
  );
}
