/** Status colours as plain data, so server and client components can both read them. */
export type Tone = "gray" | "green" | "amber" | "red" | "blue" | "violet";

export const REQUEST_STATUS_TONE: Record<string, Tone> = {
  OPEN: "green",
  AWARDED: "blue",
  CLOSED: "gray",
  EXPIRED: "gray",
  CANCELLED: "red",
};

export const ORDER_STATUS_TONE: Record<string, Tone> = {
  PENDING_CONFIRMATION: "amber",
  CONFIRMED: "blue",
  DISPATCHED: "violet",
  DELIVERED: "amber",
  COMPLETED: "green",
  CANCELLED: "red",
  DISPUTED: "red",
};
