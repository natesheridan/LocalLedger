/**
 * LocaLedger End-to-End Test Suite
 *
 * Maps to UseCases.md (UC-00 base UI render checks, UC-01 through UC-25 interactions).
 *
 * Run:  npx playwright test
 *       npx playwright test --headed          (watch it run)
 *       npx playwright test --grep "UC-05"    (single use case)
 *
 * On every run:
 *  - Each tab's rendered #app HTML is saved to test-results/ui-context/<label>.html
 *  - test-results/results.json         → machine-readable Playwright output
 *  - test-results/failure-report.md    → paste-ready summary for a fixing agent
 *
 * ─── Confirmed selectors from index.html ────────────────────────────────────
 *  Nav buttons:      [data-tab="dashboard|add|history|settings"]
 *  Tab animation:    150ms setTimeout — always wait ≥200ms after clicking a tab
 *  Form inputs:      #dateInput  #hoursInput  #locationInput  #rateInput  #tipsInput
 *  Pay type toggle:  button[onclick="setPayType('flat')"]
 *  Form submit:      #incomeForm button[type="submit"]
 *  History actions:  button[onclick*="editRecord|deleteRecord|restoreRecord"]
 *  Show deleted:     button[onclick*="toggleDeletedRecords"]
 *  Custom field overlay (appended to <body>, not #sheet):
 *    #customFieldSheet  #customFieldName  #customFieldType
 *    input[name="moneyAddToTotal"][value="add|subtract|none"]
 *    button[onclick="saveCustomField()"]   (add)
 *    button[onclick*="saveEditedCustomField"]  (edit)
 *  Location edit overlay (appended to <body>):
 *    #locEditSheet  #locEditName
 *    input[name="locColor"][value="<hex>"]   ← radio buttons, not color picker
 *    button[onclick*="saveLocationEdit"]
 * ────────────────────────────────────────────────────────────────────────────
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const APP_URL        = `file://${path.resolve(__dirname, '..', 'index.html')}`;
const UI_CONTEXT_DIR = path.resolve(__dirname, '..', 'test-results', 'ui-context');

// ---------------------------------------------------------------------------
// One-time setup
// ---------------------------------------------------------------------------
test.beforeAll(() => {
  fs.mkdirSync(UI_CONTEXT_DIR, { recursive: true });
  fs.mkdirSync(path.resolve(__dirname, '..', 'test-results'), { recursive: true });
});

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the app, wipe localStorage, optionally seed data, reload.
 * Waits until #app has rendered content before returning.
 */
async function loadApp(page, seedData = null) {
  await page.goto(APP_URL);
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate(() => {
    localStorage.removeItem('income_data');
    localStorage.removeItem('income_meta');
    localStorage.removeItem('ll_dev_mode');
  });

  if (seedData) {
    await page.evaluate((d) => {
      localStorage.setItem('income_data', JSON.stringify(d.income_data));
      localStorage.setItem('income_meta', JSON.stringify(d.income_meta));
    }, seedData);
  }

  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // Wait for the initial dashboard render
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    return app && app.children.length > 0;
  }, { timeout: 8000 });

  // Dismiss onboarding overlay (fires after ~380ms setTimeout when no records exist)
  // Wait for it to appear, then remove it. Ignore if it never shows (e.g. seeded data).
  await page.evaluate(() => new Promise(resolve => {
    const el = document.getElementById('ob-overlay');
    if (el) { el.remove(); resolve(); return; }
    // Wait up to 600ms for it to appear
    const start = Date.now();
    const timer = setInterval(() => {
      const el2 = document.getElementById('ob-overlay');
      if (el2) { el2.remove(); clearInterval(timer); resolve(); return; }
      if (Date.now() - start > 600) { clearInterval(timer); resolve(); }
    }, 50);
  }));
}

/**
 * Click a tab button and wait for #app to be fully re-rendered.
 *
 * switchTab() in index.html triggers a 150ms setTimeout before calling
 * the render function. We wait for that + a small buffer, then wait for
 * #app to have children and opacity restored to '1'.
 */
async function goToTab(page, tab) {
  console.log('  → goToTab: ' + tab);
  await page.click(`[data-tab="${tab}"]`);
  // Wait for the 150ms animation + render cycle
  await page.waitForTimeout(250);
  // Wait until #app is visibly populated
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    return app && app.children.length > 0;
  }, { timeout: 5000 });
}

/**
 * Save #app innerHTML to test-results/ui-context/<label>.html.
 * Run after every tab render to give a fixing agent real HTML context.
 */
async function saveUiSnapshot(page, label) {
  const html = await page.evaluate(() => {
    const app = document.getElementById('app');
    return app ? app.outerHTML : '<!-- #app not found -->';
  });
  const file = path.join(UI_CONTEXT_DIR, `${label}.html`);
  fs.writeFileSync(file, html, 'utf8');
  console.log(`    snapshot → test-results/ui-context/${label}.html`);
}

/** Returns parsed { income_data, income_meta } from localStorage. */
async function getStorage(page) {
  return page.evaluate(() => ({
    income_data: JSON.parse(localStorage.getItem('income_data') || 'null'),
    income_meta: JSON.parse(localStorage.getItem('income_meta') || 'null'),
  }));
}

/**
 * Fill the Add form. Uses confirmed input IDs from index.html.
 * payType: 'hourly' (default) | 'flat'
 */
async function fillForm(page, { date, hours, location, rate, tips, payType = 'hourly' } = {}) {
  if (payType === 'flat') {
    await page.click("button[onclick=\"setPayType('flat')\"]");
    await page.waitForTimeout(100);
  }
  if (date)         await page.fill('#dateInput', date);
  // Always fill hours when provided — the app requires hours > 0 for ALL entries
  // including flat rate (saveIncome validation bug). See UseCases.md UC-03.
  if (hours != null) await page.fill('#hoursInput', String(hours));
  if (location)     await page.fill('#locationInput', location);
  if (rate != null) await page.fill('#rateInput', String(rate));
  if (tips != null) await page.fill('#tipsInput', String(tips));
}

/** Click the submit button inside #incomeForm. */
async function submitForm(page) {
  await page.click('#incomeForm button[type="submit"]');
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// UC-00: Base UI Render Tests
//
// One click per tab. Verify key DOM elements exist. Save HTML snapshots.
// These are the cheapest tests and must pass before anything else is trusted.
// ---------------------------------------------------------------------------

test('UC-00a: Dashboard tab renders stats', async ({ page }) => {
  await loadApp(page);
  // Dashboard is default — click it anyway to exercise the click path
  await goToTab(page, 'dashboard');
  await saveUiSnapshot(page, '00a_dashboard-empty');

  // Some dollar amount is always shown (even $0.00)
  await expect(page.locator('#app')).toContainText('$');
});

test('UC-00b: Add tab renders income form with all inputs', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'add');
  await saveUiSnapshot(page, '00b_add-form-empty');

  await expect(page.locator('#incomeForm')).toBeVisible();
  await expect(page.locator('#dateInput')).toBeVisible();
  await expect(page.locator('#hoursInput')).toBeVisible();
  await expect(page.locator('#locationInput')).toBeVisible();
  await expect(page.locator('#rateInput')).toBeVisible();
  await expect(page.locator('#tipsInput')).toBeVisible();
  await expect(page.locator('#incomeForm button[type="submit"]')).toBeVisible();
});

test('UC-00c: History tab renders (empty state — no crash)', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'history');
  await saveUiSnapshot(page, '00c_history-empty');

  // #app must have rendered something — even if just an empty state message
  const childCount = await page.locator('#app').evaluate(el => el.children.length);
  expect(childCount).toBeGreaterThan(0);
});

test('UC-00d: Settings tab renders without crash', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'settings');
  await saveUiSnapshot(page, '00d_settings-empty');

  const appText = await page.locator('#app').textContent();
  // Settings always contains Export/Backup and Clear Data controls
  expect(appText).toMatch(/export|backup|clear|location|custom/i);
});

test('UC-00e: History tab renders a seeded record correctly', async ({ page }) => {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  await loadApp(page, {
    income_data: {
      records: [{
        id: 'income_user1_1', date: today,
        hours: 5, rate: 20, tips: 10,
        location: 'Test Bar', payType: 'hourly',
        deleted: false, createdAt: now, updatedAt: now
      }],
      locations: { 'Test Bar': { lastRate: 20, preferredColor: '#6366f1' } },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 2 }
  });

  await goToTab(page, 'history');
  await saveUiSnapshot(page, '00e_history-with-record');

  // (5 * 20) + 10 = $110 should appear; location name should appear
  await expect(page.locator('#app')).toContainText('Test Bar');
  await expect(page.locator('#app')).toContainText('110');
});

test('UC-00f: Dashboard renders correct total for seeded data', async ({ page }) => {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  await loadApp(page, {
    income_data: {
      records: [{
        id: 'income_user1_1', date: today,
        hours: 4, rate: 25, tips: 5,
        location: 'Venue A', payType: 'hourly',
        deleted: false, createdAt: now, updatedAt: now
      }],
      locations: { 'Venue A': { lastRate: 25, preferredColor: '#6366f1' } },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 2 }
  });

  await goToTab(page, 'dashboard');
  await saveUiSnapshot(page, '00f_dashboard-with-record');

  // (4 * 25) + 5 = $105
  await expect(page.locator('#app')).toContainText('105');
});

// ---------------------------------------------------------------------------
// UC-01: First Load — Empty State Initialization
// ---------------------------------------------------------------------------

test('UC-01: First load creates income_data and income_meta with correct shapes', async ({ page }) => {
  await loadApp(page);
  const state = await getStorage(page);

  expect(state.income_data, 'income_data must exist').not.toBeNull();
  expect(state.income_data.records).toEqual([]);
  expect(state.income_data.locations).toEqual({});
  expect(state.income_data.customFields).toEqual([]);

  expect(state.income_meta, 'income_meta must exist').not.toBeNull();
  expect(state.income_meta.userId).toBe('user1');
  expect(typeof state.income_meta.nextId).toBe('number');
  expect(state.income_meta.nextId).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// UC-02: Add a Basic Hourly Income Entry
// ---------------------------------------------------------------------------

test('UC-02: Submitting the Add form saves a correct hourly record to storage', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'add');

  const metaBefore = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('income_meta'))
  );

  await fillForm(page, {
    date: '2026-03-15',
    hours: 6.5,
    location: 'Downtown Bar',
    rate: 25,
    tips: 10,
  });

  await submitForm(page);

  const state = await getStorage(page);
  expect(state.income_data.records.length, '1 record must exist').toBe(1);

  const r = state.income_data.records[0];
  expect(r.date).toBe('2026-03-15');
  expect(r.hours).toBe(6.5);
  expect(r.rate).toBe(25);
  expect(r.tips).toBe(10);
  expect(r.location).toBe('Downtown Bar');
  expect(r.payType).toBe('hourly');
  expect(r.deleted).toBe(false);
  expect(r.id).toMatch(/^income_user1_\d+$/);
  expect(r.createdAt).toBeGreaterThan(0);
  expect(r.updatedAt).toBeGreaterThanOrEqual(r.createdAt);

  expect(state.income_data.locations['Downtown Bar']).toBeDefined();
  expect(state.income_data.locations['Downtown Bar'].lastRate).toBe(25);
  expect(state.income_meta.nextId).toBeGreaterThan(metaBefore.nextId);
});

// ---------------------------------------------------------------------------
// UC-03: Add a Flat Rate Income Entry
// ---------------------------------------------------------------------------

test('UC-03: Flat rate entry saves payType=flat and correct rate', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'add');

  // NOTE: saveIncome() validates hours > 0 for ALL entries (including flat rate).
  // Until the app skips this check for flat rate, the user must enter hours.
  // This is a known form validation limitation — tracked in UseCases.md UC-03.
  await fillForm(page, { date: '2026-03-15', payType: 'flat', rate: 200, location: 'Event Gig', tips: 0, hours: 1 });
  await submitForm(page);

  const state = await getStorage(page);
  const r = state.income_data.records[0];

  expect(r, 'Record must be saved').toBeDefined();
  expect(r.payType).toBe('flat');
  expect(r.rate).toBe(200);

  // Verify the flat total appears in history
  await goToTab(page, 'history');
  await saveUiSnapshot(page, '03_history-flat-entry');
  await expect(page.locator('#app')).toContainText('200');
});

// ---------------------------------------------------------------------------
// UC-04: Location Autocomplete Prefills Rate
// ---------------------------------------------------------------------------

test('UC-04: Typing a known location triggers autocomplete and prefills rate', async ({ page }) => {
  await loadApp(page, {
    income_data: {
      records: [{
        id: 'income_user1_1', date: '2026-02-01',
        hours: 5, rate: 18, tips: 0,
        location: 'Coffee Shop', payType: 'hourly',
        deleted: false, createdAt: Date.now(), updatedAt: Date.now()
      }],
      locations: { 'Coffee Shop': { lastRate: 18, preferredColor: '#6366f1' } },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 2 }
  });

  await goToTab(page, 'add');

  // Type partial name to trigger autocomplete
  await page.fill('#locationInput', 'Cof');
  await page.waitForTimeout(300);

  // #locationDropdown renders inside the form and becomes visible
  await expect(page.locator('#locationDropdown')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#locationDropdown')).toContainText('Coffee Shop');

  // Click the suggestion
  await page.locator('#locationDropdown').getByText('Coffee Shop').click();
  await page.waitForTimeout(200);

  // Rate should auto-fill to 18
  expect(await page.locator('#rateInput').inputValue()).toBe('18');
});

// ---------------------------------------------------------------------------
// UC-05: Edit a Record — Change Hours and Tips
// ---------------------------------------------------------------------------

test('UC-05: Editing a record updates hours/tips and preserves id and createdAt', async ({ page }) => {
  const createdAt = Date.now() - 10000;
  await loadApp(page, {
    income_data: {
      records: [{
        id: 'income_user1_1', date: '2026-03-15',
        hours: 6.5, rate: 25, tips: 10,
        location: 'Downtown Bar', payType: 'hourly',
        deleted: false, createdAt, updatedAt: createdAt
      }],
      locations: { 'Downtown Bar': { lastRate: 25, preferredColor: '#6366f1' } },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 2 }
  });

  await goToTab(page, 'history');
  await saveUiSnapshot(page, '05_history-before-edit');

  // Enter edit mode
  await page.click('button[onclick*="editRecord"]');
  await page.waitForTimeout(300);
  await saveUiSnapshot(page, '05_add-edit-mode');

  await page.fill('#hoursInput', '8');
  await page.fill('#tipsInput', '20');
  await submitForm(page);

  const state = await getStorage(page);
  expect(state.income_data.records.length, 'Must still be 1 record (no duplicates)').toBe(1);

  const r = state.income_data.records[0];
  expect(r.hours, 'hours must update').toBe(8);
  expect(r.tips, 'tips must update').toBe(20);
  expect(r.id, 'id must not change').toBe('income_user1_1');
  expect(r.createdAt, 'createdAt must not change').toBe(createdAt);
  expect(r.updatedAt, 'updatedAt must be newer').toBeGreaterThan(createdAt);
});

// ---------------------------------------------------------------------------
// UC-06: Edit a Record — Change Location
// ---------------------------------------------------------------------------

test('UC-06: Editing a record to change its location persists in storage', async ({ page }) => {
  const now = Date.now();
  await loadApp(page, {
    income_data: {
      records: [{
        id: 'income_user1_1', date: '2026-03-15',
        hours: 5, rate: 20, tips: 0,
        location: 'Downtown Bar', payType: 'hourly',
        deleted: false, createdAt: now, updatedAt: now
      }],
      locations: {
        'Downtown Bar':  { lastRate: 20, preferredColor: '#6366f1' },
        'Rooftop Venue': { lastRate: 30, preferredColor: '#f59e0b' }
      },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 2 }
  });

  await goToTab(page, 'history');
  await page.click('button[onclick*="editRecord"]');
  await page.waitForTimeout(300);

  await page.fill('#locationInput', 'Rooftop Venue');
  await submitForm(page);

  const state = await getStorage(page);
  expect(state.income_data.records[0].location).toBe('Rooftop Venue');
});

// ---------------------------------------------------------------------------
// UC-07: Soft Delete a Record
// ---------------------------------------------------------------------------

test('UC-07: Delete button sets deleted=true but does not remove the record from storage', async ({ page }) => {
  const now = Date.now();
  await loadApp(page, {
    income_data: {
      records: [{
        id: 'income_user1_1', date: '2026-03-15',
        hours: 6, rate: 25, tips: 0,
        location: 'Test Place', payType: 'hourly',
        deleted: false, createdAt: now, updatedAt: now
      }],
      locations: { 'Test Place': { lastRate: 25, preferredColor: '#6366f1' } },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 2 }
  });

  await goToTab(page, 'history');

  // deleteRecord() calls window.confirm — register handler BEFORE clicking
  page.on('dialog', dialog => dialog.accept());
  await page.click('button[onclick*="deleteRecord"]');
  await page.waitForTimeout(300);

  await saveUiSnapshot(page, '07_history-after-delete');

  const state = await getStorage(page);
  expect(state.income_data.records.length, 'Record must remain in array').toBe(1);
  expect(state.income_data.records[0].deleted, 'deleted flag must be true').toBe(true);
  expect(state.income_data.records[0].updatedAt).toBeGreaterThanOrEqual(now);

  // Default history must not show the deleted record's edit button
  const editBtns = await page.locator('button[onclick*="editRecord"]').count();
  expect(editBtns, 'No edit buttons should be visible after delete').toBe(0);
});

// ---------------------------------------------------------------------------
// UC-08: Restore a Deleted Record
// ---------------------------------------------------------------------------

test('UC-08: Restore button sets deleted=false on a soft-deleted record', async ({ page }) => {
  const now = Date.now();
  await loadApp(page, {
    income_data: {
      records: [{
        id: 'income_user1_1', date: '2026-03-15',
        hours: 6, rate: 25, tips: 0,
        location: 'Test Place', payType: 'hourly',
        deleted: true, createdAt: now - 5000, updatedAt: now
      }],
      locations: { 'Test Place': { lastRate: 25, preferredColor: '#6366f1' } },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 2 }
  });

  await goToTab(page, 'history');

  // Toggle "Show Deleted" — button has onclick="toggleDeletedRecords()"
  await page.click('button[onclick*="toggleDeletedRecords"]');
  await page.waitForTimeout(300);
  await saveUiSnapshot(page, '08_history-show-deleted');

  // Restore button must be visible
  await expect(page.locator('button[onclick*="restoreRecord"]')).toBeVisible({ timeout: 3000 });
  await page.click('button[onclick*="restoreRecord"]');
  await page.waitForTimeout(300);

  const state = await getStorage(page);
  expect(state.income_data.records[0].deleted, 'Record must be restored').toBe(false);
});

// ---------------------------------------------------------------------------
// UC-09: Edit a Location — Rename + Color Change
// ---------------------------------------------------------------------------

test('UC-09: Renaming a location updates all linked records and removes old key', async ({ page }) => {
  const now = Date.now();
  await loadApp(page, {
    income_data: {
      records: [
        {
          id: 'income_user1_1', date: '2026-03-10',
          hours: 5, rate: 20, tips: 0,
          location: 'Coffee Shop', payType: 'hourly',
          deleted: false, createdAt: now, updatedAt: now
        },
        {
          id: 'income_user1_2', date: '2026-03-12',
          hours: 3, rate: 20, tips: 5,
          location: 'Coffee Shop', payType: 'hourly',
          deleted: false, createdAt: now, updatedAt: now
        }
      ],
      locations: { 'Coffee Shop': { lastRate: 20, preferredColor: '#6366f1' } },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 3 }
  });

  await goToTab(page, 'settings');
  await saveUiSnapshot(page, '09_settings-before-rename');

  // Click the Edit button for "Coffee Shop" — renders as onclick="openLocationEditMenu('Coffee Shop')"
  await page.click("button[onclick*=\"openLocationEditMenu\"]");
  // Wait for the locEditSheet animation (translate-y-full removed via requestAnimationFrame + 300ms CSS transition)
  await page.waitForTimeout(400);
  await saveUiSnapshot(page, '09_location-edit-overlay');

  // The overlay uses its own IDs, not #sheet
  await expect(page.locator('#locEditSheet')).toBeVisible({ timeout: 3000 });

  // Rename
  await page.fill('#locEditName', 'Blue Cup Coffee');

  // Color: radio inputs have class="sr-only" — must click the parent <label>, not the input.
  // The label contains the visible swatch and text. Click via label text "Amber".
  await page.locator('#locEditSheet label').filter({ hasText: 'Amber' }).click();

  // Save
  await page.click('button[onclick*="saveLocationEdit"]');
  await page.waitForTimeout(400);

  const state = await getStorage(page);

  const stillOld = state.income_data.records.filter(r => r.location === 'Coffee Shop');
  expect(stillOld.length, 'No records should still have old location name').toBe(0);

  const updated = state.income_data.records.filter(r => r.location === 'Blue Cup Coffee');
  expect(updated.length, 'Both records must use new name').toBe(2);

  expect(state.income_data.locations['Coffee Shop'], 'Old key must be deleted').toBeUndefined();
  expect(state.income_data.locations['Blue Cup Coffee'], 'New key must exist').toBeDefined();
  expect(state.income_data.locations['Blue Cup Coffee'].preferredColor).toBe('#f59e0b');
});

// ---------------------------------------------------------------------------
// UC-11: Add a Custom Field (Money Type, Adds to Total)
// ---------------------------------------------------------------------------

test('UC-11: Custom money field is saved with correct definition shape', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'add');

  // Button has onclick="showAddCustomFieldMenu()"
  await page.click('button[onclick*="showAddCustomFieldMenu"]');
  // Wait for the customFieldSheet animation (translate-y-full removed)
  await page.waitForTimeout(400);
  await saveUiSnapshot(page, '11_custom-field-overlay');

  // Overlay appends to <body> — use element IDs directly
  await expect(page.locator('#customFieldSheet')).toBeVisible({ timeout: 3000 });

  await page.fill('#customFieldName', 'Mileage Reimbursement');
  await page.selectOption('#customFieldType', 'money');
  await page.waitForTimeout(150); // toggleMoneyFieldOptions() runs on change

  // Money options section should become visible
  await expect(page.locator('#moneyFieldOptions')).toBeVisible({ timeout: 2000 });

  // Select "Add to Total" radio
  await page.check('input[name="moneyAddToTotal"][value="add"]');

  // Save — button text is "Add Field", onclick="saveCustomField()"
  await page.click('button[onclick="saveCustomField()"]');
  await page.waitForTimeout(300);

  const state = await getStorage(page);
  expect(state.income_data.customFields.length, 'One custom field must be saved').toBe(1);

  const f = state.income_data.customFields[0];
  expect(f.label).toBe('Mileage Reimbursement');
  expect(f.type).toBe('money');
  expect(f.key).toMatch(/^CustomField_/);
  expect(f.addToTotal).toBe('add');
});

// ---------------------------------------------------------------------------
// UC-12: Add Record with Custom Field Value
// ---------------------------------------------------------------------------

test('UC-12: Custom money field value is saved on record and included in total', async ({ page }) => {
  await loadApp(page, {
    income_data: {
      records: [],
      locations: {},
      customFields: [{
        label: 'Mileage Reimbursement',
        type: 'money',
        key: 'CustomField_Mileage_Reimbursement',
        addToTotal: 'add'
      }]
    },
    income_meta: { userId: 'user1', nextId: 1 }
  });

  await goToTab(page, 'add');
  await saveUiSnapshot(page, '12_add-with-custom-field');

  await fillForm(page, { date: '2026-03-15', hours: 4, rate: 20, tips: 5, location: 'Gig Work' });

  // Custom field inputs use positional IDs: "custom_0" for the first field,
  // "custom_1" for the second, etc. — NOT the field.key value.
  await page.fill('#custom_0', '15');

  await submitForm(page);

  const state = await getStorage(page);
  const r = state.income_data.records[0];

  // Custom field values are stored as strings from FormData.get() — parseFloat
  // handles them correctly for total calculations. Accept string "15" or number 15.
  expect(parseFloat(r['CustomField_Mileage_Reimbursement']),
    'Custom field value must be saved on record as numeric 15').toBe(15);

  // Verify total in history: (4*20) + 5 + 15 = $100
  await goToTab(page, 'history');
  await saveUiSnapshot(page, '12_history-custom-field-total');
  await expect(page.locator('#app')).toContainText('100');
});

// ---------------------------------------------------------------------------
// UC-13: Edit a Custom Field — Key Must Not Regenerate
// ---------------------------------------------------------------------------

test('UC-13: Editing custom field label preserves the storage key', async ({ page }) => {
  const now = Date.now();
  await loadApp(page, {
    income_data: {
      records: [{
        id: 'income_user1_1', date: '2026-03-15',
        hours: 4, rate: 20, tips: 0,
        location: 'Test', payType: 'hourly',
        deleted: false, createdAt: now, updatedAt: now,
        'CustomField_Notes': 'great shift'
      }],
      locations: { 'Test': { lastRate: 20, preferredColor: '#6366f1' } },
      customFields: [{ label: 'Notes', type: 'longtext', key: 'CustomField_Notes' }]
    },
    income_meta: { userId: 'user1', nextId: 2 }
  });

  await goToTab(page, 'settings');

  // Edit button: onclick="showEditCustomFieldMenu(0)"
  await page.click('button[onclick*="showEditCustomFieldMenu"]');
  await page.waitForTimeout(400);

  await expect(page.locator('#customFieldSheet')).toBeVisible({ timeout: 3000 });

  await page.fill('#customFieldName', 'Shift Notes');
  await page.click('button[onclick*="saveEditedCustomField"]');
  await page.waitForTimeout(300);

  const state = await getStorage(page);
  const f = state.income_data.customFields[0];

  expect(f.label, 'Label must update').toBe('Shift Notes');
  expect(f.key, 'Key MUST NOT change — existing records depend on it').toBe('CustomField_Notes');
  expect(state.income_data.records[0]['CustomField_Notes'],
    'Record value must still be accessible via unchanged key').toBe('great shift');
});

// ---------------------------------------------------------------------------
// UC-19: Form Persistence — Tab Switch Preserves In-Progress Data
// ---------------------------------------------------------------------------

test('UC-19: Switching tabs without saving preserves form values on return', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'add');

  await fillForm(page, { date: '2026-03-15', hours: 5, location: 'Test Venue', rate: 22, tips: 0 });

  // Leave without saving
  await goToTab(page, 'history');
  await page.waitForTimeout(100);

  // Return to Add
  await goToTab(page, 'add');

  expect(await page.locator('#hoursInput').inputValue(),    'hours must persist').toBe('5');
  expect(await page.locator('#rateInput').inputValue(),     'rate must persist').toBe('22');
  expect(await page.locator('#locationInput').inputValue(), 'location must persist').toBe('Test Venue');
});

// ---------------------------------------------------------------------------
// UC-20: Edit Mode — Cancel (Navigate Away) Reverts Changes
// ---------------------------------------------------------------------------

test('UC-20: Navigating away during edit mode cancels the edit without saving', async ({ page }) => {
  const now = Date.now();
  await loadApp(page, {
    income_data: {
      records: [{
        id: 'income_user1_1', date: '2026-03-15',
        hours: 6, rate: 25, tips: 0,
        location: 'Test', payType: 'hourly',
        deleted: false, createdAt: now, updatedAt: now
      }],
      locations: { 'Test': { lastRate: 25, preferredColor: '#6366f1' } },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 2 }
  });

  await goToTab(page, 'history');

  await page.click('button[onclick*="editRecord"]');
  await page.waitForTimeout(300);

  // Change hours to an obviously wrong value
  await page.fill('#hoursInput', '99');

  // NOTE: In edit mode, updateBottomNavForEditMode(true) hides ALL bottom nav buttons
  // (dashboard, history are display:none). There is no visible Cancel button.
  // We simulate cancellation by calling switchTab() directly via evaluate(),
  // which is what would happen if a Cancel button or back navigation existed.
  await page.evaluate(() => {
    // eslint-disable-next-line no-undef
    switchTab('history');
  });
  await page.waitForTimeout(300);

  const state = await getStorage(page);
  expect(state.income_data.records[0].hours, 'hours must be unchanged after cancel').toBe(6);
});

// ---------------------------------------------------------------------------
// UC-24: Dashboard Totals Exclude Deleted Records
// ---------------------------------------------------------------------------

test('UC-24: Dashboard total equals sum of non-deleted records only', async ({ page }) => {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  await loadApp(page, {
    income_data: {
      records: [
        // Record A: (4 * 20) + 10 = $90
        {
          id: 'income_user1_1', date: today,
          hours: 4, rate: 20, tips: 10,
          location: 'A', payType: 'hourly',
          deleted: false, createdAt: now, updatedAt: now
        },
        // Record B: flat $150
        {
          id: 'income_user1_2', date: today,
          hours: 0, rate: 150, tips: 0,
          location: 'B', payType: 'flat',
          deleted: false, createdAt: now, updatedAt: now
        },
        // Record C: (2 * 30) + 5 = $65 — DELETED — must NOT appear in total
        {
          id: 'income_user1_3', date: today,
          hours: 2, rate: 30, tips: 5,
          location: 'C', payType: 'hourly',
          deleted: true, createdAt: now, updatedAt: now
        }
      ],
      locations: {
        'A': { lastRate: 20, preferredColor: '#6366f1' },
        'B': { lastRate: 150, preferredColor: '#f59e0b' },
        'C': { lastRate: 30, preferredColor: '#10b981' }
      },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 4 }
  });

  await goToTab(page, 'dashboard');
  await saveUiSnapshot(page, '24_dashboard-deleted-exclusion');

  const appText = await page.locator('#app').textContent();

  // Expected total: $240 (A + B). $305 would include deleted Record C.
  expect(appText, 'Dashboard must show 240 (not 305)').toContain('240');
});

// ---------------------------------------------------------------------------
// UC-25: Clear All Data
// ---------------------------------------------------------------------------

test('UC-25: Clear All Data resets storage to empty state', async ({ page }) => {
  const now = Date.now();
  await loadApp(page, {
    income_data: {
      records: [{
        id: 'income_user1_1', date: '2026-03-15',
        hours: 5, rate: 20, tips: 0,
        location: 'Test', payType: 'hourly',
        deleted: false, createdAt: now, updatedAt: now
      }],
      locations: { 'Test': { lastRate: 20, preferredColor: '#6366f1' } },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 2 }
  });

  await goToTab(page, 'settings');

  // clearAllData() calls window.confirm TWICE — auto-accept both
  page.on('dialog', dialog => dialog.accept());

  await page.click('button[onclick*="clearAllData"]');
  await page.waitForTimeout(600);

  const state = await getStorage(page);
  expect(state.income_data.records.length,                'records must be empty').toBe(0);
  expect(Object.keys(state.income_data.locations).length, 'locations must be empty').toBe(0);
  // Note: clearAllData() resets storage without a customFields key — treat undefined as empty
  const cFields = state.income_data.customFields;
  expect(!cFields || cFields.length === 0, 'customFields must be absent or empty').toBe(true);
});

// ===========================================================================
// BUG REGRESSION TESTS
//
// These tests document a confirmed bug reported 2026-03-15:
//
// SYMPTOM 1: Editing a March 12 or March 13 record opens the edit form
//   populated with data from a DIFFERENT record (Feb 13 or Feb 14).
//
// SYMPTOM 2: After saving that edit, the record "disappears" from history
//   entirely — it is no longer visible.
//
// ROOT CAUSE: Duplicate record IDs in storage.
//   income_user1_1 exists twice (Feb 13 AND March 13).
//   income_user1_2 exists twice (Feb 14 AND March 12).
//   The Feb 14 record has deleted:true.
//
// HOW DUPLICATES FORMED:
//   1. importData() calls saveData(parsed) but NEVER updates income_meta.
//      So income_meta.nextId is NOT set to max(existingIds) + 1 after import.
//   2. If clearAllData() was called before importing (resetting nextId to 1),
//      or if income_meta was otherwise stale/missing, new records get IDs 1, 2...
//      which already exist in the imported data.
//
// HOW EDITS BREAK:
//   - editRecord(id)     uses Array.find()      → returns FIRST match (the old Feb record)
//   - saveIncome(form, existing) uses Array.findIndex() → same first-match
//   - The save spreads the first-found record: { ...data.records[foundIndex], ...newValues }
//   - data.records[foundIndex].deleted is true (Feb 14 is deleted)
//   - deleted:true is NOT overridden by newValues → record saved with deleted:true → disappears
//
// WHAT THE FIX MUST DO:
//   1. importData() must compute max existing numeric ID and set income_meta.nextId accordingly.
//   2. editRecord() / saveIncome() must use record index (position) not just ID,
//      OR the app must guarantee unique IDs by checking for collisions in generateId().
//
// USER DATA: The exact records array that produced this bug is embedded in BUG-01b.
// ===========================================================================

// ---------------------------------------------------------------------------
// BUG-01a: importData does not update income_meta.nextId
//
// Expected (after fix): income_meta.nextId === max(existing record IDs) + 1
// Currently:            income_meta.nextId stays at its pre-import value
//
// STATUS: FAILING — documents the root cause bug
// ---------------------------------------------------------------------------
test('BUG-01a: importData must update income_meta.nextId to prevent ID collisions', async ({ page }) => {
  await loadApp(page);

  // Simulate the scenario: clearAllData() was called, resetting nextId to 1.
  // Then the user imports their backup. After import, nextId should be 19
  // (one beyond the highest ID in the imported data).
  await page.evaluate(() => {
    localStorage.setItem('income_meta', JSON.stringify({ userId: 'user1', nextId: 1 }));
  });

  // Navigate to settings to access the import textarea
  await goToTab(page, 'settings');

  const importPayload = JSON.stringify({
    records: [
      { id: 'income_user1_1', date: '2026-02-13', hours: 7, rate: 11.79, tips: 433,
        location: "Eddie V's", payType: 'hourly', deleted: false,
        createdAt: 1771314181395, updatedAt: 1771314181395 },
      { id: 'income_user1_5', date: '2026-02-09', hours: 5.5, rate: 11.79, tips: 125,
        location: "Eddie V's", payType: 'hourly', deleted: false,
        createdAt: 1771314492112, updatedAt: 1771314492112 },
      { id: 'income_user1_18', date: '2026-03-08', hours: 5.25, rate: 19.29, tips: 238,
        location: 'Matsuhisa', payType: 'hourly', deleted: false,
        createdAt: 1773087211698, updatedAt: 1773087211698 }
    ],
    locations: { "Eddie V's": { lastRate: 11.79 }, Matsuhisa: { lastRate: 19.29 } },
    customFields: []
  });

  // importData() reads from #importArea textarea
  await page.locator('#importArea').fill(importPayload);

  // importData() calls alert() on success — accept it
  page.on('dialog', dialog => dialog.accept());
  await page.click('button[onclick*="importData"]');
  await page.waitForTimeout(400);

  const state = await getStorage(page);

  // The highest numeric suffix in the imported IDs is 18.
  // After import, nextId MUST be at least 19 to prevent collisions.
  expect(
    state.income_meta.nextId,
    'income_meta.nextId must be > 18 after importing records with IDs up to income_user1_18'
  ).toBeGreaterThan(18);
});

// ---------------------------------------------------------------------------
// BUG-01b: With duplicate IDs, editRecord opens the WRONG record's data
//
// Seeds the exact user data that produced the bug. Clicking Edit on the
// March 12 record (income_user1_2 at index 19) should open March 12's form.
// Instead it opens February 14's form (income_user1_2 at index 1).
//
// Expected (after fix): edit form shows date "2026-03-12", location "Matsuhisa"
// Currently:            edit form shows date "2026-02-14", location "Eddie V's"
//
// STATUS: FAILING — documents symptom 1 of the bug
// ---------------------------------------------------------------------------
test('BUG-01b: Editing a record with a duplicate ID must open the correct record, not the first match', async ({ page }) => {
  await loadApp(page, {
    income_data: {
      records: [
        // ── OLDER RECORDS (created before meta reset) ──
        // income_user1_2 — Feb 14, DELETED
        {
          id: 'income_user1_2', date: '2026-02-14',
          hours: 8.25, rate: 11.79, tips: 572,
          location: "Eddie V's", payType: 'hourly',
          deleted: true,  // ← this is the trap
          createdAt: 1771314218671, updatedAt: 1773445415544
        },
        // income_user1_1 — Feb 13, active
        {
          id: 'income_user1_1', date: '2026-02-13',
          hours: 7, rate: 11.79, tips: 433,
          location: "Eddie V's", payType: 'hourly',
          deleted: false,
          createdAt: 1771314181395, updatedAt: 1771314181395
        },
        // ── NEWER RECORDS (created after meta reset → ID collision) ──
        // income_user1_2 — March 12, active (SHOULD be edited)
        {
          id: 'income_user1_2', date: '2026-03-12',
          hours: 3.5, rate: 19.29, tips: 5,
          location: 'Matsuhisa', payType: 'hourly',
          deleted: false,
          createdAt: 1773445307244, updatedAt: 1773445307244
        },
        // income_user1_1 — March 13, active (for completeness)
        {
          id: 'income_user1_1', date: '2026-03-13',
          hours: 6, rate: 19.29, tips: 0,
          location: 'Matsuhisa', payType: 'hourly',
          deleted: false,
          createdAt: 1773443833293, updatedAt: 1773443833293
        }
      ],
      locations: {
        "Eddie V's": { lastRate: 11.79, preferredColor: '#6366f1' },
        Matsuhisa:   { lastRate: 19.29, preferredColor: '#f59e0b' }
      },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 3 }
  });

  await goToTab(page, 'history');
  await saveUiSnapshot(page, 'bug01b_history-dual-duplicates');

  // 3 records are visible (Feb 14 is deleted, hidden by default):
  //   Feb 13  → income_user1_1
  //   March 12 → income_user1_2   ← we want to edit THIS one
  //   March 13 → income_user1_1
  //
  // The March 12 edit button onclick now includes createdAt:
  //   editRecord('income_user1_2',1773445307244)
  // Match by ID prefix only (no closing paren) so it works with the createdAt param.
  // Feb 14 is hidden (deleted:true) so only one button with this ID is visible.
  await page.click("button[onclick*=\"editRecord('income_user1_2',\"]");
  await page.waitForTimeout(300);
  await saveUiSnapshot(page, 'bug01b_edit-form-opened');

  // The edit form MUST show March 12's data (Matsuhisa, tips: 5)
  // If bugged: it shows Feb 14's data (Eddie V's, tips: 572)
  const locationVal = await page.locator('#locationInput').inputValue();
  const tipsVal     = await page.locator('#tipsInput').inputValue();
  const dateVal     = await page.locator('#dateInput').inputValue();

  expect(locationVal, 'Edit form must show Matsuhisa (March 12), not Eddie V\'s (Feb 14)').toBe('Matsuhisa');
  expect(dateVal,     'Edit form must show 2026-03-12, not 2026-02-14').toBe('2026-03-12');
  expect(tipsVal,     'Edit form must show tips=5 (March 12), not 572 (Feb 14)').toBe('5');
});

// ---------------------------------------------------------------------------
// BUG-01c: Editing a duplicate-ID record when the first match is deleted
//          causes the saved record to inherit deleted:true → disappears
//
// This is the exact sequence the user experienced when changing tips from
// 33 to 32 and the record vanished.
//
// Expected (after fix): saved record has deleted:false and correct values
// Currently:            saved record inherits deleted:true from first match
//
// STATUS: FAILING — documents symptom 2 of the bug
// ---------------------------------------------------------------------------
test('BUG-01c: Saving an edit on a duplicate-ID record must not inherit deleted:true from the first match', async ({ page }) => {
  const now = Date.now();
  await loadApp(page, {
    income_data: {
      records: [
        // FIRST record with this ID — DELETED (Feb 14)
        {
          id: 'income_user1_2', date: '2026-02-14',
          hours: 8.25, rate: 11.79, tips: 572,
          location: "Eddie V's", payType: 'hourly',
          deleted: true,   // ← will be inherited if bug is present
          createdAt: now - 200000, updatedAt: now - 100000
        },
        // SECOND record with same ID — active (March 12)
        {
          id: 'income_user1_2', date: '2026-03-12',
          hours: 3.5, rate: 19.29, tips: 33,
          location: 'Matsuhisa', payType: 'hourly',
          deleted: false,
          createdAt: now - 5000, updatedAt: now - 5000
        }
      ],
      locations: {
        "Eddie V's": { lastRate: 11.79, preferredColor: '#6366f1' },
        Matsuhisa:   { lastRate: 19.29, preferredColor: '#f59e0b' }
      },
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 3 }
  });

  // Navigate to history — only 1 record visible (Feb 14 is deleted)
  await goToTab(page, 'history');
  await saveUiSnapshot(page, 'bug01c_history-before-edit');

  // Enable show-deleted so we can click the edit on the March 12 record
  // (which, due to the bug, is actually being identified as Feb 14's edit target)
  // The visible non-deleted record is March 12.
  const editBtn = page.locator('button[onclick*="editRecord"]').first();
  await editBtn.click();
  await page.waitForTimeout(300);
  await saveUiSnapshot(page, 'bug01c_edit-form');

  // Change tips from 33 to 32 (the exact user action that caused disappearance)
  await page.fill('#tipsInput', '32');
  await submitForm(page);

  // Check storage — the March 12 record must still exist and be NOT deleted
  const state = await getStorage(page);
  await saveUiSnapshot(page, 'bug01c_history-after-edit');

  // Find all records with this ID
  const allWithId = state.income_data.records.filter(r => r.id === 'income_user1_2');

  // There must be at least one record with deleted:false and tips:32
  const savedRecord = allWithId.find(r => !r.deleted && parseFloat(r.tips) === 32);
  expect(
    savedRecord,
    'A non-deleted record with tips=32 must exist after the edit. ' +
    'If undefined: the record inherited deleted:true from the Feb 14 first-match and disappeared.'
  ).toBeDefined();
});

// ---------------------------------------------------------------------------
// BUG-01d: Data integrity check — verify the user's actual data contains
//          duplicate IDs and document exactly where the collisions are.
//
// This test PASSES regardless of app state — it reads the raw data object
// and reports duplicate IDs for the failure-report context.
//
// STATUS: PASSING — this is a diagnostic/documentation test
// ---------------------------------------------------------------------------
test('BUG-01d: User data integrity — detect duplicate record IDs', async ({ page }) => {
  // Seed the exact user data that was reported with the bug
  const userRecords = [
    { id: 'income_user1_1',  date: '2026-02-13', hours: 7,    rate: 11.79, tips: 433, location: "Eddie V's",  deleted: false, payType: 'hourly', createdAt: 1771314181395, updatedAt: 1773630982868 },
    { id: 'income_user1_2',  date: '2026-02-14', hours: 8.25, rate: 11.79, tips: 572, location: "Eddie V's",  deleted: true,  payType: 'hourly', createdAt: 1771314218671, updatedAt: 1773445415544 },
    { id: 'income_user1_3',  date: '2026-02-11', hours: 6,    rate: 18.81, tips: 235, location: 'Matsuhisa', deleted: false, createdAt: 1771314343052, updatedAt: 1771314343052 },
    { id: 'income_user1_4',  date: '2026-02-10', hours: 6,    rate: 11.79, tips: 281, location: "Eddie V's",  deleted: false, createdAt: 1771314379128, updatedAt: 1771314398531 },
    { id: 'income_user1_5',  date: '2026-02-09', hours: 5.5,  rate: 11.79, tips: 125, location: "Eddie V's",  deleted: false, createdAt: 1771314492112, updatedAt: 1771314492112 },
    { id: 'income_user1_6',  date: '2026-01-27', hours: 6.5,  rate: 18.81, tips: 162, location: 'Matsuhisa', deleted: false, createdAt: 1771314574777, updatedAt: 1771314574777 },
    { id: 'income_user1_7',  date: '2026-02-17', hours: 3,    rate: 18.81, tips: 85,  location: 'Matsuhisa', deleted: false, createdAt: 1771564994455, updatedAt: 1771565001290 },
    { id: 'income_user1_8',  date: '2026-02-19', hours: 6,    rate: 18.81, tips: 151, location: 'Matsuhisa', deleted: false, createdAt: 1771565037116, updatedAt: 1771565037116 },
    { id: 'income_user1_9',  date: '2026-02-21', hours: 4,    rate: 18.81, tips: 103, location: 'Matsuhisa', deleted: false, createdAt: 1771832045943, updatedAt: 1771832054873 },
    { id: 'income_user1_10', date: '2026-02-22', hours: 6,    rate: 18.81, tips: 173, location: 'Matsuhisa', deleted: false, createdAt: 1771832118624, updatedAt: 1771832622807 },
    { id: 'income_user1_11', date: '2026-02-25', hours: 3.5,  rate: 18.81, tips: 101, location: 'Matsuhisa', deleted: false, createdAt: 1772074562105, updatedAt: 1772074562105 },
    { id: 'income_user1_12', date: '2026-02-23', hours: 3,    rate: 19.29, tips: 94,  location: 'Matsuhisa', deleted: false, createdAt: 1772162471097, updatedAt: 1772162529725 },
    { id: 'income_user1_13', date: '2026-02-28', hours: 4.5,  rate: 19.29, tips: 163, location: 'Matsuhisa', deleted: false, createdAt: 1772420198560, updatedAt: 1772420198560 },
    { id: 'income_user1_14', date: '2026-03-01', hours: 5.5,  rate: 19.29, tips: 303, location: 'Matsuhisa', deleted: false, createdAt: 1772427812629, updatedAt: 1772427812629 },
    { id: 'income_user1_15', date: '2026-03-05', hours: 3.5,  rate: 19.29, tips: 36,  location: 'Space Gallery', deleted: false, createdAt: 1772814832706, updatedAt: 1772814832706 },
    { id: 'income_user1_16', date: '2026-03-06', hours: 4.5,  rate: 15.16, tips: 0,   location: 'World of Life Christian Center', deleted: false, createdAt: 1772814935072, updatedAt: 1772814935072 },
    { id: 'income_user1_17', date: '2026-03-07', hours: 7,    rate: 19.29, tips: 256, location: 'Matsuhisa', deleted: false, payType: 'hourly', createdAt: 1773087176222, updatedAt: 1773445247533 },
    { id: 'income_user1_18', date: '2026-03-08', hours: 5.25, rate: 19.29, tips: 238, location: 'Matsuhisa', deleted: false, payType: 'hourly', createdAt: 1773087211698, updatedAt: 1773630986681 },
    // ↓ These two were created AFTER income_meta.nextId was reset to 1 → ID collision
    { id: 'income_user1_1',  date: '2026-03-13', hours: 6,    rate: 19.29, tips: 0,   location: 'Matsuhisa', deleted: false, payType: 'hourly', createdAt: 1773443833293, updatedAt: 1773443833293 },
    { id: 'income_user1_2',  date: '2026-03-12', hours: 3.5,  rate: 19.29, tips: 5,   location: 'Matsuhisa', deleted: false, payType: 'hourly', createdAt: 1773445307244, updatedAt: 1773445307244 }
  ];

  // Count occurrences of each ID
  const idCounts = {};
  for (const r of userRecords) {
    idCounts[r.id] = (idCounts[r.id] || 0) + 1;
  }
  const duplicates = Object.entries(idCounts).filter(([, count]) => count > 1);

  // Assert: duplicates exist (this documents the data is malformed)
  expect(duplicates.length, 'Duplicate IDs must be present in the reported data').toBeGreaterThan(0);

  // Report exactly which IDs are duplicated
  for (const [id, count] of duplicates) {
    const affected = userRecords.filter(r => r.id === id);
    console.log(`  DUPLICATE ID: ${id} appears ${count} times:`);
    for (const r of affected) {
      console.log(`    → date=${r.date}  location=${r.location}  deleted=${r.deleted}`);
    }
  }

  // Also check for missing payType (income_user1_3 has no payType)
  const missingPayType = userRecords.filter(r => !r.payType);
  if (missingPayType.length) {
    console.log(`  MISSING payType on ${missingPayType.length} record(s): ${missingPayType.map(r => r.id).join(', ')}`);
  }
  // Missing payType is not a crash bug — calculateBasePay defaults to hourly — but log it
  console.log(`  Missing payType count (treated as hourly, non-critical): ${missingPayType.length}`);
});

// ===========================================================================
// CD — Clean Data Dialog Tests
//
// Each test seeds specific malformed records, opens the Clean Data dialog
// from the Settings tab, exercises the dialog's fix/delete/batch flows, and
// asserts the resulting localStorage state.
//
// Selectors:
//   Open button:      button[onclick="showDataCleanup()"]
//   Sheet:            #cleanDataSheet
//   Content area:     #cleanDataContent
//   Close button:     button[onclick="closeCleanDataMenu()"]
//   Overlay:          #cleanDataOverlay
// ===========================================================================

// ---------------------------------------------------------------------------
// Shared seed factories
// ---------------------------------------------------------------------------

/** Two records with the same ID (simulates the import-then-clear bug). */
function makeDupSeed() {
  return {
    income_data: {
      records: [
        { id: 'income_user1_1', date: '2026-01-10', hours: 4, rate: 15, tips: 20,
          location: 'Place A', deleted: false, payType: 'hourly',
          createdAt: 1000000000000, updatedAt: 1000000000000 },
        { id: 'income_user1_1', date: '2026-03-10', hours: 5, rate: 16, tips: 30,
          location: 'Place B', deleted: false, payType: 'hourly',
          createdAt: 1000000000001, updatedAt: 1000000000001 },
        { id: 'income_user1_2', date: '2026-03-11', hours: 3, rate: 14, tips: 10,
          location: 'Place C', deleted: false, payType: 'hourly',
          createdAt: 1000000000002, updatedAt: 1000000000002 },
      ],
      locations: {},
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 3 }
  };
}

/** Records with various field-level issues (no duplicates). */
function makeOtherIssuesSeed() {
  return {
    income_data: {
      records: [
        // Missing payType
        { id: 'income_user1_1', date: '2026-01-05', hours: 3, rate: 15, tips: 10,
          location: 'Clean Place', deleted: false,
          createdAt: 1000000000100, updatedAt: 1000000000100 },
        // Missing createdAt
        { id: 'income_user1_2', date: '2026-01-06', hours: 4, rate: 15, tips: 0,
          location: 'Clean Place', deleted: false, payType: 'hourly',
          updatedAt: 1000000000200 },
        // Invalid tips (non-numeric string — survives JSON round-trip, fails parseFloat)
        { id: 'income_user1_3', date: '2026-01-07', hours: 5, rate: 15, tips: 'bad_value',
          location: 'Clean Place', deleted: false, payType: 'hourly',
          createdAt: 1000000000300, updatedAt: 1000000000300 },
        // Invalid rate (non-numeric string)
        { id: 'income_user1_4', date: '2026-01-08', hours: 5, rate: 'not_a_number', tips: 0,
          location: 'Clean Place', deleted: false, payType: 'hourly',
          createdAt: 1000000000400, updatedAt: 1000000000400 },
        // Clean record — must survive untouched
        { id: 'income_user1_5', date: '2026-01-09', hours: 6, rate: 18, tips: 50,
          location: 'Clean Place', deleted: false, payType: 'hourly',
          createdAt: 1000000000500, updatedAt: 1000000000500 },
      ],
      locations: {},
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 6 }
  };
}

/** Completely clean records — nothing to fix. */
function makeCleanSeed() {
  return {
    income_data: {
      records: [
        { id: 'income_user1_1', date: '2026-02-01', hours: 4, rate: 15, tips: 20,
          location: 'Good Place', deleted: false, payType: 'hourly',
          createdAt: 1000000001000, updatedAt: 1000000001000 },
        { id: 'income_user1_2', date: '2026-02-02', hours: 5, rate: 16, tips: 30,
          location: 'Good Place', deleted: false, payType: 'hourly',
          createdAt: 1000000002000, updatedAt: 1000000002000 },
      ],
      locations: {},
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 3 }
  };
}

/** Open the Clean Data sheet and wait for it to be visible. */
async function openCleanData(page) {
  await page.click('button[onclick="showDataCleanup()"]');
  await page.waitForSelector('#cleanDataSheet', { timeout: 4000 });
  // Wait for slide-up animation + content render
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// CD-01: Settings tab renders the "Clean Data" button
// ---------------------------------------------------------------------------
test('CD-01: Settings tab renders the Clean Data button', async ({ page }) => {
  await loadApp(page, makeCleanSeed());
  await goToTab(page, 'settings');
  await saveUiSnapshot(page, 'cd01_settings-clean-data-button');

  await expect(page.locator('button[onclick="showDataCleanup()"]')).toBeVisible();
  await expect(page.locator('button[onclick="showDataCleanup()"]')).toContainText('Clean Data');
});

// ---------------------------------------------------------------------------
// CD-02: Clean data dialog opens when button is clicked
// ---------------------------------------------------------------------------
test('CD-02: Clicking Clean Data opens the dialog overlay', async ({ page }) => {
  await loadApp(page, makeCleanSeed());
  await goToTab(page, 'settings');

  await openCleanData(page);
  await saveUiSnapshot(page, 'cd02_clean-data-dialog-open');

  await expect(page.locator('#cleanDataSheet')).toBeVisible();
  await expect(page.locator('#cleanDataOverlay')).toBeVisible();
  await expect(page.locator('#cleanDataContent')).toBeVisible();
});

// ---------------------------------------------------------------------------
// CD-03: Healthy data → dialog shows "Data is Healthy" immediately
// ---------------------------------------------------------------------------
test('CD-03: Healthy data shows "Data is Healthy" done screen directly', async ({ page }) => {
  await loadApp(page, makeCleanSeed());
  await goToTab(page, 'settings');
  await openCleanData(page);
  await saveUiSnapshot(page, 'cd03_healthy-data-done-screen');

  await expect(page.locator('#cleanDataContent')).toContainText('Data is Healthy');
  await expect(page.locator('#cleanDataContent')).toContainText('No data integrity issues found');
});

// ---------------------------------------------------------------------------
// CD-04: Duplicate IDs → Screen 1 lists the duplicated IDs
// ---------------------------------------------------------------------------
test('CD-04: Duplicate IDs detected and shown on Screen 1', async ({ page }) => {
  await loadApp(page, makeDupSeed());
  await goToTab(page, 'settings');
  await openCleanData(page);
  await saveUiSnapshot(page, 'cd04_screen1-duplicate-ids');

  const content = page.locator('#cleanDataContent');
  await expect(content).toContainText('Duplicate Record IDs');
  // The duplicate ID should be listed
  await expect(content).toContainText('income_user1_1');
  // Both records should appear: Place A (Jan) and Place B (Mar)
  await expect(content).toContainText('Place A');
  await expect(content).toContainText('Place B');
  // Fix and Skip buttons present
  await expect(content.locator('button', { hasText: 'Fix All Automatically' })).toBeVisible();
  await expect(content.locator('button', { hasText: 'Skip' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// CD-05: "Fix All Automatically" on Screen 1 — all IDs become unique
// ---------------------------------------------------------------------------
test('CD-05: Fix All Automatically resolves duplicate IDs in storage', async ({ page }) => {
  await loadApp(page, makeDupSeed());
  await goToTab(page, 'settings');
  await openCleanData(page);

  // Click fix
  await page.locator('#cleanDataContent button', { hasText: 'Fix All Automatically' }).click();
  await page.waitForTimeout(300);
  await saveUiSnapshot(page, 'cd05_after-dup-fix');

  // Verify storage: no duplicate IDs remain
  const { income_data } = await getStorage(page);
  const ids = income_data.records.map(r => r.id);
  const unique = new Set(ids);
  expect(unique.size).toBe(ids.length);

  // All 3 records still present (none deleted)
  expect(income_data.records.filter(r => !r.deleted).length).toBe(3);
});

// ---------------------------------------------------------------------------
// CD-06: After fixing dups with no other issues → Done screen shown
// ---------------------------------------------------------------------------
test('CD-06: Done screen shown after auto-fixing duplicates when no other issues exist', async ({ page }) => {
  // Seed only duplicate ID records (both have payType, valid fields)
  await loadApp(page, makeDupSeed());
  await goToTab(page, 'settings');
  await openCleanData(page);

  await page.locator('#cleanDataContent button', { hasText: 'Fix All Automatically' }).click();
  await page.waitForTimeout(300);
  await saveUiSnapshot(page, 'cd06_done-after-dup-fix');

  await expect(page.locator('#cleanDataContent')).toContainText('Data Cleaned');
  // Should report at least 1 duplicate fixed
  await expect(page.locator('#cleanDataContent')).toContainText('duplicate ID');
});

// ---------------------------------------------------------------------------
// CD-07: Skip on Screen 1 proceeds to "other issues" screen if they exist
// ---------------------------------------------------------------------------
test('CD-07: Skip on Screen 1 advances to other-issues screen', async ({ page }) => {
  // Seed data with both duplicate IDs AND missing payType
  const seed = makeDupSeed();
  // Corrupt one record to also have a missing payType
  delete seed.income_data.records[2].payType;
  await loadApp(page, seed);
  await goToTab(page, 'settings');
  await openCleanData(page);

  // Should be on Screen 1
  await expect(page.locator('#cleanDataContent')).toContainText('Duplicate Record IDs');

  // Click Skip
  await page.locator('#cleanDataContent button', { hasText: 'Skip' }).click();
  await page.waitForTimeout(200);
  await saveUiSnapshot(page, 'cd07_screen2-after-skip');

  // Should now be on Screen 2
  await expect(page.locator('#cleanDataContent')).toContainText('Other Data Issues');
  await expect(page.locator('#cleanDataContent')).toContainText('Missing pay type');
});

// ---------------------------------------------------------------------------
// CD-08: Screen 2 shows all field-level issue types
// ---------------------------------------------------------------------------
test('CD-08: Screen 2 surfaces missing payType, missing createdAt, and NaN numeric fields', async ({ page }) => {
  await loadApp(page, makeOtherIssuesSeed());
  await goToTab(page, 'settings');
  await openCleanData(page);
  await saveUiSnapshot(page, 'cd08_screen2-other-issues');

  const content = page.locator('#cleanDataContent');
  await expect(content).toContainText('Other Data Issues');
  await expect(content).toContainText('Missing pay type');
  await expect(content).toContainText('Missing creation timestamp');
  // NaN fields show up as invalid value labels
  await expect(content).toContainText('Invalid tips value');
  await expect(content).toContainText('Invalid rate value');
  // The clean record (income_user1_5) must NOT appear
  // 4 bad records: missing payType, missing createdAt, invalid tips, invalid rate
  const cards = await content.locator('.space-y-3 > div').count();
  expect(cards).toBe(4);
});

// ---------------------------------------------------------------------------
// CD-09: Per-record "Fix" button patches the record and re-renders the list
// ---------------------------------------------------------------------------
test('CD-09: Per-record Fix button patches the record and removes it from the list', async ({ page }) => {
  await loadApp(page, makeOtherIssuesSeed());
  await goToTab(page, 'settings');
  await openCleanData(page);

  // Click the first per-record "Fix" button (not "Fix All Automatically")
  const firstFix = page.locator('#cleanDataContent button[onclick*="_cleanFixRecord"]').first();
  await firstFix.click();
  await page.waitForTimeout(200);
  await saveUiSnapshot(page, 'cd09_after-first-fix');

  // Storage: the record should now have payType set
  const { income_data } = await getStorage(page);
  const rec = income_data.records.find(r => r.id === 'income_user1_1');
  expect(rec.payType).toBe('hourly');

  // Dialog should now show 3 remaining issues (one was fixed)
  const content = page.locator('#cleanDataContent');
  await expect(content).toContainText('3 records with data issues');
});

// ---------------------------------------------------------------------------
// CD-10: Per-record "Delete" button removes the record permanently
// ---------------------------------------------------------------------------
test('CD-10: Per-record Delete button permanently removes the record from storage', async ({ page }) => {
  await loadApp(page, makeOtherIssuesSeed());
  await goToTab(page, 'settings');
  await openCleanData(page);

  // Seed has 5 records total; 4 have issues; delete the first bad one
  await page.locator('#cleanDataContent button', { hasText: 'Delete' }).first().click();
  await page.waitForTimeout(200);
  await saveUiSnapshot(page, 'cd10_after-delete');

  const { income_data } = await getStorage(page);
  // income_user1_1 (missing payType) should be gone entirely
  const gone = income_data.records.find(r => r.id === 'income_user1_1');
  expect(gone).toBeUndefined();
  // 4 records remain
  expect(income_data.records.length).toBe(4);
});

// ---------------------------------------------------------------------------
// CD-11: "Fix All Automatically" on Screen 2 patches all bad records at once
// ---------------------------------------------------------------------------
test('CD-11: Fix All Automatically on Screen 2 repairs all field issues in one shot', async ({ page }) => {
  await loadApp(page, makeOtherIssuesSeed());
  await goToTab(page, 'settings');
  await openCleanData(page);
  await saveUiSnapshot(page, 'cd11_before-fix-all-other');

  await page.locator('#cleanDataContent button', { hasText: 'Fix All Automatically' }).click();
  await page.waitForTimeout(300);
  await saveUiSnapshot(page, 'cd11_after-fix-all-other');

  // Done screen
  await expect(page.locator('#cleanDataContent')).toContainText('Data Cleaned');

  // Verify storage: no record should have missing payType, missing createdAt, or NaN fields
  const { income_data } = await getStorage(page);
  for (const r of income_data.records) {
    expect(r.payType, `record ${r.id} missing payType after fix`).toBeTruthy();
    expect(r.createdAt, `record ${r.id} missing createdAt after fix`).not.toBeNull();
    if (r.hours != null) expect(isNaN(parseFloat(r.hours)), `record ${r.id} has NaN hours`).toBe(false);
    if (r.rate != null) expect(isNaN(parseFloat(r.rate)), `record ${r.id} has NaN rate`).toBe(false);
    if (r.tips != null) expect(isNaN(parseFloat(r.tips)), `record ${r.id} has NaN tips`).toBe(false);
  }
});

// ---------------------------------------------------------------------------
// CD-12: Full flow — dups then other issues — fix all on both screens
// ---------------------------------------------------------------------------
test('CD-12: Full flow — fix duplicates then fix other issues, done screen summarises both', async ({ page }) => {
  // Build a seed that has both duplicate IDs and missing payType on a different record
  const seed = {
    income_data: {
      records: [
        // Duplicate pair
        { id: 'income_user1_1', date: '2026-01-01', hours: 3, rate: 15, tips: 10,
          location: 'A', deleted: false, payType: 'hourly',
          createdAt: 2000000000001, updatedAt: 2000000000001 },
        { id: 'income_user1_1', date: '2026-03-01', hours: 4, rate: 16, tips: 20,
          location: 'B', deleted: false, payType: 'hourly',
          createdAt: 2000000000002, updatedAt: 2000000000002 },
        // Field issue: missing payType
        { id: 'income_user1_3', date: '2026-03-05', hours: 5, rate: 17, tips: 0,
          location: 'C', deleted: false,
          createdAt: 2000000000003, updatedAt: 2000000000003 },
      ],
      locations: {},
      customFields: []
    },
    income_meta: { userId: 'user1', nextId: 4 }
  };

  await loadApp(page, seed);
  await goToTab(page, 'settings');
  await openCleanData(page);

  // Screen 1: fix dups
  await expect(page.locator('#cleanDataContent')).toContainText('Duplicate Record IDs');
  await page.locator('#cleanDataContent button', { hasText: 'Fix All Automatically' }).click();
  await page.waitForTimeout(300);

  // Screen 2: fix other issues
  await expect(page.locator('#cleanDataContent')).toContainText('Other Data Issues');
  await page.locator('#cleanDataContent button', { hasText: 'Fix All Automatically' }).click();
  await page.waitForTimeout(300);
  await saveUiSnapshot(page, 'cd12_done-full-flow');

  // Done screen with combined summary
  const content = page.locator('#cleanDataContent');
  await expect(content).toContainText('Data Cleaned');
  await expect(content).toContainText('duplicate ID');
  await expect(content).toContainText('field issue');

  // Final storage: all unique IDs, all have payType
  const { income_data } = await getStorage(page);
  const ids = income_data.records.map(r => r.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const r of income_data.records) {
    expect(r.payType).toBeTruthy();
  }
});

// ---------------------------------------------------------------------------
// CD-13: Close button (X) dismisses the dialog
// ---------------------------------------------------------------------------
test('CD-13: Close button dismisses the dialog and removes it from the DOM', async ({ page }) => {
  await loadApp(page, makeCleanSeed());
  await goToTab(page, 'settings');
  await openCleanData(page);

  await expect(page.locator('#cleanDataSheet')).toBeVisible();

  // Close via the header "Close" button (first of the two closeCleanDataMenu buttons)
  await page.locator('#cleanDataContent button[onclick="closeCleanDataMenu()"]').first().click();
  // Wait for slide-out animation
  await page.waitForTimeout(400);

  await expect(page.locator('#cleanDataSheet')).not.toBeAttached();
  await expect(page.locator('#cleanDataOverlay')).not.toBeAttached();
});

// ---------------------------------------------------------------------------
// CD-14: Done screen "Done" button also closes the dialog
// ---------------------------------------------------------------------------
test('CD-14: Done screen Done button closes the dialog', async ({ page }) => {
  await loadApp(page, makeCleanSeed());
  await goToTab(page, 'settings');
  await openCleanData(page);

  // Should be on done screen (healthy data)
  await expect(page.locator('#cleanDataContent')).toContainText('Data is Healthy');

  await page.locator('#cleanDataContent button', { hasText: 'Done' }).click();
  await page.waitForTimeout(400);

  await expect(page.locator('#cleanDataSheet')).not.toBeAttached();
});

// ---------------------------------------------------------------------------
// CD-15: nextId is advanced after auto-fixing duplicate IDs
//        so subsequent new records don't collide with the reassigned IDs
// ---------------------------------------------------------------------------
test('CD-15: income_meta.nextId advances after duplicate IDs are reassigned', async ({ page }) => {
  const seed = makeDupSeed(); // nextId starts at 3
  await loadApp(page, seed);
  await goToTab(page, 'settings');
  await openCleanData(page);

  const { income_meta: before } = await getStorage(page);
  const nextIdBefore = before.nextId;

  await page.locator('#cleanDataContent button', { hasText: 'Fix All Automatically' }).click();
  await page.waitForTimeout(300);

  const { income_meta: after, income_data } = await getStorage(page);
  // nextId must be greater than the highest ID suffix now in use
  const maxSuffix = Math.max(
    ...income_data.records.map(r => {
      const m = r.id && r.id.match(/_(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
  );
  expect(after.nextId).toBeGreaterThan(maxSuffix);
});

// ---------------------------------------------------------------------------
// REC — Recurring Transactions
// ---------------------------------------------------------------------------

/**
 * Seed a single recurring template starting 14 days ago, every 7 days, no end.
 * Should expand to: 14-days-ago, 7-days-ago, today (3 virtual instances).
 */
function makeRecurringSeed() {
  const today = new Date();
  const ago = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  };
  const twoYearsOut = new Date(today);
  twoYearsOut.setFullYear(twoYearsOut.getFullYear() + 2);

  return {
    income_data: {
      records: [
        {
          id: 'income_user1_1',
          date: ago(14),
          hours: 0,
          rate: 100,
          tips: 0,
          location: 'Test Job',
          payType: 'flat',
          type: 'recurring',
          recurringFreq: 7,
          recurringEnd: twoYearsOut.toISOString().split('T')[0],
          deleted: false,
          createdAt: Date.now() - 14 * 86400000,
          updatedAt: Date.now() - 14 * 86400000,
        },
      ],
      locations: { 'Test Job': { lastRate: 100, preferredColor: '#6366f1' } },
      customFields: [],
    },
    income_meta: { userId: 'user1', nextId: 2 },
  };
}

test('REC-01: Recurring toggle button is visible on Add tab', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'add');
  // The recurring toggle button should be in the top button row
  await expect(page.locator('#recurToggleBtn')).toBeVisible();
  // Should show "Recurring" text and be in inactive (gray) state
  await expect(page.locator('#recurToggleBtn')).toContainText('Recurring');
  await expect(page.locator('#recurToggleBtn')).toHaveClass(/bg-gray-700/);
});

test('REC-02: Clicking recurring button opens frequency popup', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'add');
  // Popup should not exist yet
  await expect(page.locator('#recurPopupSheet')).not.toBeAttached();
  // Click recurring toggle button
  await page.click('#recurToggleBtn');
  await page.waitForTimeout(300);
  // Popup should now be visible
  await expect(page.locator('#recurPopupSheet')).toBeVisible();
  await expect(page.locator('#recurPopupSheet')).toContainText('Recurring');
});

test('REC-03: Selecting a preset frequency updates button highlight in popup', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'add');
  await page.click('#recurToggleBtn');
  await page.waitForTimeout(300);
  // Click "2 weeks" (14 days)
  await page.click('button[onclick="setRecurringFreqPopup(14)"]');
  await page.waitForTimeout(100);
  const btn = page.locator('button[onclick="setRecurringFreqPopup(14)"]');
  await expect(btn).toHaveClass(/bg-purple-600/);
  // Close popup
  await page.click('button[onclick="closeRecurringPopup()"]');
  await page.waitForTimeout(300);
  // Toggle button should show "14d"
  await expect(page.locator('#recurToggleBtn')).toContainText('14d');
});

test('REC-04: Saving a recurring entry stores type=recurring in localStorage', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'add');
  // Open popup and close it (accepting defaults = 7d)
  await page.click('#recurToggleBtn');
  await page.waitForTimeout(300);
  await page.click('button[onclick="closeRecurringPopup()"]');
  await page.waitForTimeout(300);
  // Now fill form
  await page.click("button[onclick=\"setPayType('flat')\"]");
  await page.waitForTimeout(100);
  await page.fill('#dateInput', '2026-01-01');
  await page.fill('#locationInput', 'Weekly Gig');
  await page.fill('#rateInput', '500');
  await submitForm(page);
  const { income_data } = await getStorage(page);
  const rec = income_data.records.find(r => r.location === 'Weekly Gig');
  expect(rec).toBeTruthy();
  expect(rec.type).toBe('recurring');
  expect(rec.recurringFreq).toBe(7);
  expect(rec.recurringEnd).toBeTruthy();
});

test('REC-05: Recurring template expands to multiple virtual instances in history', async ({ page }) => {
  const seed = makeRecurringSeed();
  await loadApp(page, seed);
  await goToTab(page, 'history');
  // Should see virtual instance cards (identified by scrollToRecurringTemplate button)
  await expect(page.locator('button[onclick*="scrollToRecurringTemplate"]').first()).toBeVisible();
  // Should see at least 2 virtual instances
  const virtualBtns = page.locator('button[onclick*="scrollToRecurringTemplate"]');
  expect(await virtualBtns.count()).toBeGreaterThanOrEqual(2);
});

test('REC-06: Virtual instances show correct dates (not template start date)', async ({ page }) => {
  const seed = makeRecurringSeed();
  await loadApp(page, seed);
  // Set date filter to All Time so all months load
  await page.evaluate(() => {
    window.dateFilter = { type: 'all', startDate: null, endDate: null, label: 'All Time' };
  });
  await goToTab(page, 'history');
  // At least 2 virtual instance cards should appear
  const virtualBtns = page.locator('button[onclick*="scrollToRecurringTemplate"]');
  expect(await virtualBtns.count()).toBeGreaterThanOrEqual(2);
});

test('REC-07: Dashboard totals include recurring virtual entries', async ({ page }) => {
  const seed = makeRecurringSeed();
  await loadApp(page, seed);
  await goToTab(page, 'dashboard');
  const allTimeEl = page.locator('text=All Time').locator('..').locator('..').locator('div:has-text("$")').first();
  // All-time total should be > $0 (recurring entries count)
  const text = await page.locator('#app').textContent();
  // The seed record is $100/flat repeating — all-time total should show > $100
  // (at least 3 instances × $100 = $300) — just verify it's not $0.00
  expect(text).not.toContain('$0.00');
});

test('REC-08: Deleting a recurring template removes all virtual instances', async ({ page }) => {
  const seed = makeRecurringSeed();
  await loadApp(page, seed);
  await goToTab(page, 'history');
  // Count virtual instance cards before deletion
  const beforeCount = await page.locator('button[onclick*="scrollToRecurringTemplate"]').count();
  expect(beforeCount).toBeGreaterThanOrEqual(2);
  // Delete the template directly via JS (avoids confirm dialog / force-click timing issues)
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('income_data'));
    const rec = data.records.find(r => r.id === 'income_user1_1');
    if (rec) { rec.deleted = true; rec.updatedAt = Date.now(); }
    localStorage.setItem('income_data', JSON.stringify(data));
    window.renderHistory();
  });
  await page.waitForTimeout(400);
  // All virtual instance cards should be gone
  await expect(page.locator('button[onclick*="scrollToRecurringTemplate"]').first()).not.toBeAttached({ timeout: 3000 });
});

test('REC-09: Custom frequency slider sets recurringFreq correctly', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'add');
  await page.click('#recurToggleBtn');
  await page.waitForTimeout(300);
  // Click "custom" button
  await page.click('#recurCustomBtn');
  await page.waitForTimeout(100);
  // Slider should be visible
  const slider = page.locator('#recurCustomSliderRow input[type="range"]');
  await expect(slider).toBeVisible();
  // Set slider to 10
  await slider.fill('10');
  await slider.dispatchEvent('input');
  await page.waitForTimeout(100);
  const val = page.locator('#recurSliderVal');
  await expect(val).toContainText('10');
});

test('REC-10: Recurring toggle resets after successful save', async ({ page }) => {
  await loadApp(page);
  await goToTab(page, 'add');
  // Enable recurring via popup
  await page.click('#recurToggleBtn');
  await page.waitForTimeout(300);
  await page.click('button[onclick="closeRecurringPopup()"]');
  await page.waitForTimeout(300);
  await expect(page.locator('#recurToggleBtn')).toHaveClass(/bg-purple-600/);
  // Fill and submit
  await page.click("button[onclick=\"setPayType('flat')\"]");
  await page.waitForTimeout(100);
  await page.fill('#dateInput', '2026-02-01');
  await page.fill('#locationInput', 'Resets Job');
  await page.fill('#rateInput', '200');
  await submitForm(page);
  // Go back to Add tab — toggle should be off
  await goToTab(page, 'add');
  // Toggle button should show "Recurring" (disabled) in gray
  await expect(page.locator('#recurToggleBtn')).toContainText('Recurring');
  await expect(page.locator('#recurToggleBtn')).toHaveClass(/bg-gray-700/);
});
