import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  FEATURES,
  isFeatureEnabled,
  isFeatureEnabledForUser,
  setFeatureFlagSnapshot,
} from "./features.ts";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  setFeatureFlagSnapshot(null, null);
});

describe("entity feature flags", () => {
  it("keeps the master flag off in this build", () => {
    assert.equal(FEATURES.entityFlag, false);
    assert.equal(isFeatureEnabled("entityFlag"), false);
  });

  it("keeps sub-flags off when the master is off", () => {
    assert.equal(isFeatureEnabled("entityMarketing"), false);
    assert.equal(isFeatureEnabled("entityCalendarSharing"), false);
    assert.equal(isFeatureEnabled("entityWorkspace"), false);
  });

  it("does not treat a beta tester as a public launch", () => {
    assert.equal(isFeatureEnabled("entityFlag"), false);
  });

  it("keeps the calendar ⋯ menu off in this build", () => {
    assert.equal(FEATURES.calendarThreeDotFlag, false);
    assert.equal(isFeatureEnabled("calendarThreeDotFlag"), false);
    assert.equal(
      isFeatureEnabledForUser("calendarThreeDotFlag", { isBetaTester: true }),
      false,
    );
  });

  it("keeps calendar tabs off in this build", () => {
    assert.equal(FEATURES.calendarTabsFlag, false);
    assert.equal(isFeatureEnabled("calendarTabsFlag"), false);
    assert.equal(
      isFeatureEnabledForUser("calendarTabsFlag", { isBetaTester: true }),
      false,
    );
  });

  it("grants calendar tabs only from an accepted row", () => {
    assert.equal(isFeatureEnabled("calendarTabsFlag", USER_A), false);

    // No accepted row is loaded when the row is missing or accepted_at is null.
    setFeatureFlagSnapshot(USER_A, new Set());
    assert.equal(isFeatureEnabled("calendarTabsFlag", USER_A), false);

    setFeatureFlagSnapshot(USER_A, null);
    assert.equal(isFeatureEnabled("calendarTabsFlag", USER_A), false);

    setFeatureFlagSnapshot(USER_A, new Set(["calendarTabsFlag"]));
    assert.equal(isFeatureEnabled("calendarTabsFlag", USER_A), true);
    assert.equal(isFeatureEnabled("calendarTabsFlag", USER_B), false);
    assert.equal(
      isFeatureEnabledForUser("calendarTabsFlag", { isBetaTester: true }),
      false,
    );
  });

  it("opens entity surfaces for internal testers only", () => {
    assert.equal(
      isFeatureEnabledForUser("entityCalendarSharing", { isBetaTester: true }),
      true,
    );
    assert.equal(
      isFeatureEnabledForUser("entityCalendarSharing", { isBetaTester: false }),
      false,
    );
    assert.equal(
      isFeatureEnabledForUser("projectsApp", { isBetaTester: true }),
      false,
    );
  });
});
