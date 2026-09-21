
import type { APIRoute } from "astro";

import { createProcessMeetingWebhookUseCase } from "@/application/meetings/process-meeting-webhook.use-case";
import { SupabaseMeetingRepository } from "@/infrastructure/supabase/supabase-meeting.repository";
import { SupabaseLeadLookupRepository } from "@/infrastructure/supabase/supabase-lead-lookup.repository";
import { SupabaseLeadRepository } from "@/infrastructure/supabase/supabase-lead.repository";
import { mapZcalWebhookToMeetingInput } from "@/infrastructure/zcal/zcal-webhook.mapper";
import { zcalWebhookSchema } from "@/infrastructure/zcal/zcal-webhook.schema";

const leadLookupRepository = new SupabaseLeadLookupRepository();
const leadRepository = new SupabaseLeadRepository();
const meetingRepository = new SupabaseMeetingRepository();

const processMeetingWebhook = createProcessMeetingWebhookUseCase({
  leadLookupRepository,
  leadRepository,
  meetingRepository,
});

export const prerender = false;

export const POST:APIRoute = async ({request}) => {
    const contentType = request.headers.get("content-type")?.toLowerCase();

    if (!contentType?.includes("application/json")) {
        return Response.json({
        success: false,
        code: "UNSUPPORTED_MEDIA_TYPE",
      },
      { status: 415 },);
    }

    let body: unknown;

    try {
        body = await request.json();
    } catch (error) {
        return Response.json( {
        success: false,
        code: "INVALID_JSON",
      },
      { status: 400 },);
    }

    const parsed = zcalWebhookSchema.safeParse(body);

    if (!parsed.success) {
        return Response.json({
        success: false,
        code: "INVALID_ZCAL_WEBHOOK",
      },
      { status: 400 },);
    }

    try {
        const input = mapZcalWebhookToMeetingInput(parsed.data);
        const meeting = await processMeetingWebhook.execute(input);

        return Response.json({
      success: true,
      eventType: input.eventType,
      meetingId: meeting.id,
      providerEventId: meeting.providerEventId,
      status: meeting.status,
    });
    } catch (error) {
       console.error("Error processing Zcal webhook:", error);
        return Response.json(
      {
        success: false,
        code: "ZCAL_WEBHOOK_PROCESSING_FAILED",
      },
      { status: 500 },
    );
    }

}