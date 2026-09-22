import { z } from "astro/zod";

const zcalCustomQuestionAnswerSchema = z.object({
  question: z.string().min(1),
  answer: z.union([z.string(), z.array(z.string())]),
});

const zcalAttendeeSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  timezone: z.string().optional(),
  phoneNumber: z.string().optional(),
  type: z.enum(["invitee", "guest"]),
  customQuestionAnswers: z
    .array(zcalCustomQuestionAnswerSchema)
    .optional(),
});

const zcalOnlineMeetingSchema = z.object({
  url: z.string().url(),
  id: z.string().optional(),
  passcode: z.string().optional(),
});

const zcalLocationSchema = z.object({
  locationType: z.string().min(1),
  locationText: z.string().optional(),
  onlineMeeting: zcalOnlineMeetingSchema.optional(),
});

const zcalHostSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
});

const zcalInviteSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  inviteType: z.string().optional(),
  description: z.string().optional(),
});

export const zcalWebhookSchema = z.object({
  type: z.enum([
    "event.created",
    "event.rescheduled",
    "event.cancelled",
  ]),
  created_at: z.string().datetime(),
  data: z.object({
    id: z.string().trim().min(1),
    startDate: z.string().datetime(),
    duration: z.number().positive(),
    cancelled: z.boolean().optional(),
    eventName: z.string().min(1),
    invite: zcalInviteSchema.optional(),
    location: zcalLocationSchema.optional(),
    hosts: z.array(zcalHostSchema),
    attendees: z.array(zcalAttendeeSchema).min(1),
    team: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
      })
      .optional(),
  }),
});
