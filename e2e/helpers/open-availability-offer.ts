import { expect, type Page } from '@playwright/test';

type AvailabilityPayload = {
  data: { slotId: string; startsAt: string; endsAt: string }[];
};

// Real Customer API read, followed by the same calendar actions as a user.
// This helper never bypasses the UI, forges a Booking, or modifies server state.
export async function openAvailabilityOffer(page: Page, slotId: string): Promise<void> {
  const response = await page.request.get('/api/v1/customer/availability');
  expect(response.status(), 'authorized Customer availability fetch').toBe(200);
  const payload = (await response.json()) as AvailabilityPayload;
  const offer = payload.data.find(item => item.slotId === slotId);
  expect(offer, 'expected Slot must be eligible for this Customer').toBeDefined();
  if (!offer) return;

  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Bangkok',
  }).formatToParts(new Date(offer.startsAt));
  const get = (key: string) => parts.find(part => part.type === key)?.value ?? '';
  const day = get('year') + '-' + get('month') + '-' + get('day');
  const targetMonth = day.slice(0, 7);
  const calendar = page.getByTestId('availability-calendar');
  await expect(calendar).toBeVisible();

  for (let step = 0; step < 5; step++) {
    const shownMonth = await calendar.getAttribute('data-month-key');
    if (shownMonth === targetMonth) break;
    await page.getByRole('button', {
      name: shownMonth! < targetMonth ? 'เดือนถัดไป' : 'เดือนก่อนหน้า',
    }).click();
  }
  await expect(calendar).toHaveAttribute('data-month-key', targetMonth);
  await page.locator('[data-calendar-day="' + day + '"]').click();

  const group = page.locator('[data-testid="calendar-time-group"][data-group-slot-ids~="' + slotId + '"]');
  if (await group.count() === 0) {
    await page.getByRole('button', { name: /^ดูเวลาเพิ่มเติม/ }).click();
  }
  await expect(group).toBeVisible();
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click();
  await expect(page.locator('[data-offer-slot-id="' + slotId + '"]')).toBeVisible();
}
