# LocaLedger — Use Cases & Test Scenarios

> Human-readable test cases for every major user interaction. Intended to be the source of truth for automated testing and for explaining failures to a fixing agent.

---

## How to Use This Document

Each use case has:
- **Setup** — state the app must be in before the action
- **Steps** — what the user does
- **Expected Result** — what must be true after
- **What Could Go Wrong** — specific failure signatures and what they indicate

These cases are ordered from foundational (storage, data) to composite (filter + edit + history).

---

## UC-01: First Load — Empty State Initialization

**Setup:** No `income_data` or `income_meta` keys in localStorage.

**Steps:**
1. Open the app for the first time (or in a fresh browser context).

**Expected Result:**
- `income_data` is created in localStorage with shape `{ records: [], locations: {}, customFields: [] }`
- `income_meta` is created with shape `{ userId: "user1", nextId: 1 }`
- Dashboard tab is shown with empty/no-data state
- No JavaScript errors in console
- Charts section shows "no data" placeholder

**What Could Go Wrong:**
- `initStorage()` not called on load → `loadData()` returns null → null reference errors throughout
- `income_meta.nextId` starts at wrong value → IDs collide on first record save
- Dashboard renders with undefined data → blank or broken layout

---

## UC-02: Add a Basic Hourly Income Entry

**Setup:** App initialized, no existing records.

**Steps:**
1. Navigate to the **Add** tab.
2. Set date to `2026-03-15`.
3. Set hours to `6.5`.
4. Set location to `"Downtown Bar"` (typed manually, not from autocomplete).
5. Set rate to `25`.
6. Set tips to `10`.
7. Leave pay type as **Hourly**.
8. Click **Save Entry**.

**Expected Result:**
- A record is created in `income_data.records` with:
  - `date: "2026-03-15"`
  - `hours: 6.5`
  - `rate: 25`
  - `tips: 10`
  - `location: "Downtown Bar"`
  - `payType: "hourly"`
  - `deleted: false`
  - `id` matching format `income_user1_N`
  - `createdAt` and `updatedAt` set to current unix timestamp (ms)
- `income_data.locations["Downtown Bar"].lastRate` is `25`
- `income_meta.nextId` incremented by 1
- A success toast is shown
- Form clears after save
- Record appears in History tab under the correct month

**What Could Go Wrong:**
- `hours` or `rate` parsed as string instead of number → `calculateBasePay` returns `NaN` → total shows `$NaN`
- `generateId()` not called or not incrementing → duplicate IDs → edit/delete targets wrong record
- `locations` key not updated → autocomplete and rate prefill don't work on second visit
- Toast not shown → `showToast()` missing call in `saveIncome`
- Form not cleared → old values persist into next entry

---

## UC-03: Add a Flat Rate Income Entry

**Setup:** App initialized, no existing records.

**Steps:**
1. Navigate to the **Add** tab.
2. Set date to `2026-03-15`.
3. Switch pay type to **Flat Rate**.
4. Set the flat rate amount to `200`.
5. Set location to `"Event Gig"`.
6. Set tips to `0`.
7. Click **Save Entry**.

**Expected Result:**
- Record saved with `payType: "flat"`, `rate: 200`, `hours: 0` (or blank/0)
- `calculateBasePay(record)` returns `200` (not `hours × rate`)
- `calculateRecordTotal(record, defs)` returns `200`
- History card shows `$200.00` total
- Hours field is not shown (or shows as 0/N/A) on the history card

**Known Limitation (as of 2026-03-15):**
- `saveIncome()` validates `hours > 0` for ALL entries, including flat rate. A user must enter a hours value even for flat rate entries or the form rejects with a toast. This is a UX bug — flat rate entries logically don't need hours.

**What Could Go Wrong:**
- UI still shows hourly form when flat rate selected → `setPayType("flat")` not toggling correctly
- `calculateBasePay` uses `hours × rate` even for flat → wrong total
- Record saves with `payType: "hourly"` → all recalculations treat it as hourly

---

## UC-04: Location Autocomplete and Rate Prefill

**Setup:** At least one record exists for location `"Coffee Shop"` with rate `18`.

**Steps:**
1. Navigate to the **Add** tab.
2. Begin typing `"Cof"` in the location field.
3. See dropdown appear with `"Coffee Shop"`.
4. Click `"Coffee Shop"` in the dropdown.

**Expected Result:**
- Location field is filled with `"Coffee Shop"`
- Rate field is automatically set to `18` (last used rate)
- Dropdown closes
- Form is otherwise unchanged

**What Could Go Wrong:**
- Dropdown does not appear → `setupLocationAutocomplete()` not called or input listener not attached
- Autocomplete filters incorrectly → wrong locations shown or no results for valid substring
- Rate not auto-filled → `autoFillRate()` not called on selection, or `locations[name].lastRate` is missing
- Rate auto-fill overwrites a rate the user had already typed → incorrect order of operations

---

## UC-05: Edit an Existing Record — Change Hours and Tips

**Setup:** At least one record exists (e.g., from UC-02: date `2026-03-15`, hours `6.5`, rate `25`, tips `10`).

**Steps:**
1. Navigate to **History** tab.
2. Find the record for `2026-03-15`.
3. Click the **Edit** button on that record.
4. Change hours from `6.5` to `8`.
5. Change tips from `10` to `20`.
6. Click **Save Changes** (bottom nav button).

**Expected Result:**
- The record in `income_data.records` is updated in place (same `id`, same `createdAt`)
- `hours` is now `8`, `tips` is now `20`
- `updatedAt` is updated to current timestamp (must be ≥ `createdAt`)
- `createdAt` is **unchanged**
- Recalculated total: `(8 × 25) + 20 = $220.00`
- History shows the updated values
- Edit mode nav (Save/Cancel) is dismissed, normal nav is restored
- `editModeRecord` is reset to `null`

**What Could Go Wrong:**
- A new record is created instead of updating existing → `saveIncome` not receiving `existing` param → duplicate records, `nextId` incorrectly incremented
- `createdAt` overwritten with new timestamp → audit trail broken
- `updatedAt` not updated → cannot tell when record was last modified
- Total still shows old value → render not triggered after save
- Edit mode nav persists → `updateBottomNavForEditMode(false)` not called

---

## UC-06: Edit an Existing Record — Change Location

**Setup:** Record exists for `"Downtown Bar"`. `"Rooftop Venue"` has also been used previously.

**Steps:**
1. Navigate to **History**, find the record.
2. Click **Edit**.
3. Clear the location field and type `"Rooftop Venue"`.
4. Click **Save Changes**.

**Expected Result:**
- Record's `location` field updated to `"Rooftop Venue"`
- `data.locations["Rooftop Venue"].lastRate` updated with this record's rate
- `data.locations["Downtown Bar"]` still exists (other records may reference it)
- History card shows new location name and applies `"Rooftop Venue"` color tint

**What Could Go Wrong:**
- Location change not persisted → `record.location` still shows old name
- Old location deleted from `data.locations` → breaks other records that use it
- Color tint on history card doesn't update → `getLocationTintStyle` using stale data

---

## UC-07: Delete a Record (Soft Delete)

**Setup:** At least one record exists.

**Steps:**
1. Navigate to **History**.
2. Click the **Delete** button on a record.
3. Confirm deletion if prompted.

**Expected Result:**
- Record's `deleted` flag set to `true`
- `updatedAt` updated to now
- Record disappears from default history view
- `income_data.records` array length is **unchanged** (soft delete only)
- Dashboard totals and charts no longer include this record
- History month totals update to exclude this record

**What Could Go Wrong:**
- Record is removed from array entirely → cannot be restored
- `deleted` flag set but `updatedAt` not updated → history order may be affected
- Record still appears in history after delete → filter not checking `deleted` flag
- Dashboard totals still include the deleted record → `getFilteredRecords` or `calculateRecordTotal` not filtering `deleted`

---

## UC-08: Restore a Deleted Record

**Setup:** At least one record with `deleted: true` exists.

**Steps:**
1. Navigate to **History**.
2. Enable **Show Deleted** toggle.
3. Find the deleted record (visually distinct, e.g., greyed out).
4. Click **Restore** on the deleted record.

**Expected Result:**
- `record.deleted` set to `false`
- `record.updatedAt` updated
- Record reappears in normal history view
- Record is included in totals and charts again
- If **Show Deleted** is toggled off, the record now appears in the normal list

**What Could Go Wrong:**
- **Show Deleted** toggle doesn't reveal deleted records → `showDeletedRecords` flag not checked in `renderHistory`
- Restore sets `deleted` to `false` but history doesn't re-render → missing `renderHistory()` call after restore
- Restored record not included in totals → filter still excluding based on stale state

---

## UC-09: Edit a Location (Rename + Color Change)

**Setup:** Location `"Coffee Shop"` exists with several records.

**Steps:**
1. Navigate to **Settings** → Locations.
2. Click **Edit** on `"Coffee Shop"`.
3. Change name to `"Blue Cup Coffee"`.
4. Change color to `#f59e0b`.
5. Click **Save**.

**Expected Result:**
- All records previously having `location: "Coffee Shop"` now have `location: "Blue Cup Coffee"`
- `data.locations["Blue Cup Coffee"]` exists with `preferredColor: "#f59e0b"` and correct `lastRate`
- `data.locations["Coffee Shop"]` key is removed
- Settings page refreshes showing `"Blue Cup Coffee"` in the list
- History cards for those records now show `"Blue Cup Coffee"` with the amber tint
- Charts update to use the new name and color

**What Could Go Wrong:**
- `renameLocation()` not called → only the locations object is updated, records still say `"Coffee Shop"` → data inconsistency
- Old key `"Coffee Shop"` not deleted from `data.locations` → both names appear in location lists
- Color saved as invalid/unnormalized hex → `normalizeHexColor()` not called → chart colors break
- History and charts don't reflect rename until hard refresh → `saveData` or re-render not triggered

---

## UC-10: Merge Two Locations

**Setup:** Records exist for both `"Bar A"` (5 records) and `"Bar B"` (3 records).

**Steps:**
1. Navigate to **Settings** → Locations.
2. Click **Merge Locations**.
3. Select `"Bar A"` as source and `"Bar B"` as destination.
4. Confirm merge.

**Expected Result:**
- All 5 records previously with `location: "Bar A"` now have `location: "Bar B"`
- `data.locations["Bar A"]` key is deleted
- `data.locations["Bar B"]` is preserved
- History shows all 8 records under `"Bar B"`
- `"Bar A"` no longer appears in location dropdown or settings list

**What Could Go Wrong:**
- Records not updated → merge only deletes the location key but leaves records with `"Bar A"` → orphaned location on records
- `"Bar B"` location config overwritten or deleted → rate and color lost
- Merge confirmation skipped or triggered without selection → unintended data changes

---

## UC-11: Add a Custom Field (Money Type, Adds to Total)

**Setup:** App initialized, no custom fields defined.

**Steps:**
1. Navigate to **Add** tab.
2. Click **+ Add Custom Field**.
3. Set label to `"Mileage Reimbursement"`.
4. Set type to **Money**.
5. Set **Add to Total** to **Add**.
6. Save the custom field.

**Expected Result:**
- `data.customFields` contains one entry: `{ label: "Mileage Reimbursement", type: "money", key: "CustomField_Mileage_Reimbursement", addToTotal: "add" }`
- The **Add** form now shows a `"Mileage Reimbursement"` money input below the standard fields
- History cards and detail view show this field's value
- Total calculation includes this field: `basePay + tips + mileageValue`

**What Could Go Wrong:**
- Key not sanitized → special characters in key break property access
- `addToTotal` not saved → field appears but doesn't affect total
- Custom field input doesn't render on Add form → `setupCustomFields()` not called after saving definition
- Field appears but `calculateMoneyCustomContribution` ignores it → total is wrong

---

## UC-12: Add Record with Custom Field Value

**Setup:** Custom field `"Mileage Reimbursement"` (money, add to total) exists from UC-11.

**Steps:**
1. Navigate to **Add** tab.
2. Fill in standard fields: date `2026-03-15`, hours `4`, rate `20`, tips `5`, location `"Gig Work"`.
3. Enter `15` in the `"Mileage Reimbursement"` field.
4. Click **Save Entry**.

**Expected Result:**
- Record saved with `CustomField_Mileage_Reimbursement: 15`
- Total: `(4 × 20) + 5 + 15 = $100.00`
- History card shows `$100.00` total
- Shift detail view shows `"Mileage Reimbursement: $15.00"`

**What Could Go Wrong:**
- Custom field value not persisted in record → field shows blank in detail/history
- Custom value saved as string not number → `calculateMoneyCustomContribution` returns `NaN`
- Total doesn't include custom field → `calculateRecordTotal` not calling `calculateMoneyCustomContribution`

---

## UC-13: Edit a Custom Field Definition

**Setup:** Custom field `"Notes"` (longtext) exists.

**Steps:**
1. Navigate to **Settings** → Custom Fields.
2. Click **Edit** on `"Notes"`.
3. Change label to `"Shift Notes"`.
4. Save.

**Expected Result:**
- `data.customFields[i].label` updated to `"Shift Notes"`
- `data.customFields[i].key` **unchanged** (key should NOT be regenerated — existing record data uses the old key)
- Settings shows new label
- Add form shows `"Shift Notes"` label
- Existing records with values for this field still display correctly using old key

**What Could Go Wrong:**
- Key regenerated from new label → existing record values become unreachable (orphaned data)
- Label update not persisted → field reverts to old name on refresh
- Records using the old field key now show blank for the field → data loss from key change

---

## UC-14: Delete a Custom Field

**Setup:** Custom field `"Overtime Bonus"` (money) exists, with values in some records.

**Steps:**
1. Navigate to **Settings** → Custom Fields.
2. Click **Delete** on `"Overtime Bonus"`.
3. Confirm deletion.

**Expected Result:**
- `"Overtime Bonus"` removed from `data.customFields`
- Existing record values (`CustomField_Overtime_Bonus` property on records) are **orphaned but preserved** — they remain in the record objects but are no longer displayed
- Add form no longer shows this field
- Totals recalculated without this field's contribution
- No crash when rendering records that have the old field value in their data

**What Could Go Wrong:**
- App crashes when rendering records with orphaned custom field keys → field rendering code not checking if definition exists
- Totals still include the deleted field's values → `calculateMoneyCustomContribution` iterating record keys instead of `customFields` definitions
- Field not removed from `customFields` array → still appears on Add form

---

## UC-15: Date Filter — Filter by Current Month

**Setup:** Records exist for multiple months (e.g., January, February, March 2026).

**Steps:**
1. Navigate to **History** (or **Dashboard**).
2. Open the date filter menu.
3. Select **This Month**.

**Expected Result:**
- Only records with a date in the current calendar month are shown
- Banner and stats update to reflect filtered totals
- Records from other months are hidden
- The date filter indicator shows `"This Month"` or the current month name

**What Could Go Wrong:**
- All records still shown → `getFilteredRecords()` not applying the filter
- Wrong month included → date comparison using UTC instead of local timezone
- Stats don't update → dashboard/history not re-rendered after filter change
- Filter state not persisted if user switches tabs → `dateFilter` global reset unexpectedly

---

## UC-16: Date Filter — Custom Date Range

**Setup:** Records exist across multiple months.

**Steps:**
1. Open date filter menu.
2. Select **Custom Range**.
3. Set start date to `2026-02-01` and end date to `2026-02-28`.
4. Apply.

**Expected Result:**
- Only records between Feb 1 and Feb 28 (inclusive) are shown
- Filter label shows the custom range
- Records on Feb 1 and Feb 28 are included (inclusive bounds)
- Records on Jan 31 and Mar 1 are excluded

**What Could Go Wrong:**
- Off-by-one on boundary dates → Feb 1 or Feb 28 records excluded
- End date exclusive instead of inclusive → Feb 28 records missing
- Start/end dates swapped silently → shows wrong range
- Date comparison using string comparison instead of Date objects → ordering issues with days > 12

---

## UC-17: History Sort — By Total (Descending)

**Setup:** Multiple records with different totals exist.

**Steps:**
1. Navigate to **History**.
2. Open sort options.
3. Select **Total** → **Highest First**.

**Expected Result:**
- Records reordered from highest total to lowest within each month group
- Month grouping is preserved (records still grouped by month, sorted within each group)
- The sort indicator in the UI reflects current selection

**What Could Go Wrong:**
- Records sorted by total but month grouping lost → all records in a flat list
- Sort applied to display strings instead of numbers → `"$9.00"` sorted before `"$10.00"` (string comparison)
- Sort direction reversed → lowest first instead of highest

---

## UC-18: History — Infinite Scroll Loads More Months

**Setup:** Records exist spanning at least 4 months.

**Steps:**
1. Navigate to **History**.
2. Scroll to the bottom of the visible records (2 months loaded by default).
3. Continue scrolling past the threshold.

**Expected Result:**
- A 3rd month loads and appears below
- `loadedMonths` increments to `3`
- Scroll position is preserved (page doesn't jump to top)
- Further scrolling loads month 4, then 5, etc.
- When all months are loaded, no more loading occurs

**What Could Go Wrong:**
- Scroll listener not attached → `setupInfiniteScroll()` not called
- Scroll fires but `renderHistory()` resets form data → `isScrollLoad` flag not set before scroll-triggered render
- Same month loaded twice → duplicate records appear
- Page jumps to top on each scroll load → DOM replacement instead of append
- `loadedMonths` never increments → stuck at 2 months forever

---

## UC-19: Form Persistence — Tab Switch Preserves In-Progress Entry

**Setup:** App initialized.

**Steps:**
1. Navigate to **Add** tab.
2. Enter date `2026-03-15`, hours `5`, location `"Test Venue"`, rate `22`.
3. **Do not submit** — navigate to **History** tab.
4. Navigate back to **Add** tab.

**Expected Result:**
- All entered values (`2026-03-15`, `5`, `"Test Venue"`, `22`) are restored in the form
- Floating labels are in their active (raised) state for filled fields
- Custom field values are also restored if any were entered

**What Could Go Wrong:**
- Form clears on tab switch → `savedFormData` not populated in `switchTab`
- Partial restore → some fields saved but others (e.g., custom fields) lost
- Labels not re-activated → visual glitch showing labels overlapping values
- Form persists edit mode state when it shouldn't → `editModeRecord` contaminating persistence

---

## UC-20: Edit Mode — Cancel Reverts Changes

**Setup:** A record exists with hours `6`, rate `25`.

**Steps:**
1. Navigate to **History**, click **Edit** on the record.
2. Change hours to `99`.
3. Click **Cancel** (not Save Changes).

**Expected Result:**
- Record is unchanged in storage (`hours` is still `6`)
- Form clears
- Edit mode nav (Save/Cancel) is dismissed, normal nav restored
- `editModeRecord` is reset to `null`
- History re-renders showing original values

**Known Limitation (as of 2026-03-15):**
- In edit mode, `updateBottomNavForEditMode(true)` hides the dashboard and history nav buttons (`display:none`). Only the "Save Changes" button is visible. There is **no Cancel button** in the current UI. The only way to cancel is via browser back navigation or a direct JavaScript call. A Cancel button should be added to the edit mode nav.

**What Could Go Wrong:**
- Cancel triggers a partial save → record partially updated
- Edit mode nav persists after cancel → `updateBottomNavForEditMode(false)` not called
- `editModeRecord` not cleared → next "Add" entry accidentally treated as an edit
- History doesn't re-render → stale values displayed

---

## UC-21: Export Data as JSON

**Setup:** Several records exist.

**Steps:**
1. Navigate to **Settings**.
2. Click **Export Data** → select **JSON**.
3. Copy to clipboard (or download).

**Expected Result:**
- Exported JSON is valid and parseable
- JSON contains `records`, `locations`, and `customFields` matching current storage
- Soft-deleted records are included in export (for full backup)
- JSON is identical to `income_data` from localStorage

**What Could Go Wrong:**
- Export missing deleted records → incomplete backup
- Invalid JSON generated → import will fail
- `customFields` not included → custom field definitions lost on restore
- Clipboard copy silently fails on non-HTTPS → `copyToClipboard` fallback not triggered

---

## UC-22: Import Data from JSON

**Setup:** App is empty or has different data. Valid JSON file from UC-21 is available.

**Steps:**
1. Navigate to **Settings**.
2. Click **Import Data**.
3. Select the JSON file.

**Expected Result:**
- Existing data is replaced (or merged, depending on implementation) with imported data
- All records, locations, and custom fields from the file are present in localStorage
- `income_meta` is updated so `nextId` is higher than any imported record's ID counter
- App re-renders with imported data visible

**What Could Go Wrong:**
- Import replaces data but doesn't update `income_meta.nextId` → new records will collide with imported IDs
- Malformed JSON not caught → app crashes or data becomes corrupt
- `customFields` array not imported → fields missing from Add form
- No confirmation prompt → user accidentally overwrites their data

---

## UC-23: History — Show/Hide Deleted Records

**Setup:** At least one record with `deleted: true` exists (from UC-07).

**Steps:**
1. Navigate to **History**.
2. Toggle **Show Deleted** to ON.
3. Toggle **Show Deleted** back to OFF.

**Expected Result (Toggle ON):**
- Deleted record(s) appear in history, visually distinct (e.g., muted style, "Deleted" badge)
- Deleted records have a **Restore** button instead of Delete
- Deleted records are **not** counted in month totals

**Expected Result (Toggle OFF):**
- Deleted records are hidden again
- `showDeletedRecords` flag set back to `false`

**What Could Go Wrong:**
- Deleted records shown but not visually distinct → user can't tell which are deleted
- Deleted records counted in totals when visible → `calculateRecordTotal` or filter not excluding them
- Toggle re-renders but loses scroll position or sort state

---

## UC-24: Dashboard Totals Accuracy

**Setup:** 3 records in the current month:
- Record A: hourly, 4h × $20 + $10 tips = $90
- Record B: flat $150 + $0 tips = $150
- Record C: hourly, 2h × $30 + $5 tips = $65, **deleted**

**Steps:**
1. Navigate to **Dashboard**.
2. Observe the "This Month" total and hours count.

**Expected Result:**
- "This Month" total: `$90 + $150 = $240.00` (Record C excluded because deleted)
- Hours count: `4 + 0 = 4 hours` (flat rate may show 0 hours, Record C excluded)
- Record C does not appear in Top Locations, charts, or any stat

**What Could Go Wrong:**
- Deleted record C included in total → `$240 + $65 = $305` shown incorrectly
- Flat rate record counted as `0 × rate = $0` → total wrong
- Hours from flat rate record counted → hours total inflated

---

## UC-25: Clear All Data (Destructive Action)

**Setup:** Multiple records, locations, and custom fields exist.

**Steps:**
1. Navigate to **Settings** → Danger Zone.
2. Click **Clear All Data**.
3. Confirm the destructive action.

**Expected Result:**
- `income_data` reset to `{ records: [], locations: {}, customFields: [] }`
- `income_meta` reset to `{ userId: "user1", nextId: 1 }`
- Dashboard shows empty state
- History shows no records
- Settings shows no locations or custom fields
- App does not crash

**What Could Go Wrong:**
- `income_meta.nextId` not reset → first new record after clear has an unexpectedly high ID (non-critical but surprising)
- `income_meta` not reset at all → userId/nextId preserved from before (minor)
- App crashes after clear → components try to access empty data without null-checking
- No confirmation prompt → data deleted on single click (destructive action guard missing)

---

---

## BUG-01: Duplicate Record ID Bugs (Fixed)

These two bugs were reproduced on real user data and fixed. The automated tests in `tests/LocaLedger.spec.js` serve as regression guards.

### BUG-01a: Import After Clear Resets `nextId` — Causes ID Collisions

**Root Cause:** `importData()` called `saveData(parsed)` but never updated `income_meta.nextId`. After `clearAllData()` (which resets `nextId` to `1`) followed by an import, the counter stays at `1`. The next new record gets ID `income_user1_1`, colliding with an already-imported record.

**Fix:** `importData()` now scans all imported records, finds the highest ID suffix, and advances `income_meta.nextId` to one above it before saving.

**Regression test:** `BUG-01a` — asserts `income_meta.nextId > 18` after importing 18 records.

---

### BUG-01b: Edit on Duplicate-ID Record Opens Wrong Record

**Root Cause:** `Array.find()` returns the **first** match. When two records share an ID (from BUG-01a), clicking Edit on the second record opened the first.

**Fix:** `editRecord(id, createdAt?)`, `deleteRecord`, `restoreRecord`, and `showShiftDetail` all accept an optional `createdAt` timestamp. When provided, the lookup uses both `id` and `createdAt` as a compound key. History card buttons now pass `r.createdAt`:
```js
onclick="editRecord('${r.id}', ${r.createdAt})"
```

**Regression test:** `BUG-01b` — seeds two records sharing `income_user1_2`, clicks Edit on the March one, asserts the form shows March data (not February).

---

### BUG-01c: Saving an Edit Inherits `deleted: true` From First Duplicate

**Root Cause:** `saveIncome` used `findIndex()` to locate the record to overwrite. With duplicate IDs, it found the first match — which had `deleted: true`. The spread `{ ...data.records[foundIndex], ...newFields }` preserved `deleted: true` on the saved record, making it immediately vanish from history.

**Fix:** `saveIncome` now uses the same `createdAt` tiebreak when finding the record index.

**Regression test:** `BUG-01c` — edits the second duplicate, asserts a non-deleted record with the expected tips value exists after save.

---

## CD: Clean Data Dialog Use Cases

The Settings tab includes a **Clean Data** button that opens a multi-screen dialog for detecting and fixing data integrity issues.

---

## CD-01: Settings Tab Renders the Clean Data Button

**Setup:** Any app state.

**Expected:** A "Clean Data" button is visible in the Settings tab under the "Data Health" section, between Backup & Transfer and Danger Zone.

---

## CD-02: Clicking Clean Data Opens the Dialog

**Setup:** Any app state.

**Steps:** Navigate to Settings, click **Clean Data**.

**Expected:**
- `#cleanDataSheet` slide-up overlay appears
- `#cleanDataOverlay` backdrop appears
- `#cleanDataContent` is populated

---

## CD-03: Healthy Data Shows "Data is Healthy" Immediately

**Setup:** All records have unique IDs, valid payType, valid createdAt, valid numeric fields.

**Expected:** The dialog opens directly to the Done screen with "Data is Healthy" and "No data integrity issues found." No fix screens are shown.

---

## CD-04: Duplicate IDs Shown on Screen 1

**Setup:** Two or more records share the same `id`.

**Expected:**
- Dialog opens to Screen 1 "Duplicate Record IDs"
- Each duplicate ID is listed with its affected records (date, location, amount, active/deleted status)
- "Fix All Automatically" and "Skip" buttons are present

---

## CD-05: Fix All Automatically — Duplicate IDs

**Setup:** Two records share `income_user1_1`.

**Steps:** Click **Fix All Automatically** on Screen 1.

**Expected:**
- Storage is updated — all record IDs are now unique
- Total record count is unchanged (no records deleted)
- `income_meta.nextId` is greater than the highest ID suffix now in the data

---

## CD-06: Done Screen After Auto-Fixing Duplicates

**Setup:** Only duplicate ID issues (no field-level issues).

**Steps:** Click **Fix All Automatically** on Screen 1.

**Expected:** Dialog advances to Done screen, shows "Data Cleaned" with the count of duplicate IDs fixed. Does not show Screen 2 since no other issues exist.

---

## CD-07: Skip on Screen 1 Advances to Screen 2

**Setup:** Data has both duplicate IDs and a field-level issue (e.g., missing payType).

**Steps:** Click **Skip** on Screen 1.

**Expected:** Dialog advances to Screen 2 "Other Data Issues" showing the field-level problems. Duplicate IDs remain unfixed in storage.

---

## CD-08: Screen 2 Shows All Field-Issue Types

**Setup:** Records with: missing `payType`, missing `createdAt`, non-numeric string `tips`, non-numeric string `rate`.

**Expected:**
- Dialog opens to Screen 2 (no duplicates in this seed)
- Each affected record appears as a card with its specific problem labels:
  - "Missing pay type"
  - "Missing creation timestamp"
  - "Invalid tips value"
  - "Invalid rate value"
- Clean records do **not** appear in the list

**Note on NaN:** JavaScript `NaN` is coerced to `null` by `JSON.stringify` and is not detected as invalid. Invalid numeric detection only fires on non-null, non-numeric string values (e.g., `"bad_value"`) that survive the JSON round-trip.

---

## CD-09: Per-Record Fix Button Patches One Record

**Setup:** Multiple records with field-level issues.

**Steps:** Click **Fix** on the first record card.

**Expected:**
- That specific record is patched in storage (e.g., `payType` set to `"hourly"`)
- The dialog re-renders showing one fewer card
- Other affected records still appear and are still unfixed

---

## CD-10: Per-Record Delete Button Permanently Removes One Record

**Setup:** Multiple records with field-level issues.

**Steps:** Click **Delete** on a record card.

**Expected:**
- Record is permanently removed from `income_data.records` (not soft-deleted — the record itself is the problem)
- Total record count decreases by 1
- Dialog re-renders showing one fewer card

---

## CD-11: Fix All Automatically on Screen 2 Repairs All Field Issues

**Setup:** Records with missing payType, missing createdAt, invalid string numerics.

**Steps:** Click **Fix All Automatically** on Screen 2.

**Expected:**
- Every affected record is patched: `payType → "hourly"`, `createdAt → Date.now()`, invalid numerics `→ 0`
- Clean records are untouched
- Dialog advances to Done screen
- All records in storage now pass `detectDataIssues` with no field issues

---

## CD-12: Full Two-Screen Flow

**Setup:** Data with both duplicate IDs and field-level issues on different records.

**Steps:**
1. Screen 1 opens showing duplicates — click **Fix All Automatically**
2. Screen 2 opens showing field issues — click **Fix All Automatically**

**Expected:**
- Done screen shows combined summary: "Fixed N issues: X duplicate ID(s), Y field issue(s)"
- All records in storage have unique IDs and valid fields

---

## CD-13: Close Button Dismisses the Dialog

**Setup:** Clean Data dialog is open.

**Steps:** Click the **Close** button in the dialog header.

**Expected:**
- `#cleanDataSheet` is removed from the DOM (slide-out animation plays)
- `#cleanDataOverlay` is removed from the DOM
- Settings page is visible and interactive

---

## CD-14: Done Screen "Done" Button Closes the Dialog

**Setup:** Dialog reaches the Done screen.

**Steps:** Click the **Done** button.

**Expected:** Same as CD-13 — dialog is removed from DOM.

---

## CD-15: `income_meta.nextId` Advances After Duplicate Fix

**Setup:** Records with duplicate IDs; `income_meta.nextId` set to a value lower than what the reassigned IDs will use.

**Steps:** Fix All Automatically on Screen 1.

**Expected:** After fix, `income_meta.nextId` is strictly greater than the highest `_N` suffix appearing in any record's ID. This prevents newly created records from colliding with the reassigned IDs.

---

## Testing Approach Notes

### Manual Testing
Each UC can be performed manually by opening `index.html` in a browser and following the steps. Use browser DevTools → Application → Local Storage to verify storage state after each step.

### Automated Testing (Playwright / Puppeteer)
The app is a single HTML file with no API. Tests should:
1. Launch a browser pointed at `index.html`
2. Manipulate localStorage directly where needed for setup
3. Interact via DOM (click, type, select)
4. Assert against DOM content AND localStorage values

### Error Report Format
When a test fails, a useful error report to send to a fixing agent should include:

```
USE CASE: [UC number and name]
STEP FAILED: [Which step, e.g., "Step 6: Click Save Entry"]
EXPECTED: [Exact expected result]
ACTUAL: [What actually happened]
STORAGE STATE: [JSON dump of income_data and income_meta at time of failure]
CONSOLE ERRORS: [Any JS errors from browser console]
DOM SNAPSHOT: [Relevant HTML of the failing section]
FUNCTION IMPLICATED: [e.g., saveIncome(), generateId()] based on the failure signature
```

This format gives a fixing agent:
- The specific interaction that failed
- The exact data state at failure time
- The function(s) most likely responsible
- No ambiguity about what "wrong" means

---

## REC-01: Recurring Toggle Visible on Add Tab

**Setup:** Fresh app, no data.

**Steps:**
1. Open Add tab.

**Expected Result:**
- A "Recurring" row (`#recurringRow`) is visible below the custom fields area.
- A toggle switch button is visible.

---

## REC-02: Enabling Recurring Toggle Shows Frequency Panel

**Setup:** Fresh app, Add tab open.

**Steps:**
1. Click the recurring toggle button.

**Expected Result:**
- `#recurringPanel` becomes visible.
- Frequency preset buttons are visible (1 day, 1 week, 2 weeks, 1 month, quarter, custom).
- Start date badge area is shown.
- Submit button text changes to "Save Recurring Entry".

---

## REC-03: Frequency Preset Updates Highlighted Button

**Setup:** Recurring toggle enabled on Add tab.

**Steps:**
1. Click "2 weeks" frequency button (`setRecurringFreq(14)`).

**Expected Result:**
- The "2 weeks" button has `bg-indigo-600` class (highlighted).
- Other preset buttons have `bg-gray-700` class.
- `_recurringFreq` global is `14`.

---

## REC-04: Saving a Recurring Entry Stores Template in localStorage

**Setup:** Fresh app.

**Steps:**
1. Go to Add tab.
2. Enable recurring toggle.
3. Fill form with date=2026-01-01, location=Weekly Gig, payType=flat, rate=500.
4. Submit.

**Expected Result:**
- One record saved with `type: "recurring"`, `recurringFreq: 7`, `recurringEnd` set ~2 years out.
- Redirected to History tab.
- Recurring toggle resets to disabled.

---

## REC-05: Recurring Template Expands to Multiple Virtual Instances in History

**Setup:** Seed one recurring record starting 14 days ago, every 7 days.

**Steps:**
1. Go to History tab (All Time filter or filtered to include past 14 days).

**Expected Result:**
- At least 2 cards appear showing "↻ recurring" badge.
- Dates match the expansion: 14 days ago, 7 days ago, today (3 total).

---

## REC-06: Virtual Instance Dates Are Different From Template Start Date

**Setup:** Same recurring seed as REC-05.

**Steps:**
1. Open History with All Time filter.

**Expected Result:**
- Each ↻ recurring card shows its own date (not all showing template's start date).

---

## REC-07: Dashboard All-Time Total Includes Recurring Virtual Entries

**Setup:** Recurring seed (3 expansions × $100 flat = $300 total expected).

**Steps:**
1. Go to Dashboard.

**Expected Result:**
- All-time total is not $0.00.
- Total reflects the sum of all virtual instances (≥ $100).

---

## REC-08: Deleting a Recurring Template Removes All Virtual Instances

**Setup:** Recurring seed with multiple virtual instances visible.

**Steps:**
1. On History tab, click the Delete (✕) button on any ↻ recurring card.

**Expected Result:**
- All ↻ recurring badges disappear from History immediately.
- The template record is marked deleted in localStorage.

---

## REC-09: Custom Frequency Slider Works Correctly

**Setup:** Recurring toggle enabled, custom frequency button clicked.

**Steps:**
1. Slider appears in `#customFreqSliderRow`.
2. Drag slider to value 10.

**Expected Result:**
- `#sliderVal` shows "10d".
- `_recurringFreq` is set to 10.
- Slider value is retained.

---

## REC-10: Recurring Toggle Resets to Disabled After Successful Save

**Setup:** Recurring toggle enabled, form filled and submitted.

**Steps:**
1. After redirect to History, navigate back to Add tab.

**Expected Result:**
- `#recurringPanel` is not attached to DOM.
- Recurring toggle button shows inactive (`bg-gray-700`) state.
- `_recurringEnabled` global is `false`.
