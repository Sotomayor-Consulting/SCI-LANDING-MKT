import type {
  ProcessMeetingWebhookInput,
  MeetingWebhookEventType,
} from "@/application/meetings/process-meeting-webhook.input";
import type {
  ZcalAttendee,
  ZcalWebhookEventType,
  ZcalWebhookPayload,
} from "./zcal-webhook.types";

function mapEventType(type: ZcalWebhookEventType): MeetingWebhookEventType {
  switch (type) {
    case "event.created":
      return "created";
    case "event.rescheduled":
      return "rescheduled";
    case "event.cancelled":
      return "cancelled";
  }
}

function getInvitee(attendees: ZcalAttendee[]): ZcalAttendee {
  const invitee = attendees.find((attendee) => attendee.type === "invitee");

  if (!invitee) {
    throw new Error("Zcal webhook does not contain a primary invitee");
  }

  return invitee;
}

export function mapZcalWebhookToMeetingInput(
  payload: ZcalWebhookPayload,
): ProcessMeetingWebhookInput {
  const invitee = getInvitee(payload.data.attendees);

  const attendeeEmail = invitee.email.trim().toLowerCase();

  if (!attendeeEmail) {
    throw new Error("Zcal webhook invitee email is required");
  }

  if (!payload.data.id.trim()) {
    throw new Error("Zcal webhook event id is required");
  }

  if (!payload.data.startDate.trim()) {
    throw new Error("Zcal webhook start date is required");
  }

  const meetingUrl = payload.data.location?.onlineMeeting?.url?.trim();

  return {
    provider: "zcal",
    eventType: mapEventType(payload.type),
    providerEventId: payload.data.id.trim(),
    attendeeEmail,
    scheduledAt: payload.data.startDate,
    timezone: invitee.timezone?.trim() || "UTC",
    ...(meetingUrl ? { meetingUrl } : {}),
  };
}
