import { describe, expect, it } from "vitest";
import { GroupMembershipRole } from "@prisma/client";
import { isLeaderRole } from "../services/group-space-service";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

describe("isLeaderRole", () => {
  it("treats LEADER and CO_LEADER as leaders", () => {
    expect(isLeaderRole(GroupMembershipRole.LEADER)).toBe(true);
    expect(isLeaderRole(GroupMembershipRole.CO_LEADER)).toBe(true);
  });

  it("does not treat MEMBER as a leader", () => {
    expect(isLeaderRole(GroupMembershipRole.MEMBER)).toBe(false);
  });
});

describe("tenant guard registration", () => {
  it("registers every group-space model", () => {
    for (const model of ["GroupPost", "GroupPostPrayer", "GroupEvent", "GroupEventRsvp", "GroupPoll", "GroupPollVote"]) {
      expect(TENANT_SCOPED_MODELS.has(model), model).toBe(true);
    }
  });
});
