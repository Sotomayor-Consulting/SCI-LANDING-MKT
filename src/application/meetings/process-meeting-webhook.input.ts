export type MeetingWebhookEventType =
  | "created"
  | "rescheduled"
  | "cancelled";

export type ProcessMeetingWebhookInput = {
  provider: "zcal";
  eventType: MeetingWebhookEventType;
  providerEventId: string;
  attendeeEmail: string;
  scheduledAt: string;
  timezone: string;
  meetingUrl?: string;
};
