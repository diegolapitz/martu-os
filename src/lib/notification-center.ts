export type NotificationCenterStatus =
  | "pending"
  | "delivered"
  | "read"
  | "acted"
  | "dismissed"
  | "failed";

type NotificationWithStatus = {
  status?: NotificationCenterStatus;
};

export function selectNotificationCenterItems<T extends NotificationWithStatus>(
  items: T[],
): T[] {
  return items.filter(
    (item) => item.status === "delivered" || item.status === "read",
  );
}

export function countUnreadNotifications(
  items: NotificationWithStatus[],
): number {
  return items.filter((item) => item.status === "delivered").length;
}
