---
name: fix-flaky-test
description: Diagnose and fix intermittent feature test failures in a Ruby on Rails test suite (capybara or minispec unit tests). Use when tests pass sometimes but fail others, when you see timing-related errors, stale element exceptions, or when tests require logout/login workarounds.
---

# Fix Flaky Test

## Overview

Diagnose and fix intermittent test failures caused by timing issues, race conditions, test isolation problems, and non-deterministic behavior. This skill applies patterns derived from **90+ real flaky test fixes** across 10 pattern categories with **51+ specific patterns**:

1. **Test Isolation** (4 patterns) - Fixture cleanup, record deletion, state isolation, delete_all in helpers
2. **Time/Timezone** (12 patterns) - MarketTime usage, freeze_time, trading hours, middle_of_day, year boundaries, browser clock
3. **Non-Deterministic Results** (11 patterns) - Ordering, finders, collection comparisons, fixtury aliases
4. **Feature Test UI** (13 patterns) - Dropdowns, navigation, notifications, conditionally rendered fields
5. **Factory/Random Data** (1 pattern) - Validation loops, deterministic values
6. **Process Order** (1 pattern) - Data creation timing with time travel
7. **Fixture Selection** (2 patterns) - Matching fixtures to requirements, explicit factory params
8. **Helper Methods** (1 pattern) - Explicit parameter passing
9. **VCR/HTTP** (1 pattern) - Cassette replay options
10. **Assertion Values** (3 patterns) - Dynamic values, exact expectations, no timing assertions

## When to Use This Skill

- Test passes locally but fails in CI (Bamboo)
- Test fails intermittently with timing-related errors
- You see `Selenium::WebDriver::Error::StaleElementReferenceError`
- You see `Capybara::ElementNotFound` for elements that should exist
- Test requires logout/login/revisit workarounds to pass
- Assertions fail with "expected to find text" errors
- Tests fail near year boundaries (late December)
- Tests fail with ordering-dependent assertions
- Tests fail due to shared fixture state

## Prerequisites

- The failing test file path
- Ideally, the error message or stack trace from a failure

## Instructions

### Step 1: Gather Information

Ask the user for:

1. **Test file path** (required): e.g., `test/features/sponsor/plan_access_role_test.rb`
2. **Specific test name** (optional): e.g., `test_admin_can_view_plan_settings`
3. **Error message** (optional but helpful): The failure output from CI or local run

If not provided, ask: "What's the path to the flaky test file?"

### Step 2: Read the Test and Identify Test Type

Read the test file and classify it:

- **Feature Test**: Located in `test/features/`, uses Capybara/Selenium
- **Unit Test/Op Test**: Located in `test/ops/` or `test/models/`
- **Process Test**: Located in `test/process/`
- **GraphQL Test**: Tests GraphQL mutations/queries

This classification determines which patterns are most likely to apply.

### Step 3: Analyze for Applicable Patterns

**Run through this checklist to identify which flake patterns apply:**

#### A. Test Isolation Issues (check fixtures and setup)

| Indicator                                               | Pattern to Apply                                         |
| ------------------------------------------------------- | -------------------------------------------------------- |
| Test uses shared fixtures (fixtury)                     | Consider deleting related records in `before_each` (1.1) |
| Test creates records that persist across tests          | Add cleanup in `before_each` (1.1)                       |
| State transitions blocked by related records            | Delete blocking records first (1.2)                      |
| Helper sets state without clearing first                | Use `delete_all` in helpers (1.3)                        |
| Test assertions depend on record counts (.count, .last) | Use explicit finders instead (3.1, 3.7)                  |
| Multiple tests share the same user/plan/account         | Create isolated fixtures (1.4)                           |

#### B. Time/Date Issues (check for date operations)

| Indicator                                               | Pattern to Apply                                        |
| ------------------------------------------------------- | ------------------------------------------------------- |
| Test uses `Date.today`, `Time.now`, `Date.current`      | Replace with `MarketTime.today`, `MarketTime.now` (2.5) |
| Test displays dates to users                            | Use `MarketTime.date()` for timezone consistency (2.1)  |
| Test uses `time_travel` and order of operations matters | Use `freeze_time` instead (2.2)                         |
| Test runs near year-end (December)                      | Use `freeze_time_avoiding_year_boundary` (2.3)          |
| Frontend test with date handling                        | Use `Date.UTC()` constructor (2.4)                      |
| Test uses ActiveSupport Duration (1.month.ago)          | Use MarketTime arithmetic (2.6)                         |
| State setup depends on relative dates                   | Use time_travel during setup (2.7)                      |
| Test involves trading-hour-sensitive operations         | Wrap in `time_travel noon` (2.8)                        |
| Test checks "ends in X days" or relative time text      | Use `middle_of_day` (2.9)                               |
| Test compares timestamps across different sources       | Wrap in `MarketTime.time()` (2.10)                      |
| Test uses hardcoded year counts                         | Use dynamic calculation (2.11)                          |
| Feature test uses `travel_to` but JS computes dates     | Use `freeze_time_in_app_and_browser` (2.12)             |

#### C. Non-Deterministic Results (check assertions)

| Indicator                                             | Pattern to Apply                            |
| ----------------------------------------------------- | ------------------------------------------- |
| Test uses `.last`, `.first` without explicit ordering | Use `find_by!` with specific criteria (3.1) |
| Test uses `.last` on recently created records         | Store created objects explicitly (3.7)      |
| Test compares lists/arrays of IDs                     | Sort before comparing (3.2)                 |
| Test error messages include IDs in order              | Sort IDs in the error message (3.2)         |
| Database queries without `.order()`                   | Add explicit ordering (3.3)                 |
| Test checks membership in unordered collection        | Use `assert_includes` (3.4)                 |
| Items have equal sort values                          | Use `detect` to find specific items (3.5)   |
| Test compares subset where internal order varies      | Use `assert_array` (3.6)                    |
| Test uses `.sample` for random selection              | Use deterministic value (3.8)               |
| Test uses `.second`, `.third` on associations         | Get through relationships (3.9)             |
| Test outputs hash in error message                    | Sort hash before inspect (3.10)             |
| Test uses `Model.first` instead of fixtury alias      | Use `fixtury(as:)` (3.11)                   |

#### D. Feature Test UI Issues (check Capybara interactions)

| Indicator                                           | Pattern to Apply                                                |
| --------------------------------------------------- | --------------------------------------------------------------- |
| Test clicks on dropdown options                     | Use `with:` parameter to filter first (4.1)                     |
| Test interacts with modals/drawers                  | Wait for animation completion (4.2)                             |
| `assert_changes` inside `within` block              | Move `within` inside `assert_changes` (4.3)                     |
| Test clicks button and immediately asserts          | Wait for result with `assert_text` inside assertion (4.3, 4.10) |
| Test clicks link and proceeds without waiting       | Wait for navigation to complete (4.5)                           |
| Test reads cookies immediately after visit          | Wait for page load first (4.6)                                  |
| Test proceeds immediately after dropdown selection  | Wait for async UI updates (4.7)                                 |
| Test doesn't verify dropdown values committed       | Add `assert_field_value` (4.8)                                  |
| Test uses `has_text?` for conditional logic         | Use deterministic state check (4.9)                             |
| Toast notification may overlay buttons              | Dismiss notifications first (4.11)                              |
| Generic `within "main"` selector                    | Use specific component selector (4.12)                          |
| Test interacts with conditionally rendered field    | Wait for field to appear first (4.13)                           |
| `within` block after action that triggers re-render | Use full selector instead of `within` (4.14)                    |
| `click_submit` followed by `refute_text`            | Wait for next page instead of refuting previous (4.15)          |

#### E. Factory/Random Data Issues (check factories)

| Indicator                                               | Pattern to Apply                                  |
| ------------------------------------------------------- | ------------------------------------------------- |
| Test uses Faker for constrained fields (EIN, SSN)       | Add validation loop to avoid invalid values (5.1) |
| Factory creates data that conflicts with business rules | Customize factory for test context (5.1)          |

#### F. Fixture Selection Issues (check fixture usage)

| Indicator                                | Pattern to Apply                   |
| ---------------------------------------- | ---------------------------------- |
| Generic fixture missing required state   | Use more specific fixture (7.1)    |
| Factory creates unrelated parent records | Pass explicit IDs to factory (7.2) |

#### G. Helper Method Issues (check helper calls)

| Indicator                                   | Pattern to Apply               |
| ------------------------------------------- | ------------------------------ |
| Helper relies on implicit `user` or context | Pass explicit parameters (8.1) |

#### H. VCR/HTTP Issues (check cassette usage)

| Indicator                  | Pattern to Apply                         |
| -------------------------- | ---------------------------------------- |
| Test retries HTTP requests | Use `allow_playback_repeats: true` (9.1) |

#### I. Assertion Value Issues (check test assertions)

| Indicator                                 | Pattern to Apply                       |
| ----------------------------------------- | -------------------------------------- |
| Test uses hardcoded expected values       | Use values from created objects (10.1) |
| Event expectations use `kind_of` matchers | Use exact expected values (10.2)       |
| Test uses `.after_at()` timing assertions | Remove timing assertions (10.3)        |

### Step 4: Apply Fixes Based on Analysis

---

## Pattern Catalog

### Category 1: Test Isolation Patterns

#### Pattern 1.1: Delete Related Records Before Test

**Source**: PR #56470, PR #42560

When shared fixtures create records that interfere with other tests:

```ruby
# ❌ FLAKY - Other tests may have created PlanAdjustmentProposals
def test_it_evaluates_auto_approval
  pap = create_proposal
  assert pap.approved?
end

# ✅ STABLE - Clean slate for this test
def before_each
  ::PlanAdjustmentProposal.where(plan: pcp.plan).delete_all
end

def test_it_evaluates_auto_approval
  pap = create_proposal
  assert pap.approved?
end
```

Common records to clean up:

- `::PlanAdjustmentProposal`
- `::TradeUnit`
- `pending_activity_blocking_offboarding` (for participant state transitions)
- Any model your test queries with `.count`, `.last`, or `.first`

#### Pattern 1.2: Delete Blocking Records Before State Transitions

**Source**: PR #54950

When testing state transitions, related records may block the transition:

```ruby
# ❌ FLAKY - Pending activities may block dismissal
def dismiss_pcp
  pcp.update(termination_date: termination_date)
  ::DcParticipantStateEvaluationOp.submit!(dc_participant_id: pcp.id)
end

# ✅ STABLE - Clear blocking records first
def dismiss_pcp
  pcp.pending_activity_blocking_offboarding.delete_all
  pcp.update(termination_date: termination_date)
  ::DcParticipantStateEvaluationOp.submit!(dc_participant_id: pcp.id)
end
```

#### Pattern 1.3: Use delete_all for State Setup Helpers

**Source**: PR #33636

In helpers that set state, delete existing records first:

```ruby
# ❌ FLAKY - Previous test may have created state transitions
def set_active_state_time(time_at, account_group)
  state_transition = account_group.state_transitions.find_or_initialize_by(...)
  state_transition.update!(transitioned_at: time_at, sequence: 1)
end

# ✅ STABLE - Clean slate before setting state
def set_active_state_time(time_at, account_group)
  ::StateTransition.delete_all  # Clear any existing transitions
  state_transition = account_group.state_transitions.find_or_initialize_by(...)
  state_transition.update!(transitioned_at: time_at, sequence: 1)
end
```

Use `.delete_all` instead of `.destroy_all` when callbacks aren't needed - it's faster and sufficient for test cleanup.

#### Pattern 1.4: Create Isolated Fixtures

**Source**: PR #48491, PR #46613

When tests can't share state, create separate fixture namespaces:

```ruby
# ❌ FLAKY - Tests modifying shared fixture state
fixtury("ira/personal/onboarded_force_out/account_group", as: :account_group)

def test_funded_account_shows_banner
  fund_force_out_account(account_group.accounts.first)
  # Now account_group is modified for other tests!
end

# ✅ STABLE - Separate fixtures for different states
fixtury("ira/personal/onboarded_force_out/account_group", as: :unfunded_account_group)
fixtury("ira/personal/onboarded_force_out_funded/account_group", as: :funded_account_group)

def test_funded_account_shows_banner
  auth_and_visit(funded_account_group.user)
  assert_text "You have multiple IRAs"
end
```

---

### Category 2: Time and Timezone Patterns

#### Pattern 2.1: Use MarketTime for Date Consistency

**Source**: PR #50557, PR #50210

```ruby
# ❌ FLAKY - Timezone inconsistency between server and display
assert_text financial_account.first_active_state_at.strftime("%B %-d, %Y")

# ✅ STABLE - Consistent timezone handling
assert_text ::MarketTime.date(financial_account.first_active_state_at).strftime("%B %-d, %Y")
```

#### Pattern 2.2: freeze_time vs time_travel

**Source**: PR #43717

Use `freeze_time` when the order of time-sensitive operations matters:

```ruby
# ❌ FLAKY - time_travel continues moving forward
def before_each
  time_travel ::MarketTime.time(MarketTime.today + 30.days)
  Bus.inline!
  Sidekiq::Testing.inline!
end

# ✅ STABLE - freeze_time keeps time fixed during setup
def before_each
  freeze_time ::MarketTime.time(MarketTime.today + 30.days)
  Bus.inline!
  Sidekiq::Testing.inline!
end
```

#### Pattern 2.3: Year-End Boundary Issues

**Source**: PR #43717, PR #55696

Tests running in late December may fail when operations cross year boundaries:

```ruby
# ❌ FLAKY - May fail on Dec 31 when "tomorrow" is next year
def test_creates_record_for_tomorrow
  record = create_record(date: MarketTime.tomorrow)
  assert_eq MarketTime.current_year, record.plan_year
end

# ✅ STABLE - Use helper to avoid year boundary
def test_creates_record_for_tomorrow
  freeze_time_avoiding_year_boundary(offset_days: 1) do
    record = create_record(date: MarketTime.tomorrow)
    assert_eq MarketTime.current_year, record.plan_year
  end
end
```

#### Pattern 2.4: Frontend Date Construction

**Source**: PR #49316

```typescript
// ❌ FLAKY - Local timezone may shift the date
const input = {
  startDate: new Date(values.startDate),
};

// ✅ STABLE - Explicit UTC construction
const localDate = new Date(values.startDate);
const utcDate = new Date(
  Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate())
);
const input = {
  startDate: utcDate.toISOString().split("T")[0],
};
```

#### Pattern 2.5: Use MarketTime Instead of Date.current

**Source**: PR #56086

```ruby
# ❌ FLAKY - Date.current may differ from MarketTime in edge cases
today = Date.current

# ✅ STABLE - Consistent with codebase time handling
today = ::MarketTime.today
```

#### Pattern 2.6: Use MarketTime for Date Arithmetic

**Source**: PR #52004

```ruby
# ❌ FLAKY - ActiveSupport::Duration may have timezone issues
BatchOp.submit!(start_date: 1.month.ago, end_date: 1.month.from_now)

# ✅ STABLE - MarketTime-based arithmetic
BatchOp.submit!(start_date: ::MarketTime.today - 1.month, end_date: ::MarketTime.today)
```

#### Pattern 2.7: Set Up State at Correct Time

**Source**: PR #44479

When state depends on dates, use time_travel during setup:

```ruby
# ❌ FLAKY - Termination date relative to "now" may cause issues
pcp.update!(termination_date: ::MarketTime.yesterday)
::Bus.inline! do
  pcp.dismiss!
end

# ✅ STABLE - Set up state at the right point in time
time_travel ::MarketTime.yesterday.noon do
  pcp.update!(termination_date: ::MarketTime.business_days_offset(days: -2))
  ::Bus.inline! do
    pcp.dismiss!
  end
end
```

#### Pattern 2.8: Avoid Trading Hours Edge Cases

**Source**: PR #46096

Wrap tests involving trading-hour-sensitive operations:

```ruby
# ❌ FLAKY - May fail during actual trading hours
def test_it_can_delete_and_recreate
  enable_ledger!(plan: plan)
  create_balance(pcp1, dividend, 10)
  submit_op!(dividend: dividend, rebuild_all_units: true)  # Fails during trading hours
end

# ✅ STABLE - Fix time to noon (outside trading hours)
def test_it_can_delete_and_recreate_during_day
  time_travel ::MarketTime.today.noon do
    enable_ledger!(plan: plan)
    create_balance(pcp1, dividend, 10)
    submit_op!(dividend: dividend, rebuild_all_units: true)
  end
end
```

#### Pattern 2.9: Use middle_of_day for Time-Sensitive Display Tests

**Source**: PR #48195

```ruby
# ❌ FLAKY - "ends in 3 days" may show "ends in 2 days" near midnight
discount.update!(end_date: MarketTime.today + 3.days)
visit "/sponsor/pbe/review-plan/pricing-details"
assert_text "Offer ends in 3 days"

# ✅ STABLE - Fix time to middle of day
discount.update!(end_date: MarketTime.today + 3.days)
travel_to MarketTime.today.middle_of_day do
  visit "/sponsor/pbe/review-plan/pricing-details"
  assert_text "Offer ends in 3 days"
end
```

#### Pattern 2.10: Wrap Time Comparisons in MarketTime.time()

**Source**: PR #36258

```ruby
# ❌ FLAKY - Timezone mismatch in comparison
assert matching_portfolio.deactivated_state_at + 14.days < eedf.pay_date

# ✅ STABLE - Consistent timezone handling
assert MarketTime.time(matching_portfolio.deactivated_state_at) + 14.days < ::MarketTime.time(eedf.pay_date)
```

#### Pattern 2.11: Use Dynamic Date Calculations

**Source**: PR #47826

```ruby
# ❌ FLAKY - Hardcoded count assumes specific years
assert_changes -> { compliance_record_count } do
  run_play!(start_date: start_date, today: today)
end.by(2)  # Assumes 2022 and 2023

# ✅ STABLE - Calculate expected count dynamically
assert_changes -> { compliance_record_count } do
  run_play!(start_date: start_date, today: today)
end.by(::MarketTime.current_year - ::MarketTime.date(start_date).year)
```

#### Pattern 2.12: Use freeze_time_in_app_and_browser When Browser JS Computes Dates

**Source**: PR #59139

`travel_to` and `freeze_time` only freeze Ruby's `Time.now` — the browser's JavaScript `new Date()` still uses the real system clock. When a React component computes time-dependent text **client-side** (e.g., "Offer ends in 3 days" via `Math.floor((expiresAt - Date.now()) / msPerDay)`), the browser and server disagree on what "now" is. This causes flakiness when the test runs near a day boundary (e.g., CI running near midnight MarketTime).

```ruby
# ❌ FLAKY - travel_to only freezes Ruby time, not the browser's JS Date()
travel_to today.middle_of_day do
  visit "/sponsor/pbe/review-plan/pricing-details"
  within "[data-test-id='employer-card']" do
    assert_text "Offer ends in 3 days"  # Browser uses real time, may compute 2 days
  end
end

# ✅ STABLE - freeze_time_in_app_and_browser freezes both Ruby AND browser time
freeze_time_in_app_and_browser(today.middle_of_day)
visit "/sponsor/pbe/review-plan/pricing-details"
within "[data-test-id='employer-card']" do
  assert_text "Offer ends in 3 days"
end
```

**How it works**: `freeze_time_in_app_and_browser(datetime)` calls `time_travel(datetime)` (Ruby) and `set_datetime!(datetime)` (browser). The browser stub is applied via a `__stub_set_datetime` query param on the next `visit`, which the client reads to override `Date.now()`.

**Key indicators**:

- Feature test uses `travel_to` or `freeze_time` but a React component computes dates with `new Date()`
- Assertions on relative time text ("ends in X days", "expires tonight", "X days ago")
- Test passes locally but fails in CI (different timezone/time of day)

---

### Category 3: Non-Deterministic Results

#### Pattern 3.1: Explicit Finders Instead of Positional

**Source**: PR #54118

```ruby
# ❌ FLAKY - .last depends on insertion order, which may vary
submit_op! stats_base_attributes
stat = SponsorStat.last
assert_eq nil, stat.dc_plan_nonelective_contribution

# ✅ STABLE - Explicit criteria
submit_op! stats_base_attributes
stat = SponsorStat.find_by!(sponsor_id: sponsor_id, interval_type: "day")
assert_eq nil, stat.dc_plan_nonelective_contribution
```

#### Pattern 3.2: Sort Before Comparing

**Source**: PR #50825

```ruby
# ❌ FLAKY - Database may return IDs in any order
def validate_plan_ids_are_valid
  errors.add(:plan_ids, "#{invalid_plan_ids.join(", ")} do not have...")
end

# In test:
assert_error "Plan ids 1, 2 do not have..."  # May fail if DB returns "2, 1"

# ✅ STABLE - Sort for deterministic output
def validate_plan_ids_are_valid
  errors.add(:plan_ids, "#{invalid_plan_ids.sort.join(", ")} do not have...")
end

# In test:
invalid_plan_ids = [plan.id, plan2.id].sort.join(", ")
assert_error "Plan ids #{invalid_plan_ids} do not have..."
```

#### Pattern 3.3: Explicit Query Ordering

**Source**: PR #50825

```ruby
# ❌ FLAKY - No guaranteed order
def filing_preflights
  ::FilingPreflight.where(plan_id: plan_ids).to_a
end

# ✅ STABLE - Explicit order
def filing_preflights
  ::FilingPreflight.where(plan_id: plan_ids).order(:plan_id).to_a
end
```

#### Pattern 3.4: Use assert_includes for Unordered Collections

**Source**: PR #41852

When the order of items in a collection is not guaranteed:

```ruby
# ❌ FLAKY - .first may return different item each time
assert_eq employee_shape.emails.first.value, user.email

# ✅ STABLE - Check membership instead of position
assert_includes employee_shape.emails.map(&:value), user.email
```

#### Pattern 3.5: Use detect for Non-Deterministic Sort Order

**Source**: PR #42735

When items have equal sort values, use `detect` to find specific items:

```ruby
# ❌ FLAKY - Equal nc_alloc_cents means order is undefined
result_pcp1.update!(nc_alloc_cents: 10_000)
result_pcp2.update!(nc_alloc_cents: 10_000)  # Same value!
op = submit_op!(...)
assert_eq result_pcp1, op.result_participants.first  # May fail!

# ✅ STABLE - Use detect to find specific items
result_pcp1.update!(nc_alloc_cents: 10_000)
result_pcp2.update!(nc_alloc_cents: 10_000)
op = submit_op!(...)

assert_eq 2, op.result_participants.count
op_result_pcp1 = op.result_participants.detect { |pcp| pcp.id == result_pcp1.id }
op_result_pcp2 = op.result_participants.detect { |pcp| pcp.id == result_pcp2.id }

refute_nil op_result_pcp1
refute_nil op_result_pcp2
assert_eq 0.50, op_result_pcp1.percent_of_total_allocation
```

#### Pattern 3.6: Use assert_array for Unordered Subset Comparisons

**Source**: PR #44371

When comparing items that should be in a group but order within group varies:

```ruby
# ❌ FLAKY - Priority between pending/resolved may vary
assert_eq tasks[0], dc_participant_task_pending
assert_eq tasks[1], dc_participant_task_resolved

# ✅ STABLE - Assert group membership without order
assert_array tasks.first(2), [dc_participant_task_pending, dc_participant_task_resolved]
assert_eq tasks[2], dc_participant_task_expired  # These have deterministic order
```

#### Pattern 3.7: Store Created Objects Instead of Using .last

**Source**: PR #55055

```ruby
# ❌ FLAKY - .last may return different record if tests run in parallel
create_payroll_run(today)
go_to_payroll_run!(PayrollRun.last)

# ✅ STABLE - Store the reference explicitly
payroll_deduction = conduct_payroll_buy(pcp: pcp, amounts: { dc: 100_00 })
deduction_payroll_run = payroll_deduction.payroll_run
go_to_payroll_run!(deduction_payroll_run)
```

#### Pattern 3.8: Avoid .sample for Random Selection

**Source**: PR #40227, PR #53832

```ruby
# ❌ FLAKY - Random selection can cause unexpected values
company_offering_shape.benefit_type = (VALID_TYPES - [current_type]).sample
updated_field = %i[transition_date first_pay_date].sample

# ✅ STABLE - Use deterministic value
company_offering_shape.benefit_type = ::System::OFFERING_LOAN
updated_field = :transition_date
```

#### Pattern 3.9: Get References Through Relationships, Not Position

**Source**: PR #33636

```ruby
# ❌ FLAKY - .second/.third depend on insertion order
let(:primary_company) { controlled_group.primary_company }
let(:secondary_company_1) { controlled_group.companies.second }
let(:secondary_company_2) { controlled_group.companies.third }

# ✅ STABLE - Get through actual relationships
let(:primary_company) { primary_plan.sponsor.company }
let(:secondary_company_1) { secondary_plan_1.sponsor.company }
let(:secondary_company_2) { secondary_plan_2.sponsor.company }
```

#### Pattern 3.10: Sort Hash Output for Deterministic Inspection

**Source**: PR #33636

```ruby
# ❌ FLAKY - Hash iteration order may vary
error("Email interactions not delivered", ["states: #{state_counts.inspect}"])

# ✅ STABLE - Sort hash for deterministic output
error("Email interactions not delivered", ["states: #{state_counts.sort_by(&:first).to_h.inspect}"])
```

#### Pattern 3.11: Use Fixtury `as:` Alias Instead of .first

**Source**: PR #49738

```ruby
# ❌ FLAKY - .first depends on database state
fixtury("401k/started/pcp1")
let(:dc_participant) { ::DcParticipant.first }

# ✅ STABLE - Use fixtury alias
fixtury("401k/started/pcp1", as: :dc_participant)
```

---

### Category 4: Feature Test UI Patterns

#### Pattern 4.1: Searchable Dropdown Selection

**Source**: PR #56297, PR #56056

```ruby
# ❌ FLAKY - Race condition clicking on large dropdown list
select_value("Other Scientific and Technical Consulting Services", from: :industry)

# ✅ STABLE - Filter dropdown first with `with:` parameter
select_value("Other Scientific and Technical Consulting Services", from: :industry, with: "Other Scientific")
```

The `select_value` helper now also waits for dropdown cleanup:

```ruby
# In select_test_helper.rb - automatically waits for listbox to close
if with.present?
  assert_no_selector("[role='listbox']", visible: :visible, wait: 1)
  element.assert_matches_selector("[name='#{from}']", wait: 1)
end
```

#### Pattern 4.2: Skip Animations in Tests

**Source**: PR #44730

React Spring animations can cause flakiness. The codebase has a global fix:

```typescript
// In DefaultApp.jsx - animations are skipped in test env
skipReactSpringAnimationsInTests() {
  if (config.get("env") !== "test") return;
  Globals.assign({ skipAnimation: true });
}
```

If testing a component with animations not covered by this, ensure animations complete:

```ruby
# Wait for drawer/modal animation
find("[data-test-id='modal-content']", wait: MAX_WAIT)
```

#### Pattern 4.3: assert_changes Placement with UI Actions

**Source**: PR #46625

```ruby
# ❌ FLAKY - assert_changes completes before state update propagates
within "[data-test-id='account-reopen-review']" do
  click_input_label "acknowledge"
  assert_checkbox_checked("acknowledge")

  assert_changes -> { account.reload.state } do
    click_on "Reopen my account"
  end.from("deactivating").to("active")
end

within "[data-test-id='account-reopen-complete']" do
  assert_text "Your account has been reopened!"
end

# ✅ STABLE - Wait for UI confirmation inside assert_changes
within "[data-test-id='account-reopen-review']" do
  click_input_label "acknowledge"
  assert_checkbox_checked("acknowledge")
end

assert_changes -> { account.reload.state } do
  within "[data-test-id='account-reopen-review']" do
    click_on "Reopen my account"
  end

  within "[data-test-id='account-reopen-complete']" do
    assert_text "Your account has been reopened!"
  end
end.from("deactivating").to("active")
```

#### Pattern 4.4: retry_assertion for Legitimate Timing

**Source**: PR #52769

Use sparingly for legitimately async operations:

```ruby
# ✅ APPROPRIATE - Page redirect may take variable time
retry_assertion(limit: 2, delay: 1) do
  assert_path "sponsor/tasks/#{plan_task.id}/company-verification/sign"
  assert_text "Review and sign our updated service agreement"
end
```

**Note**: `retry_assertion` is a last resort. Prefer proper waits first.

#### Pattern 4.5: Wait for Navigation After Click

**Source**: PR #52320

Always wait for navigation to complete before proceeding:

```ruby
# ❌ FLAKY - May click before page loads or proceed before navigation completes
click_on "Apply for a loan"
click_on "I agree to the terms"

# ✅ STABLE - Wait for page to load after navigation
click_on "Apply for a loan"
assert_path "/participant/loans/application/terms-and-conditions/accept"
assert_text "Terms & Conditions"
click_on "I agree to the terms"
```

#### Pattern 4.6: Wait for Page Before Reading Cookies

**Source**: PR #54763

```ruby
# ❌ FLAKY - Cookie may not be set yet
visit "/partner-referrals?token=#{partner_ref.token}"
cookie = read_referral_cookie_value

# ✅ STABLE - Wait for navigation, then read cookie
visit "/partner-referrals?token=#{partner_ref.token}"
assert_path "/401k", "File not found"
cookie = read_referral_cookie_value
```

#### Pattern 4.7: Wait for Async UI Updates After Form Actions

**Source**: PR #43038

After selecting from a dropdown or form action, wait for UI to update:

```ruby
# ❌ FLAKY - Proceeding before async update completes
select prospect.minimum_start_date.strftime("%B %Y"), from: "__start_date"
click_on "Submit"

# ✅ STABLE - Wait for dependent UI to update
select prospect.minimum_start_date.strftime("%B %Y"), from: "__start_date"
assert_text "Onboarding tasks due"  # Wait for async update
click_on "Submit"
```

#### Pattern 4.8: Verify Dropdown Values Committed

**Source**: PR #54919

After selecting dropdown values, verify they're committed before proceeding:

```ruby
# ❌ FLAKY - Form may not have committed the value
select_value value.first, from: field
# Continue immediately...

# ✅ STABLE - Verify value committed
select_value value.first, from: field
assert_field_value field, value.last  # Wait for value to be committed
```

#### Pattern 4.9: Use Deterministic Conditionals, Not has_text?

**Source**: PR #54454

```ruby
# ❌ FLAKY - has_text? with wait may give false results
if page.has_text?("Forgot password?", wait: 2)
  login_with_email_and_password(email: plan_sponsor.email)
end

# ✅ STABLE - Check actual state/data
if plan.tenant_identifier == ::GlTenant::ACC_IDENTIFIER
  assert_text "Forgot password?"
  login_with_email_and_password(email: plan_sponsor.email)
end
```

#### Pattern 4.10: Wait for Confirmation Inside assert_changes

**Source**: PR #55055

```ruby
# ❌ FLAKY - assert_changes may complete before async update
assert_changes -> { payroll_run.reload.amount_dc_cents } do
  within_modal do
    fill_in field, with: "200"
    click_on "Submit"
  end
end

# ✅ STABLE - Wait for UI confirmation inside assert_changes
assert_changes -> { payroll_run.reload.amount_dc_cents } do
  within_modal do
    fill_in field, with: "200"
    click_on "Submit"
    assert_text "$200.00 Pre-Tax"  # Wait for confirmation
  end
end
```

#### Pattern 4.11: Dismiss Notifications Before Continuing

**Source**: PR #41783

Toast notifications may block subsequent interactions:

```ruby
# ❌ FLAKY - Notification may overlay the button
click_on "Delete"
assert_changes -> { signing_group.count }.by(-1)
button = find_button("Create signing link")  # May be blocked by notification

# ✅ STABLE - Dismiss notification first
click_on "Delete"
assert_changes -> { signing_group.count }.by(-1)
find_and_dismiss_notification!("Signing link has been deleted")
button = find_button("Create signing link")
```

#### Pattern 4.12: Use Specific CSS Selectors

**Source**: PR #45614

```ruby
# ❌ FLAKY - Generic selector may match multiple elements
within "main" do
  assert_text "Start a transfer"
end

# ✅ STABLE - Use specific selector for the component
within ".ira-account-dashboard" do
  assert_text "Start a transfer"
end
```

#### Pattern 4.13: Wait for Conditionally Rendered Fields

**Source**: PR #54913

```ruby
# ❌ FLAKY - Field may not be rendered yet
dropdown_fields.each do |field|
  select_value value, from: field
end

# ✅ STABLE - Wait for conditional field to appear
dropdown_fields.each do |field|
  if field == :countryOfCitizenship
    assert_text "Country of citizenship"  # Wait for field to render
  end
  select_value value, from: field
end
```

#### Pattern 4.14: Avoid within Blocks When Elements Re-render

**Source**: PR #56929

When an action causes a React component to re-render, the `within` block's element reference becomes stale. Use full selectors instead:

```ruby
# ❌ FLAKY - within block holds stale reference after re-render
assert_changes -> { proposal.reload.state } do
  within_resource_row proposal.id do
    page.find("[data-test-id='reverseArrowRight']").click
  end
  within_resource_row proposal.id do
    # Row has re-rendered, this block's parent element is stale!
    assert_selector("[data-test-id='thumbsDown']")
  end
end.from("rejected").to("pending")

# ✅ STABLE - Use full selector that Capybara can re-query
assert_changes -> { proposal.reload.state } do
  within_resource_row proposal.id do
    page.find("[data-test-id='reverseArrowRight']").click
  end
  # Use full selector - Capybara will re-query the DOM
  assert_selector("[data-resource-id='#{proposal.id}'] [data-test-id='thumbsDown']")
end.from("rejected").to("pending")
```

Key indicators this pattern applies:

- `Selenium::WebDriver::Error::StaleElementReferenceError` after clicking a button
- Action triggers Redux state update that causes React re-render
- Test uses `within` block after an action that modifies the element

#### Pattern 4.15: Wait for Next Page INSTEAD OF Asserting Previous Page Gone

**Source**: PR #PROJ-12797

After `click_submit`, wait for the next page to appear INSTEAD OF asserting the previous page content is gone:

```ruby
# ❌ FLAKY - refute_text may run before navigation completes
def complete_portfolio_assessment_review!
  assert_text "Review your responses"
  click_submit "Save and continue"
  refute_text "Here's a glance at how your responses"  # Race condition!
end

# ✅ STABLE - Wait for next page to appear instead
def complete_portfolio_assessment_review!
  assert_text "Review your responses"
  click_submit "Save and continue"
  # Wait for next page to appear instead of asserting previous page is gone
  assert_text "Your portfolio recommendation"
end
```

**Why this works**: `refute_text` checks that text is NOT present, but if the page hasn't navigated yet, the old content is still there and the assertion passes spuriously. By waiting for the _next_ page's content to appear, Capybara's built-in waiting ensures the navigation has completed.

**Key insight**: Replace negative assertions (`refute_text`) after navigation with positive assertions (`assert_text`) for content on the destination page.

---

### Category 5: Factory and Random Data Patterns

#### Pattern 5.1: Validate Random Data Against Business Rules

**Source**: PR #55508

```ruby
# ❌ FLAKY - Random EIN may match restricted prefix
factory :sponsor do
  ein { ::Faker::Company.unique.ein.delete("-") }
end

# ✅ STABLE - Loop until valid value generated
factory :sponsor do
  ein do
    out = nil
    while out.nil?
      out = ::Faker::Company.unique.ein.delete("-")
      # EFAST restricts certain EIN prefixes
      out = nil if ::System::EFAST_RESTRICTED_EIN_PREFIXES.include?(out.first(2))
    end
    out
  end
end
```

---

### Category 6: Process Order Patterns

#### Pattern 6.1: Create Data Before Time Travel

**Source**: PR #55949

```ruby
# ❌ FLAKY - Price created after time travel may have wrong date
time_travel original_date.noon
pd = conduct_payroll_buy(...)
time_travel (repurchase_date + 1.day).noon
create_all_fund_prices(price: repurchase_price, date: repurchase_date)

# ✅ STABLE - Create price data at the appropriate time
time_travel original_date.noon
create_all_fund_prices(price: original_price, date: original_date)
pd = conduct_payroll_buy(...)
create_all_fund_prices(price: repurchase_price, date: repurchase_date)
time_travel (repurchase_date + 1.day).noon
```

---

### Category 7: Fixture Selection Patterns

#### Pattern 7.1: Use Fixtures That Match Test Requirements

**Source**: PR #53094

Choose fixtures that provide the exact state your test needs:

```ruby
# ❌ FLAKY - Generic fixture may not have required attributes
fixtury("401k/ready/sponsor")

def test_plan_match_details
  # Test fails because plan doesn't have safe harbor config
end

# ✅ STABLE - Fixture with specific required state
fixtury("401k/safe_harbor/sponsor")

def test_plan_match_details
  # Plan has safe harbor, test passes
end
```

#### Pattern 7.2: Pass Explicit Parameters to Factories

**Source**: PR #56468

When factories create related records, pass explicit IDs:

```ruby
# ❌ FLAKY - Factory may create unrelated sponsor
def test_it_emits_event_with_plan_ids
  journal_version = create_journal_version!
  # Event may have unexpected plan_ids
end

# ✅ STABLE - Pass explicit sponsor_id
fixtury("401k/started/plan")
let(:sponsor) { plan.sponsor }

def test_it_emits_event_with_plan_ids
  journal_version = create_journal_version!(sponsor_id: sponsor.id)
  expect_gl_event(attributes: { plan_ids: [plan.id] }) do
    # ...
  end
end
```

---

### Category 8: Helper Method Patterns

#### Pattern 8.1: Pass Explicit Context to Helpers

**Source**: PR #49020

Pass explicit parameters instead of relying on implicit state:

```ruby
# ❌ FLAKY - Helper relies on implicit `user` that may be wrong
def step_through_suitability
  complete_recommended_portfolio! user, finish: false
end

# ✅ STABLE - Pass user explicitly
def step_through_suitability(user)
  complete_recommended_portfolio! user, finish: false
end

# Usage:
step_through_suitability(sep_onboarded_user)
```

---

### Category 9: VCR and HTTP Stubbing Patterns

#### Pattern 9.1: Allow Playback Repeats for Retry Logic

**Source**: PR #37316

When code may retry HTTP requests, allow cassette playback repeats:

```ruby
# ❌ FLAKY - Second request fails because cassette is exhausted
stub_http "cassette_name", vcr_options.merge({ allow_unused_http_interactions: false }) do
  # Code that may retry HTTP requests
end

# ✅ STABLE - Allow replaying HTTP interactions
stub_http "cassette_name", vcr_options.merge({
  allow_unused_http_interactions: false,
  allow_playback_repeats: true
}) do
  # Code that may retry HTTP requests
end
```

---

### Category 10: Test Assertion Patterns

#### Pattern 10.1: Use Dynamic Values Instead of Hardcoded

**Source**: PR #51030

Assert using values from the objects you created:

```ruby
# ❌ FLAKY - Hardcoded value may not match actual calculation
loan_origination = create_originated_loan_application!(plan, user).loan_origination
assert_text "$11.41"  # Assumes specific calculation result

# ✅ STABLE - Use value from the created object
loan_origination = create_originated_loan_application!(plan, user).loan_origination
assert_text ::Cash.from_cents(loan_origination.period_payment_amount_cents).to_s
```

#### Pattern 10.2: Use Exact Values in Event Expectations

**Source**: PR #56468

```ruby
# ❌ FLAKY - kind_of doesn't verify actual values
expect_gl_event(attributes: { plan_ids: kind_of(Array) }) do
  # May pass even with wrong plan_ids
end

# ✅ STABLE - Assert exact expected values
expect_gl_event(attributes: { plan_ids: [plan.id] }) do
  # Verifies exact plan_ids
end
```

#### Pattern 10.3: Remove Timing-Based Assertions

**Source**: PR #44892, PR #44267

```ruby
# ❌ FLAKY - after_at timing can vary based on test execution speed
assert_enqueued inferred_class do
  submit_op!(sponsor_ids: [sponsor.id, sponsor2.id])
end.with(sponsor_id: sponsor.id)
end.with(sponsor_id: sponsor2.id).after_at(::MarketTime.now + 1.minute)

# ✅ STABLE - Remove timing assertion, just verify it's enqueued
assert_enqueued inferred_class do
  submit_op!(sponsor_ids: [sponsor.id, sponsor2.id])
end.with(sponsor_id: sponsor.id)
end.with(sponsor_id: sponsor2.id)
```

---

## Legacy Patterns (Still Valid)

### Pattern: Missing Wait on Assertions

```ruby
# ❌ FLAKY - No wait, fails if page hasn't updated
assert_text "Success"
click_on "Next"

# ✅ STABLE - Waits for text to appear
assert_text "Success", wait: MAX_WAIT
click_on "Next"
```

### Pattern: Use MAX_WAIT Constant

```ruby
class MyFeatureTest < FeatureTest
  MAX_WAIT = 60  # Define at class level

  test "something" do
    assert_text "Content", wait: MAX_WAIT
  end
end
```

### Pattern: Synchronous Sidekiq for Background Jobs

```ruby
::Sidekiq::Testing.inline! do
  click_on "Submit"
  assert_text "Processed", wait: MAX_WAIT
end
```

---

## Anti-Patterns to Remove

If you find these workarounds, replace them with proper fixes:

| Anti-Pattern                      | Proper Fix                                     |
| --------------------------------- | ---------------------------------------------- |
| `sleep N`                         | Use `wait:` parameter or `assert_text`         |
| Logout/login cycle                | Find the actual timing issue                   |
| Manual retry loops                | Use Capybara's built-in waiting                |
| `retry_assertion` as first choice | Use proper waits, isolation, or ordering fixes |

---

## Step 5: Verify the Fix

1. Run the specific test multiple times:

   ```bash
   for i in {1..10}; do bundle exec m test/path/to/test.rb:LINE; done
   ```

2. If it passes consistently (10/10), the fix is likely good.

3. If it still fails intermittently, revisit the analysis checklist.

### Step 6: Lint the Applied Fixes

**Important**: After verifying the test passes, always run rubocop on the modified test file(s) to ensure the fixes follow code style guidelines:

```bash
bundle exec rubocop test/path/to/test.rb
```

If there are offenses, auto-fix them:

```bash
bundle exec rubocop -A test/path/to/test.rb
```

Common linting issues after flaky test fixes:

- **Indentation**: When restructuring `within` blocks or `assert_changes` blocks
- **Line length**: When adding comments explaining the fix
- **Trailing whitespace**: When adding new lines of code

Always commit the linting fixes along with (or immediately after) the test fixes.

### Step 7: Document New Patterns

**Important**: If you discovered a new flakiness pattern during debugging that is not already documented in this skill, you MUST add it to this file.

#### When to Add a New Pattern

- The root cause was not covered by any existing pattern in the catalog
- The fix required a novel approach or technique
- The issue could reasonably occur in other tests

#### How to Add a New Pattern

1. **Categorize**: Determine which category the pattern belongs to (1-10), or create a new category if needed
2. **Number**: Assign the next sequential pattern number (e.g., if Category 4 has patterns 4.1-4.14, the new one is 4.15)
3. **Document**: Add to the Pattern Catalog section with:
   - Pattern name and number as a heading
   - **Source**: The PR number where this fix was applied
   - Code example showing the flaky (❌) and stable (✅) versions
   - Brief explanation of why the fix works
4. **Update Checklist**: Add an indicator row to the appropriate checklist table in Step 3
5. **Update Overview**: If adding a new pattern, increment the count in the Overview section

#### Example Addition

```markdown
#### Pattern 4.15: [Descriptive Name]

**Source**: PR #XXXXX

[Brief explanation of the issue]

\`\`\`ruby

# ❌ FLAKY - [Why this fails]

[flaky code example]

# ✅ STABLE - [Why this works]

[fixed code example]
\`\`\`
```

This ensures the skill continuously improves as new flakiness patterns are discovered.

---

## Key Files Reference

- **Test base class**: `test/feature_helper.rb`
- **Capybara setup**: `test/support/support/capy.rb`
- **Time travel helpers**: `test/support/support/time_travel_helpers.rb`
- **Select helpers**: `test/support/support/select_test_helper.rb`
- **Feature helpers**: `test/support/support/feature_helpers.rb`

---

## Strict Rules

1. **Never add `sleep` calls** - Always use Capybara's waiting mechanisms
2. **Never suggest logout/login workarounds** - Find the root cause
3. **Always use `MAX_WAIT` constant** - Don't hardcode wait times
4. **Verify fixes with multiple runs** - Single pass isn't enough
5. **Explain the root cause** - Don't just fix, educate
6. **Prefer isolation over retry** - Clean state beats retry loops
7. **Match the pattern to the symptom** - Use the analysis checklist
