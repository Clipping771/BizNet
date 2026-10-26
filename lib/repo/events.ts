import { prisma } from "../prisma";
import { Event } from "@prisma/client";

export async function createEventRecord(data: {
  name: string;
  userId?: string | null;
  businessId?: string | null;
  props?: any;
}): Promise<Event> {
  return prisma.event.create({
    data: {
      name: data.name,
      userId: data.userId ?? null,
      businessId: data.businessId ?? null,
      props: data.props,
    },
  });
}
