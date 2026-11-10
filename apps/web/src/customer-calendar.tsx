import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { bangkokClock, bangkokDayKey, bangkokLongDate } from './tutor-calendar.js';
import type { CustomerAvailabilityOffer } from './customer-availability.js';
import './customer-calendar.css';

type TimeGroup = {
  key: string;
  startsAt: string;
  endsAt: string;
  offers: CustomerAvailabilityOffer[];
};

type CalendarProps = {
  offers: CustomerAvailabilityOffer[];
  evaluatedAt: string;
  selectedSlotId: string | null;
  unknownSlotId: string | null;
  submittingBooking: boolean;
  onSelectOffer: (slotId: string) => void;
  summary: ReactNode;
};

const monthFormatter = new Intl.DateTimeFormat('th-TH-u-ca-gregory-nu-latn', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function monthIndex(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number);
  return year * 12 + month - 1;
}

function monthKeyFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = index % 12 + 1;
  return String(year) + '-' + String(month).padStart(2, '0');
}

function calendarDate(dayKey: string): Date {
  // Noon in Bangkok; the UTC value cannot roll into a neighboring Bangkok day.
  return new Date(dayKey + 'T05:00:00.000Z');
}

function displayMonth(index: number): string {
  const year = Math.floor(index / 12);
  const month = index % 12;
  return monthFormatter.format(new Date(Date.UTC(year, month, 15, 12)));
}

function groupDayOffers(offers: CustomerAvailabilityOffer[]): TimeGroup[] {
  // The API orders startsAt/tutorRef/slotId, so offers with the same exact
  // start/end pair need not be adjacent if tutors expose different durations.
  const groups = new Map<string, TimeGroup>();
  for (const offer of offers) {
    const key = offer.startsAt + '|' + offer.endsAt;
    const existing = groups.get(key);
    if (existing) existing.offers.push(offer);
    else groups.set(key, { key, startsAt: offer.startsAt, endsAt: offer.endsAt, offers: [offer] });
  }
  return [...groups.values()];
}

export function CustomerAvailabilityCalendar({
  offers,
  evaluatedAt,
  selectedSlotId,
  unknownSlotId,
  submittingBooking,
  onSelectOffer,
  summary,
}: CalendarProps) {
  // The server guarantees deterministic order and validates every timestamp.
  const initialDay = bangkokDayKey(new Date(offers[0].startsAt));
  const [selectedDayKey, setSelectedDayKey] = useState(initialDay);
  const [visibleMonth, setVisibleMonth] = useState(() => monthIndex(initialDay.slice(0, 7)));
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const dayOffers = useMemo(() => {
    const index = new Map<string, CustomerAvailabilityOffer[]>();
    for (const offer of offers) {
      const day = bangkokDayKey(new Date(offer.startsAt));
      const existing = index.get(day);
      if (existing) existing.push(offer);
      else index.set(day, [offer]);
    }
    return index;
  }, [offers]);

  const evaluatedDay = bangkokDayKey(new Date(evaluatedAt));
  const upperDay = bangkokDayKey(new Date(Date.parse(evaluatedAt) + 60 * 86_400_000));
  const minMonth = Math.min(monthIndex(evaluatedDay.slice(0, 7)), monthIndex(initialDay.slice(0, 7)));
  const latestOfferDay = bangkokDayKey(new Date(offers[offers.length - 1].startsAt));
  const maxMonth = Math.max(monthIndex(upperDay.slice(0, 7)), monthIndex(latestOfferDay.slice(0, 7)));

  // Do not derive availability from the browser clock. Clamp navigation only
  // when a refreshed, authorized response changes the server-derived bounds.
  useEffect(() => {
    setVisibleMonth(current => Math.max(minMonth, Math.min(maxMonth, current)));
  }, [minMonth, maxMonth]);

  const monthKey = monthKeyFromIndex(visibleMonth);
  const [year, month] = monthKey.split('-').map(Number);
  const weekdayOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates: (string | null)[] = Array.from({ length: weekdayOffset }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(monthKey + '-' + String(day).padStart(2, '0'));
  }
  const availableInMonth = [...dayOffers].some(([day, items]) => day.startsWith(monthKey) && items.length > 0);
  const shownDay = selectedDayKey.slice(0, 7) === monthKey ? selectedDayKey : null;
  const allGroups = useMemo(
    () => groupDayOffers(shownDay ? dayOffers.get(shownDay) ?? [] : []),
    [dayOffers, shownDay],
  );
  const visibleGroups = showAllGroups ? allGroups : allGroups.slice(0, 6);
  const selectedDayCount = shownDay ? dayOffers.get(shownDay)?.length ?? 0 : 0;

  function switchMonth(delta: number) {
    const next = visibleMonth + delta;
    if (next < minMonth || next > maxMonth) return;
    setVisibleMonth(next);
    setShowAllGroups(false);
    setExpandedGroupKey(null);
    setAnnouncement('แสดงเดือน' + displayMonth(next));
  }

  function chooseDay(day: string) {
    const count = dayOffers.get(day)?.length ?? 0;
    if (count === 0) return;
    setSelectedDayKey(day);
    setShowAllGroups(false);
    setExpandedGroupKey(null);
    setAnnouncement('เลือกวันที่ ' + bangkokLongDate(calendarDate(day)) + ' พบ ' + count + ' ช่วงเวลา');
  }

  return (
    <div className="availability-surface customer-calendar-surface" data-testid="availability-calendar" data-month-key={monthKey}>
      <div className="availability-list-header">
        <span>เลือกวันที่สะดวก แล้วเลือกช่วงเวลา</span>
        <span className="availability-count-badge">{offers.length} ช่วงเวลาทั้งหมด</span>
      </div>
      <div className="customer-calendar-workspace">
        <section className="customer-calendar-pane" aria-label="1. เลือกวันที่">
          <h2 className="customer-calendar-step-heading">1. เลือกวันที่</h2>
          <div className="customer-calendar-navigation">
            <button
              type="button"
              className="customer-calendar-nav-button"
              aria-label="เดือนก่อนหน้า"
              disabled={visibleMonth <= minMonth}
              onClick={() => switchMonth(-1)}
            >‹</button>
            <h3 className="customer-calendar-month-name">{displayMonth(visibleMonth)}</h3>
            <button
              type="button"
              className="customer-calendar-nav-button"
              aria-label="เดือนถัดไป"
              disabled={visibleMonth >= maxMonth}
              onClick={() => switchMonth(1)}
            >›</button>
          </div>
          <div className="customer-calendar-weekdays" aria-hidden="true">
            {['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map(day => <span key={day}>{day}</span>)}
          </div>
          <div className="customer-calendar-grid" aria-label={'วันในเดือน' + displayMonth(visibleMonth)}>
            {dates.map((day, index) => {
              if (day === null) return <span key={'pad-' + index} className="customer-calendar-padding" aria-hidden="true" />;
              const count = dayOffers.get(day)?.length ?? 0;
              const isSelected = selectedDayKey === day;
              return (
                <button
                  key={day}
                  type="button"
                  data-testid="calendar-day"
                  data-calendar-day={day}
                  className={'customer-calendar-day' + (isSelected ? ' is-selected' : '')}
                  aria-label={bangkokLongDate(calendarDate(day)) + (count ? ' มี ' + count + ' ช่วงเวลา' : ' ไม่มีช่วงเวลาว่าง')}
                  aria-pressed={isSelected}
                  disabled={count === 0}
                  onClick={() => chooseDay(day)}
                >
                  <strong>{Number(day.slice(-2))}</strong>
                  <small>{count ? count + ' ว่าง' : '—'}</small>
                </button>
              );
            })}
          </div>
          <p className="customer-calendar-hint">วันที่มีตัวเลข “ว่าง” สามารถเลือกดูช่วงเวลาติวได้</p>
        </section>
        <section className="customer-calendar-pane customer-calendar-times" aria-label="2. เลือกเวลา">
          <h2 className="customer-calendar-step-heading">2. เลือกเวลา</h2>
          {shownDay && selectedDayCount > 0 ? (
            <>
              <p className="customer-calendar-day-caption">
                {bangkokLongDate(calendarDate(shownDay))} · {selectedDayCount} ช่วงเวลา
              </p>
              <div className="customer-calendar-time-list">
                {visibleGroups.map(group => {
                  const expanded = group.key === expandedGroupKey;
                  const start = new Date(group.startsAt);
                  const end = new Date(group.endsAt);
                  const crossMidnight = bangkokDayKey(start) !== bangkokDayKey(end);
                  return (
                    <div className="customer-calendar-time-group" key={group.key}>
                      <button
                        type="button"
                        data-testid="calendar-time-group"
                        data-group-slot-ids={group.offers.map(offer => offer.slotId).join(' ')}
                        className={'customer-calendar-time-toggle' + (expanded ? ' is-expanded' : '')}
                        aria-expanded={expanded}
                        onClick={() => setExpandedGroupKey(expanded ? null : group.key)}
                      >
                        <span className="customer-calendar-time-label">
                          <strong>{bangkokClock(start)}–{bangkokClock(end)} น.</strong>
                          {crossMidnight && <small className="offer-next-day">สิ้นสุดในวันถัดไป</small>}
                        </span>
                        <span className="customer-calendar-time-count">{group.offers.length} ตัวเลือก <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span></span>
                      </button>
                      {expanded && (
                        <ul className="availability-offer-list" aria-label={'ตัวเลือกช่วงเวลา ' + bangkokClock(start)}>
                          {group.offers.map(offer => {
                            const offerStart = new Date(offer.startsAt);
                            const offerEnd = new Date(offer.endsAt);
                            const selected = offer.slotId === selectedSlotId;
                            return (
                              <li
                                key={offer.slotId}
                                data-testid="availability-offer"
                                data-offer-slot-id={offer.slotId}
                                data-tutor-ref={offer.tutorRef}
                                className={'availability-offer-row' + (selected ? ' availability-offer-selected' : '')}
                              >
                                <div className="availability-offer-main">
                                  <div className="offer-hours">
                                    <time dateTime={offer.startsAt}>{bangkokClock(offerStart)}</time>
                                    <span aria-hidden="true">–</span>
                                    <time dateTime={offer.endsAt}>{bangkokClock(offerEnd)}</time>
                                    {crossMidnight && <span className="offer-next-day">สิ้นสุดในวันถัดไป</span>}
                                  </div>
                                  <div className="offer-date-line">{bangkokLongDate(offerStart)} • 60 นาที (Asia/Bangkok)</div>
                                  <div className="offer-tutor-ref">รหัสอ้างอิงติวเตอร์: <span>{offer.tutorRef}</span></div>
                                  {selected && <div className="offer-selected-status">สถานะ: เลือกไว้แล้ว (ยังไม่ใช่การจอง)</div>}
                                </div>
                                <button
                                  type="button"
                                  className="offer-select-button"
                                  aria-pressed={selected}
                                  disabled={submittingBooking || (unknownSlotId !== null && unknownSlotId !== offer.slotId)}
                                  onClick={() => onSelectOffer(offer.slotId)}
                                >{selected ? 'เลือกช่วงเวลานี้แล้ว' : 'เลือกช่วงเวลานี้'}</button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
              {!showAllGroups && allGroups.length > 6 && (
                <button type="button" className="customer-calendar-show-more" onClick={() => setShowAllGroups(true)}>
                  ดูเวลาเพิ่มเติม (อีก {allGroups.length - 6} ช่วงเวลา)
                </button>
              )}
            </>
          ) : !availableInMonth ? (
            <p className="customer-calendar-empty" role="status">ยังไม่มีช่วงเวลาว่างในเดือนนี้ เลือกเดือนอื่นเพื่อดูเวลาที่มีอยู่</p>
          ) : shownDay && selectedDayCount === 0 ? (
            <p className="customer-calendar-empty" role="status">ยังไม่มีช่วงเวลาว่างในวันที่เลือก กรุณาเลือกวันอื่นในปฏิทิน</p>
          ) : (
            <p className="customer-calendar-empty">เลือกวันที่มีช่วงเวลาว่างในเดือนนี้เพื่อดูตัวเลือก</p>
          )}
          {summary}
        </section>
      </div>
      <p className="customer-calendar-live-status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </div>
  );
}
