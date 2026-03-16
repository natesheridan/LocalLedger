# LocaLedger — Application Context

> A complete reference for developers and agents working on this codebase.

---

## What Is LocaLedger?

LocaLedger is a **fully offline, single-page Progressive Web App (PWA)** for gig workers to track hourly shifts, flat-rate jobs, tips, and custom financial data. All data lives in the browser's `localStorage` — no backend, no accounts, no network requests for data.

---

## Project Structure

```
LocaLedger/
├── index.html                  # Entire app: markup, styles (Tailwind), and all JS logic
├── offline-charts.js           # Pure CSS/HTML chart rendering, loaded separately
├── sw.js                       # Service Worker — caches app files for offline use
├── manifest.json               # PWA manifest (icons, theme color, display mode)
├── package.json                # Dev + test scripts; @playwright/test devDependency
├── playwright.config.js        # Playwright configuration (headless, JSON reporter, artifacts)
├── run-tests.sh                # Test runner: installs deps, runs Playwright, generates failure-report.md
├── tests/
│   └── LocaLedger.spec.js     # Full Playwright E2E test suite (41 tests)
├── Context.md                  # This file — developer reference
├── UseCases.md                 # Human-readable test scenarios
├── icon.svg                    # App icon
└── README.md                   # Brief project description
```

**Test output** (git-ignored):
```
test-results/
├── results.json                # Playwright JSON output
├── failure-report.md           # Paste-ready failure summary for a fixing agent
├── ui-context/                 # #app HTML snapshots per tab per test run
└── playwright-artifacts/       # Screenshots on failure
```

**Key architectural choice:** Everything is in one HTML file. There are no modules, no build steps, no bundlers. The app runs directly from the filesystem or any static host.

---

## Storage Layer

### `localStorage` Keys

| Key | Type | Contents |
|-----|------|----------|
| `income_data` | JSON string | All records, location configs, custom field definitions |
| `income_meta` | JSON string | User ID and auto-increment counter for record IDs |
| `ll_dev_mode` | `"1"` or absent | Developer mode toggle |

### Core Data Shapes

#### Record
```js
{
  id: "income_user1_1",      // Generated: "income_" + userId + "_" + nextId
  date: "2026-03-15",        // ISO date (YYYY-MM-DD) — for recurring, this is the START date
  hours: 6.5,                // Hours worked (used when payType = "hourly"); 0 for flat recurring
  rate: 25,                  // Hourly or flat rate
  tips: 45.50,               // Tips earned
  location: "Downtown Bar",  // Free-text location name
  payType: "hourly" | "flat",
  deleted: false,            // Soft delete flag — never hard-deleted
  createdAt: 1710525600000,  // Unix ms timestamp
  updatedAt: 1710525600000,
  // ...custom field values keyed by field.key, e.g.:
  "CustomField_Company": "Acme",

  // ── Recurring fields (only present when type = "recurring") ──────────────
  type: "recurring",         // Optional — if set, this is a recurring template
  recurringFreq: 7,          // Days between occurrences (1, 7, 14, 30, 91, or 1–30 custom)
  recurringEnd: "2028-03-15" // ISO date — last possible occurrence (defaults to start + 2 years)
}
```

**Note on recurring records:** Only the template is stored. `expandRecurringEntries(records)` generates virtual instances at render time. Virtual instances carry `_isVirtual: true`, `_originalId`, `_originalCreatedAt`, and `_virtualDate`. They are not persisted. Editing or deleting a virtual instance targets the template.

#### Location Config
```js
// Stored in data.locations[locationName]
{
  lastRate: 25,              // Most recently used rate at this location
  preferredColor: "#6366f1"  // Hex color for charts
}
```

#### Custom Field Definition
```js
// Stored in data.customFields[]
{
  label: "Company",          // Display name (max 24 chars)
  type: "text" | "number" | "money" | "date" | "checkbox" | "longtext",
  key: "CustomField_Company", // Sanitized storage key
  addToTotal: "none" | "add" | "subtract"  // Only relevant for type=money
}
```

#### Metadata
```js
// income_meta
{
  userId: "user1",   // Always "user1" for single-user
  nextId: 42         // Increments each new record
}
```

---

## Global State Variables

These live in the top-level script scope in `index.html`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `activeTab` | `"dashboard"` | Currently visible tab |
| `showDeletedRecords` | `false` | Whether deleted records appear in history |
| `loadedMonths` | `2` | How many months are rendered in history scroll |
| `allRecords` | `[]` | Cache of all records for scroll load calculations |
| `isScrollLoad` | `false` | Prevents form state wipe during scroll-triggered re-render |
| `savedFormData` | `null` | Form values persisted while user browses other tabs |
| `editModeRecord` | `null` | The record currently being edited (or `null`) |
| `skipNextAddFormSave` | `false` | Prevents saving form state after a successful submit |
| `dateFilter` | `{type:"all"}` | Active date filter (type, startDate, endDate, label) |
| `historyFilters` | `{custom:{}}` | Active custom-field filters on History tab |
| `historySort` | `{type:"date", direction:"desc"}` | Active sort on History tab |
| `dashboardFilters` | `{custom:{}}` | Active custom-field filters on Dashboard tab |
| `devMode` | `false` | Enables developer tools in Settings |
| `_recurringEnabled` | `false` | Whether recurring toggle is active on Add form |
| `_recurringFreq` | `7` | Days between recurring occurrences (Add form state) |
| `_recurringEnd` | `""` | ISO date for recurring end, or `""` for auto (start + 2 years) |

---

## Income Calculation

Total income for a record is computed in layers:

```
Total = Base Pay + Tips + Custom Money Contributions

Base Pay:
  if payType === "flat"  → rate
  if payType === "hourly" → hours × rate

Custom Money Contributions:
  Sum of all money-type custom field values where addToTotal = "add"
  Minus sum of all values where addToTotal = "subtract"
```

**Functions involved:**
- `calculateBasePay(record)` → number
- `calculateMoneyCustomContribution(record, defs)` → number
- `calculateRecordTotal(record, defs)` → number (the final displayed total)
- `money(value)` → formatted string like `"$123.45"`

---

## Function Reference

### Storage & Initialization

| Function | Signature | What It Does |
|----------|-----------|-------------|
| `initStorage()` | `()` | Creates empty `income_data` and `income_meta` in localStorage if absent |
| `loadData()` | `() → object` | Parses and returns `income_data` from localStorage |
| `saveData(d)` | `(object)` | JSON-stringifies and writes data to localStorage |
| `loadMeta()` | `() → object` | Returns `income_meta` |
| `saveMeta(m)` | `(object)` | Writes metadata to localStorage |
| `generateId()` | `() → string` | Reads meta, increments `nextId`, saves, returns new ID like `"income_user1_5"` |

### Tab Navigation & Rendering

| Function | What It Does |
|----------|-------------|
| `switchTab(tab)` | Sets `activeTab`, handles form persistence, calls the appropriate render function |
| `renderDashboard()` | Builds stats, top locations, and chart section; respects `dateFilter` and `dashboardFilters` |
| `renderAdd(existing?)` | Builds the income entry form; if `existing` record passed, populates fields for editing |
| `renderHistory()` | Renders month-grouped records with filters, sort, and infinite scroll setup |
| `renderSettings()` | Renders locations list, custom fields list, export/import controls, and dev tools |
| `updateBottomNavForEditMode(isEditing)` | Swaps bottom nav buttons between normal mode and edit mode (Save / Cancel) |

### Record CRUD

| Function | What It Does |
|----------|-------------|
| `saveIncome(form, existing?)` | Reads form fields, builds record object, saves to localStorage; if `existing` provided, updates in place using `createdAt` tiebreak |
| `editRecord(id, createdAt?)` | Looks up record by ID (with optional `createdAt` tiebreak for duplicate IDs), calls `renderAdd(record)`, sets `editModeRecord` |
| `deleteRecord(id, createdAt?)` | Sets `record.deleted = true`, updates `updatedAt`, saves data; uses `createdAt` tiebreak |
| `restoreRecord(id, createdAt?)` | Sets `record.deleted = false`, saves data; uses `createdAt` tiebreak |
| `showShiftDetail(id, createdAt?)` | Renders detail overlay for a record; uses `createdAt` tiebreak |
| `toggleDeletedRecords()` | Flips `showDeletedRecords`, re-renders history |

### Filtering

| Function | What It Does |
|----------|-------------|
| `getFilteredRecords(records)` | Applies `dateFilter` to a record array; returns matching records |
| `applyCustomFilters(records, defs, filters)` | Applies custom field filter rules (selected values, min/max, checkbox) |
| `applyHistorySort(records, defs)` | Sorts records per `historySort` state (date, total, or custom field) |
| `setDateFilter(type, start, end, label)` | Updates `dateFilter` global and re-renders the active tab |
| `showDateFilterMenu()` | Renders date filter overlay |
| `applyCustomRange()` | Reads custom date inputs, calls `setDateFilter("range", ...)` |
| `showHistoryFilterMenu()` | Opens advanced filter overlay with per-field controls |
| `applyHistoryFiltersFromUI()` | Reads filter form, updates `historyFilters`, re-renders history |
| `countActiveCustomFilters(filters)` | Returns count of active filter rules (for badge display) |
| `countActiveDateFilter()` | Returns `1` if date filter is active, else `0` |

### Custom Fields

| Function | What It Does |
|----------|-------------|
| `setupCustomFields()` | Reads `customFields` from storage and renders inputs on the Add form |
| `showAddCustomFieldMenu()` | Opens creation dialog |
| `saveCustomField()` | Reads dialog inputs, validates, creates field definition, saves to storage |
| `showEditCustomFieldMenu(index)` | Opens edit dialog pre-populated with existing field data |
| `saveEditedCustomField(index)` | Updates field definition at `index` in `customFields` array |
| `deleteCustomField(index)` | Removes field from definitions (existing record values are orphaned but preserved) |
| `toggleMoneyFieldOptions()` | Shows/hides the `addToTotal` radio group based on selected type |

### Location Management

| Function | What It Does |
|----------|-------------|
| `setupLocationAutocomplete()` | Attaches input listener to location field; on typing, shows dropdown of matching stored locations |
| `autoFillRate(location)` | When a location is selected, reads `locations[name].lastRate` and fills the rate input |
| `openLocationEditMenu(oldName)` | Opens edit overlay pre-populated with current name and color |
| `saveLocationEdit(oldName)` | Calls `renameLocation` if name changed, updates color, saves |
| `renameLocation(oldName)` | Updates all records where `record.location === oldName`, updates locations key, saves |
| `showMergeLocations()` | Opens overlay to pick a source and target location; moves all source records to target |

### History & Scroll

| Function | What It Does |
|----------|-------------|
| `setupInfiniteScroll(months, monthTotals)` | Attaches scroll listener to history container |
| `handleHistoryScroll()` | Increments `loadedMonths` and re-renders when near bottom |
| `updateBannerForVisibleMonth()` | Detects which month section is in viewport; updates sticky banner |
| `showShiftDetail(id)` | Renders detailed view of a record in an overlay |
| `closeShiftDetail()` | Closes shift detail overlay |

### Export / Import

| Function | What It Does |
|----------|-------------|
| `exportData()` | Prompts user for JSON or CSV, then calls copy/share |
| `exportAsCSV(data)` | Formats records + header row as CSV string |
| `importData()` | Reads textarea JSON, merges into storage, **advances `income_meta.nextId`** past highest imported ID to prevent collision |
| `copyToClipboard(text)` | Uses `navigator.clipboard` or shows fallback prompt |
| `clearAllData()` | **Destructive.** Clears all records, locations, and custom fields. Requires double confirmation. |

### Charts (`offline-charts.js`)

| Function | What It Does |
|----------|-------------|
| `renderOfflineCharts()` | Entry point; reads chart type state and calls appropriate render function |
| `switchChartView(view)` | Updates chart type state and re-renders |
| `renderChartControls()` | Renders the tab bar for selecting chart type |
| `showEmptyChartState()` | Displays "no data" placeholder when there are no records |

### UI Helpers

| Function | What It Does |
|----------|-------------|
| `showToast(message, duration)` | Displays a brief notification in bottom-right corner |
| `todayISO()` | Returns today's date as `YYYY-MM-DD` in local timezone |
| `money(value)` | Formats a number as `$X.XX` |
| `normalizeHexColor(hex)` | Validates and normalizes a hex color string |
| `hexToRgba(hex, alpha)` | Converts `#RRGGBB` to `rgba(r,g,b,alpha)` |
| `getLocationPreferredColor(loc)` | Returns stored color for a location or a default |
| `getLocationTintStyle(loc)` | Returns inline style string using location color for card backgrounds |
| `updateLabel(labelId)` | Manages floating label animation (active when field has value) |
| `clearForm()` | Resets all Add form fields and floating labels |
| `setPayType(type, silent?)` | Toggles hourly/flat UI; `silent` prevents state side effects |

### Data Health (Settings → Clean Data)

| Function | What It Does |
|----------|-------------|
| `showDataCleanup()` | Entry point — scans records, opens the slide-up Clean Data overlay; routes directly to Screen 1 (duplicates), Screen 2 (field issues), or Done if clean |
| `detectDataIssues(data)` | Returns `{ duplicateIds: {}, otherIssues: [] }` — duplicate IDs grouped by ID, field-level issues per record (missing payType/createdAt, non-numeric string in hours/rate/tips) |
| `_renderCleanScreen1(issues)` | Renders the duplicate ID screen with grouped record cards, "Fix All Automatically", and "Skip" buttons |
| `_cleanAutoFixDups()` | Iterates records, keeps first occurrence of each ID, reassigns a fresh `generateId()` to all duplicates; advances `income_meta.nextId` |
| `_cleanSkipDups()` | Skips Screen 1, advances to Screen 2 or Done |
| `_renderCleanScreen2(issues, fixedDups)` | Renders the field-issue screen with per-record Fix/Delete buttons and "Fix All Automatically" batch button |
| `_cleanFixRecord(id, createdAt, fixedDups)` | Applies sensible defaults to one record (payType → `"hourly"`, createdAt → now, NaN numerics → 0); re-renders Screen 2 or Done |
| `_cleanDeleteRecord(id, createdAt, fixedDups)` | Permanently splices one record from the array; re-renders Screen 2 or Done |
| `_cleanFixAllOther(fixedDups)` | Applies sensible defaults to all records with issues in one pass; calls Done |
| `_renderCleanDone(fixedDups, fixedOther)` | Renders the summary screen (checkmark, fixed counts); shows "Data is Healthy" if nothing was fixed |
| `closeCleanDataMenu()` | Slides out and removes `#cleanDataSheet` and `#cleanDataOverlay` from DOM |

**Issue types detected by `detectDataIssues`:**

| Issue | Detection | Auto-fix Applied |
|-------|-----------|-----------------|
| Duplicate IDs | Same `id` on 2+ records | Reassign new ID to all but first occurrence |
| Missing `payType` | `!r.payType` | Set to `"hourly"` |
| Missing `createdAt` | `r.createdAt == null` | Set to `Date.now()` |
| Invalid `hours` | `isNaN(parseFloat(r.hours))` where value is not null | Set to `0` |
| Invalid `rate` | `isNaN(parseFloat(r.rate))` where value is not null | Set to `0` |
| Invalid `tips` | `isNaN(parseFloat(r.tips))` where value is not null | Set to `0` |

> Note: `NaN` is coerced to `null` by `JSON.stringify`. The invalid-numeric check only fires on non-null, non-numeric string values (e.g., `"bad_value"`) that survive the JSON round-trip.

### Developer Tools (only visible in dev mode)

| Function | What It Does |
|----------|-------------|
| `devModeTap()` | Increments a counter; 5 taps on the app title enables dev mode |
| `devExitMode()` | Disables dev mode |
| `devSetupDemoWorkspace()` | One-shot: sets 8 versatile custom fields, creates 6 gig persona locations, seeds 22 realistic entries (rideshare, Turo, freelance dev, RE photography, valet, serving) |
| `devAddTestEntries()` | Alias for `devSetupDemoWorkspace()` |
| `devSeedLocations()` | Creates 7 bar/restaurant locations with preset colors (legacy) |
| `devSeedCustomFields()` | Adds 7 legacy test custom field definitions |
| `devSeedEntriesWithFields()` | Generates 15 records with legacy custom field values populated |

### Recurring Transaction Helpers

| Function | What It Does |
|----------|-------------|
| `expandRecurringEntries(records)` | Takes non-deleted records, expands `type:"recurring"` templates into virtual instances up to today. Returns normal records + virtual entries interleaved. |
| `toggleRecurring()` | Flips `_recurringEnabled`, re-renders Add form |
| `setRecurringFreq(days)` | Updates `_recurringFreq`, refreshes frequency button highlight |
| `toggleCustomFreqSlider()` | Shows/hides the custom frequency range slider |
| `clearRecurringStartDate()` | Clears the date input and start badge |
| `_updateRecurStartBadge(isoDate)` | Updates `#recurStartBadge` with a human-readable date string |

---

## How Core Flows Connect

### Adding a Record (end-to-end)
```
User fills Add form
  → setPayType() toggles hourly/flat UI
  → setupLocationAutocomplete() shows location suggestions
  → autoFillRate() prefills rate if location is recognized
  → User submits
  → saveIncome(form)
      → generateId() creates unique ID
      → builds record object
      → reads customFields to collect custom input values
      → appends record to data.records
      → updates data.locations[name].lastRate
      → saveData(data)
      → showToast("Entry saved!")
      → clearForm()
      → switchTab("history") [optional, app may stay on Add]
```

### Editing a Record
```
User clicks Edit on a history card
  → editRecord(id)
      → finds record in data.records
      → sets editModeRecord = record
      → renderAdd(record) populates form fields
      → updateBottomNavForEditMode(true) shows Save/Cancel nav
User submits
  → saveIncome(form, existing=editModeRecord)
      → finds record by ID, overwrites all fields
      → updates updatedAt timestamp
      → saveData(data)
      → editModeRecord = null
      → updateBottomNavForEditMode(false)
      → switchTab("history")
```

### Editing a Location
```
User opens Settings → Locations
  → openLocationEditMenu(oldName)
      → pre-fills name and color inputs in overlay
User changes name and/or color, saves
  → saveLocationEdit(oldName)
      → if name changed: renameLocation(oldName)
          → iterates ALL records, updates record.location where it matches
          → renames key in data.locations
      → updates data.locations[newName].preferredColor
      → saveData(data)
      → re-renders settings
```

### Deleting a Record (soft delete)
```
User clicks Delete on history card
  → deleteRecord(id)
      → sets record.deleted = true
      → sets record.updatedAt = now
      → saveData(data)
      → re-renders history
Record stays in data but is hidden unless showDeletedRecords = true
User can restore via restoreRecord(id)
```

### Custom Filter + Sort on History
```
User opens filter menu
  → showHistoryFilterMenu() renders per-field controls
User sets filters, clicks Apply
  → applyHistoryFiltersFromUI()
      → reads form, updates historyFilters
      → re-renders history via renderHistory()
          → getFilteredRecords() applies dateFilter
          → applyCustomFilters() applies field-level rules
          → applyHistorySort() orders results
          → renders grouped by month
          → setupInfiniteScroll() attaches scroll handler
```

---

## Service Worker & PWA

`sw.js` uses a **cache-first** strategy:
1. On install: caches `index.html` and `offline-charts.js`
2. On fetch: serves from cache if available, otherwise fetches from network
3. This means the app works fully offline after first load

---

## No Build Step

There is no webpack, Vite, Rollup, or TypeScript. To run locally:
```sh
npm run dev   # runs: live-server . --port=8080
```
Or just open `index.html` directly in a browser.

---

## Dependency Map

```
index.html
  ├── (CDN) Tailwind CSS v3 — all styling utilities
  ├── (CDN) Google Fonts: Space Mono — monospace body font
  └── (local) offline-charts.js — chart rendering
        └── reads global state from index.html (dateFilter, dashboardFilters, data)

sw.js — independent, registered by index.html on load
manifest.json — referenced by index.html <link rel="manifest">
```

---

## Key Behaviors to Know

1. **Soft deletes only** — `deleteRecord` never removes from the array. Deleted records have `deleted: true` and are hidden by default.
2. **Form persistence** — switching tabs saves form state to `savedFormData` and restores it on return. Edit mode overrides this.
3. **Location colors** — every location has a `preferredColor` hex value used consistently across charts and card tints.
4. **Custom money fields** — can contribute positively, negatively, or not at all to the displayed total. Controlled by `addToTotal`.
5. **Infinite scroll** — history loads 2 months at a time. `loadedMonths` increments as user scrolls down.
6. **No hard IDs for locations** — locations are keyed by their name string. Renaming requires scanning all records.
7. **ID format** — `income_userId_nextId` e.g. `income_user1_17`. `nextId` only increments, never resets.
8. **Duplicate ID safety** — `editRecord`, `deleteRecord`, `restoreRecord`, and `showShiftDetail` all accept an optional `createdAt` tiebreak. History card buttons pass `r.createdAt` to guarantee the correct record is targeted even if two records share an ID.
9. **Import advances nextId** — `importData()` computes the highest ID suffix in the imported records and advances `income_meta.nextId` to one above it. This prevents new records from colliding with imported IDs after a clear-then-import cycle.
10. **Data Health scan** — Settings → Clean Data runs `detectDataIssues()` to surface duplicate IDs and invalid field values. Both batch and per-record fix paths are available. The feature never deletes records without explicit user action.
