/** Read-only Bangkok calendar projection. Never changes the server's full own-list. */
import { useEffect, useRef, useState } from 'react';
export type OfferedSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  lifecycle: 'Offered';
  occupancy: 'Unoccupied' | 'Occupied';
};

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
export const bangkokDayKey = (instant: Date): string =>
  new Date(instant.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

export function shiftDay(day: string, count: number): string {
  const start = new Date(day + 'T00:00:00.000Z');
  return new Date(start.getTime() + count * DAY_MS).toISOString().slice(0, 10);
}

export const bangkokClock = (instant: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(instant);

export const bangkokLongDate = (instant: Date): string =>
  new Intl.DateTimeFormat('th-TH-u-ca-gregory-nu-latn', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric',
  }).format(instant);

function midnightBangkok(day: string): number {
  return Date.parse(day + 'T00:00:00.000+07:00');
}

export function minuteSlice(slot: OfferedSlot, day: string): { top: number; height: number } | null {
  const midnight = midnightBangkok(day);
  const start = Date.parse(slot.startsAt);
  const end = Date.parse(slot.endsAt);
  if (!(Number.isFinite(start) && Number.isFinite(end))) return null;
  const clippedStart = Math.max(midnight, start);
  const clippedEnd = Math.min(midnight + DAY_MS, end);
  if (clippedEnd <= clippedStart) return null;
  return {
    top: (clippedStart - midnight) / MINUTE_MS,
    height: (clippedEnd - clippedStart) / MINUTE_MS,
  };
}

export function calendarVisibleCount(slots: OfferedSlot[], startDay: string, days = 3): number {
  const begin = midnightBangkok(startDay);
  const end = begin + days * DAY_MS;
  return slots.filter(slot => Date.parse(slot.startsAt) < end && Date.parse(slot.endsAt) > begin).length;
}

const COLORS = ['mint', 'sky', 'peach', 'lavender'] as const;
function colorFor(id: string) {
  const hash = [...id].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

function calendarDayLabel(day: string) {
  const date = new Date(midnightBangkok(day));
  const dayPart = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short' }).format(date);
  const datePart = new Intl.DateTimeFormat('th-TH-u-ca-gregory-nu-latn', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' }).format(date);
  return { dayPart, datePart };
}

export function SlotCalendar({
  slots, startDay, onChangeDay,
}: {
  slots: OfferedSlot[];
  startDay: string;
  onChangeDay: (day: string) => void;
}) {
  const [dayCount, setDayCount] = useState(() => window.matchMedia('(max-width: 1060px)').matches ? 2 : 3);
  const viewport = useRef<HTMLDivElement>(null);
  // Initial viewport is a convenient 08:00; this is NOT a business-hour
  // restriction: the same scrollable canvas covers 00:00 through 24:00.
  useEffect(() => { if (viewport.current) viewport.current.scrollTop = 8 * 60; }, []);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1060px)');
    const update = () => setDayCount(media.matches ? 2 : 3);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const days = Array.from({ length: dayCount }, (_, index) => shiftDay(startDay, index));
  const visible = calendarVisibleCount(slots, startDay, dayCount);
  return (
    <section className="dashboard-card calendar-card" id="calendar-section" aria-labelledby="calendar-title">
      <div className="calendar-toolbar">
        <div>
          <p className="dashboard-kicker">YOUR WEEK AT A GLANCE</p>
          <h2 id="calendar-title">ปฏิทินเวลาติว</h2>
          <p className="calendar-hint">เวลาไทย • แสดงครบ 24 ชั่วโมง • ตำแหน่ง Slot ตามนาทีจริง</p>
        </div>
        <div className="calendar-actions" aria-label="เลื่อนวันบนปฏิทิน">
          <button type="button" className="calendar-step" aria-label={'ก่อนหน้า ' + dayCount + ' วัน'} onClick={() => onChangeDay(shiftDay(startDay, -dayCount))}>
            <span aria-hidden="true">‹</span>
          </button>
          <button type="button" className="calendar-today" onClick={() => onChangeDay(bangkokDayKey(new Date()))}>วันนี้</button>
          <button type="button" className="calendar-step" aria-label={'ถัดไป ' + dayCount + ' วัน'} onClick={() => onChangeDay(shiftDay(startDay, dayCount))}>
            <span aria-hidden="true">›</span>
          </button>
          <input type="date" aria-label="เลือกวันบนปฏิทิน" className="calendar-date-picker"
            value={startDay} onChange={event => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onChangeDay(event.target.value);
            }} />
        </div>
      </div>
      <div className="calendar-window-summary" role="status">
        <span className="calendar-dot" aria-hidden="true" />
        <span>ช่วงที่แสดง: {visible} ช่วงเวลา</span>
        <span className="calendar-all-hint">รายการทุกวันอยู่ด้านล่าง ↓</span>
      </div>
      <div ref={viewport} className="calendar-scroll" tabIndex={0} role="region" aria-label="ปฏิทิน 24 ชั่วโมง เลื่อนดูเวลาได้ทุกช่วง">
        <div className="calendar-scroll-inner" data-columns={dayCount}>
          <div className="calendar-day-headings">
            <div className="calendar-axis-heading" aria-hidden="true">เวลา</div>
            {days.map((day, index) => {
              const { dayPart, datePart } = calendarDayLabel(day);
              return <div className={'calendar-day-heading calendar-day-' + (index + 1)} key={day}>
                <span>{dayPart}</span><strong>{datePart}</strong>
                {day === bangkokDayKey(new Date()) && <small>วันนี้</small>}
              </div>;
            })}
          </div>
          <div className="calendar-hours">
            <div className="calendar-time-axis" aria-hidden="true">
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} style={{ top: hour * 60 }}>{String(hour).padStart(2, '0')}:00</span>
              ))}
            </div>
            {days.map((day, index) => (
              <div className={'calendar-day-track calendar-day-' + (index + 1)} key={day}
                role="list" aria-label={'ช่วงเวลาติว ' + calendarDayLabel(day).datePart}>
                {slots.map(slot => {
                  const slice = minuteSlice(slot, day);
                  if (!slice || slot.lifecycle !== 'Offered') return null;
                  const start = bangkokClock(new Date(slot.startsAt));
                  const end = bangkokClock(new Date(slot.endsAt));
                  const occupancy = slot.occupancy === 'Occupied' ? 'มีผู้จองแล้ว (Occupied)' : 'ว่าง (เปิดรับจอง)';
                  return <div key={slot.id} role="listitem" data-testid="calendar-slot"
                    data-slot-id={slot.id} data-day={day} data-start-minute={slice.top}
                    className={'calendar-slot calendar-slot-' + colorFor(slot.id) + (slice.height < 46 ? ' calendar-slot-compact' : '')}
                    style={{ top: slice.top, height: slice.height }}
                    aria-label={'เปิดช่วงเวลาแล้ว ' + start + ' ถึง ' + end + ' เวลาไทย ' + occupancy}>
                    <strong>{start}–{end}</strong>
                    <span>เปิดช่วงเวลาแล้ว</span>
                    <span className={"calendar-slot-occupancy " + (slot.occupancy === 'Occupied' ? 'badge-occupied' : 'badge-unoccupied')} data-testid="calendar-occupancy-badge">{occupancy}</span>
                  </div>;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="calendar-mobile-note">
        <span>บนมือถือแสดงตารางแบบรายการที่อ่านง่ายด้านล่าง ครอบคลุม Slot ทุกวันและทุกชั่วโมง</span>
      </div>
    </section>
  );
}

export function AllSlotsAgenda({ slots }: { slots: OfferedSlot[] }) {
  const ordered = [...slots].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
  return <section className="dashboard-card agenda-card" id="all-slots" aria-labelledby="agenda-title">
    <div className="agenda-header">
      <div><p className="dashboard-kicker">ALL YOUR AVAILABILITY</p><h2 id="agenda-title">รายการ Slot ทั้งหมด</h2>
        <p className="agenda-subtitle">เรียงจากวันและเวลาเริ่มจริง • ไม่ตัดรายการนอกช่วงปฏิทิน</p></div>
      <span className="agenda-count">{ordered.length} ช่วงเวลา</span>
    </div>
    {ordered.length === 0
      ? <p className="empty-slots">ยังไม่มีช่วงเวลาติวที่เปิดไว้</p>
      : <ul className="slot-list" aria-label="Slot ทั้งหมดของฉัน">{ordered.map(slot => {
        const start = new Date(slot.startsAt);
        const end = new Date(slot.endsAt);
        return <li key={slot.id} className="slot-item" data-slot-id={slot.id}>
          <div className={'agenda-color-mark calendar-slot-' + colorFor(slot.id)} aria-hidden="true" />
          <div className="agenda-row-main">
            <div className="slot-item-date">{bangkokLongDate(start)}</div>
            <div className="slot-item-hours"><time dateTime={slot.startsAt}>{bangkokClock(start)}</time>
              <span aria-hidden="true">–</span>
              <time dateTime={slot.endsAt}>{bangkokClock(end)}</time></div>
            {bangkokDayKey(start) !== bangkokDayKey(end) && <span className="agenda-next-day">สิ้นสุดในวันถัดไป</span>}
          </div>
          <div className="slot-tags">
            <span>เปิดช่วงเวลาแล้ว</span>
            <span className={slot.occupancy === 'Occupied' ? 'badge-occupied' : 'badge-unoccupied'} data-testid="slot-occupancy-badge">{slot.occupancy === 'Occupied' ? 'มีผู้จองแล้ว (Occupied)' : 'ว่าง (เปิดรับจอง)'}</span>
          </div>
        </li>;
      })}</ul>}
  </section>;
}
