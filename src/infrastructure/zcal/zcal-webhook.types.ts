export type ZcalWebhookEventType =
  | "event.created"
  | "event.rescheduled"
  | "event.cancelled";

export type ZcalCustomQuestionAnswer = {
  question: string;
  answer: string | string[];
};

export type ZcalAttendee = {
  name?: string;
  email: string;
  timezone?: string;
  phoneNumber?: string;
  type: "invitee" | "guest";
  customQuestionAnswers?: ZcalCustomQuestionAnswer[];
};

export type ZcalOnlineMeeting = {
  url: string;
  id?: string;
  passcode?: string;
};

export type ZcalLocation = {
  locationType: string;
  locationText?: string;
  onlineMeeting?: ZcalOnlineMeeting;
};

export type ZcalHost = {
  name?: string;
  email: string;
};

export type ZcalWebhookData = {
  id: string;
  startDate: string;
  duration: number;
  cancelled?: boolean;
  eventName: string;
  invite?: {
    id: string;
    name: string;
    inviteType?: string;
    description?: string;
  };
  location?: ZcalLocation;
  hosts: ZcalHost[];
  attendees: ZcalAttendee[];
  team?: {
    id: string;
    name: string;
  };
};

export type ZcalWebhookPayload = {
  type: ZcalWebhookEventType;
  created_at: string;
  data: ZcalWebhookData;
};