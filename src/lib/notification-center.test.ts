import { describe, expect, it } from "vitest";

import {
  countUnreadNotifications,
  selectNotificationCenterItems,
  type NotificationCenterStatus,
} from "./notification-center";

describe("notification center lifecycle", () => {
  const items = (
    [
      "pending",
      "delivered",
      "read",
      "acted",
      "dismissed",
      "failed",
    ] as NotificationCenterStatus[]
  ).map((status) => ({ id: status, status }));

  it("surfaces only notifications that were delivered", () => {
    expect(selectNotificationCenterItems(items).map((item) => item.status)).toEqual([
      "delivered",
      "read",
    ]);
  });

  it("counts delivered notifications and not pending queue rows as unread", () => {
    expect(countUnreadNotifications(items)).toBe(1);
  });
});
