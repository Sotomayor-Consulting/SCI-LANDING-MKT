export const meetingStatuses = [
  "scheduled",
  "cancelled",
  "completed",
  "no_show",
] as const;

export type MeetingStatus = (typeof meetingStatuses)[number];

export type Meeting = {
    id: number;
    leadId: number;
    provider: "zcal";
    providerEventId: string;
    status: MeetingStatus;
    scheduledAt: string;
    timezone: string;
    meetingUrl?: string;
    createdAt: string;
    updatedAt: string;
}