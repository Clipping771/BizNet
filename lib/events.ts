import { createEventRecord } from "./repo/events";

export interface LogEventOptions {
  name: string;
  userId?: string | null;
  businessId?: string | null;
  props?: Record<string, any>;
}

export async function logEvent(options: LogEventOptions): Promise<void> {
  try {
    await createEventRecord(options);
  } catch (err) {
    console.error("Failed to write event:", err);
  }
}
