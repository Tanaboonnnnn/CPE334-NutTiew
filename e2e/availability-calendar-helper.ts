import { expect, type Locator, type Page } from '@playwright/test';

export async function navigateToCalendarMonth(page: Page, targetMonthKey: string): Promise<void> {
  const grid = page.getByTestId('calendar-day-grid');
  await expect(grid).toBeVisible();

  for (let step = 0; step < 36; step++) {
    const firstDayKey = await grid.locator('[data-day-key]').first().getAttribute('data-day-key');
    if (!firstDayKey) {
      throw new Error('Calendar day grid does not contain any rendered day key');
    }
    const currentMonthKey = firstDayKey.slice(0, 7);
    if (currentMonthKey === targetMonthKey) {
      return;
    }
    if (currentMonthKey < targetMonthKey) {
      const nextBtn = page.getByTestId('calendar-next-month');
      await expect(nextBtn).toBeEnabled();
      await nextBtn.click();
    } else {
      const prevBtn = page.getByTestId('calendar-prev-month');
      await expect(prevBtn).toBeEnabled();
      await prevBtn.click();
    }
  }
  throw new Error(`Could not navigate calendar to month ${targetMonthKey}`);
}

export async function selectCalendarDay(page: Page, dayKey: string): Promise<void> {
  await navigateToCalendarMonth(page, dayKey.slice(0, 7));
  const dayBtn = page.getByTestId(`calendar-day-${dayKey}`);
  await expect(dayBtn).toBeVisible();
  await expect(dayBtn).toBeEnabled();
  if ((await dayBtn.getAttribute('aria-pressed')) !== 'true') {
    await dayBtn.click();
  }
}

export async function revealAllTimeGroupsForSelectedDay(page: Page): Promise<void> {
  const moreBtn = page.getByTestId('show-more-times-btn');
  if ((await moreBtn.count()) > 0 && (await moreBtn.isVisible())) {
    await moreBtn.click();
  }
}

export async function expandAllTimeGroupsForSelectedDay(page: Page): Promise<void> {
  await revealAllTimeGroupsForSelectedDay(page);
  const toggles = page.getByTestId('time-group-toggle');
  const total = await toggles.count();
  for (let i = 0; i < total; i++) {
    const toggle = toggles.nth(i);
    if ((await toggle.getAttribute('aria-expanded')) === 'false') {
      await toggle.click();
    }
  }
}

async function tryExpandMatchingGroups(
  page: Page,
  offer: Locator,
  startClockPrefix?: string,
): Promise<boolean> {
  if ((await offer.count()) > 0 && (await offer.isVisible())) {
    return true;
  }

  if (startClockPrefix) {
    const matchingGroups = page
      .getByTestId('time-group-item')
      .filter({ hasText: startClockPrefix });
    const count = await matchingGroups.count();
    for (let i = 0; i < count; i++) {
      const toggle = matchingGroups.nth(i).getByTestId('time-group-toggle');
      if ((await toggle.getAttribute('aria-expanded')) === 'false') {
        await toggle.click();
      }
      if ((await offer.count()) > 0 && (await offer.isVisible())) {
        return true;
      }
    }
  }
  return false;
}

export async function expandDayTimeGroupAndLocateOffer(
  page: Page,
  dayKey: string,
  slotId: string,
  startClockPrefix?: string,
): Promise<Locator> {
  await selectCalendarDay(page, dayKey);
  const offer = page.locator(`[data-offer-slot-id="${slotId}"]`);

  // Check already-visible time groups first before expanding "ดูเวลาเพิ่มเติม"
  if (await tryExpandMatchingGroups(page, offer, startClockPrefix)) {
    return offer;
  }

  await revealAllTimeGroupsForSelectedDay(page);
  if (await tryExpandMatchingGroups(page, offer, startClockPrefix)) {
    return offer;
  }

  const allToggles = page.getByTestId('time-group-toggle');
  const count = await allToggles.count();
  for (let i = 0; i < count; i++) {
    const toggle = allToggles.nth(i);
    if ((await toggle.getAttribute('aria-expanded')) === 'false') {
      await toggle.click();
    }
    if ((await offer.count()) > 0 && (await offer.isVisible())) {
      return offer;
    }
  }

  throw new Error(`Offer ${slotId} not visible under calendar day ${dayKey}`);
}
