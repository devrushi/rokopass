import type { BarStatusKey } from "../components/analytics/BarList";

// Maps each booking status to a human label and the reserved status-color role it represents —
// used wherever a bookingsByStatus breakdown is rendered as a BarList.
const STATUS_DISPLAY: Record<string, { label: string; statusKey: BarStatusKey }> = {
  PENDING_APPROVAL: { label: "Pending approval", statusKey: "warning" },
  CONFIRMED: { label: "Confirmed", statusKey: "good" },
  ATTENDED: { label: "Attended", statusKey: "good" },
  CANCELLED: { label: "Cancelled", statusKey: "serious" },
  REJECTED: { label: "Rejected", statusKey: "critical" },
  NO_SHOW: { label: "No-show", statusKey: "critical" },
};

const STATUS_ORDER = ["PENDING_APPROVAL", "CONFIRMED", "ATTENDED", "CANCELLED", "REJECTED", "NO_SHOW"];

export function bookingsByStatusToBarItems(bookingsByStatus: Record<string, number>) {
  return STATUS_ORDER.filter((status) => bookingsByStatus[status] > 0).map((status) => ({
    label: STATUS_DISPLAY[status].label,
    value: bookingsByStatus[status],
    statusKey: STATUS_DISPLAY[status].statusKey,
  }));
}
