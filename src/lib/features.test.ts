import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FEATURES,
  isFeatureEnabled,
  isFeatureEnabledForUser,
} from "./features.ts";

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
