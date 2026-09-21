import type {Meeting} from "@/domain/meetings/meeting.entity";
import type {CreateMeetingInput,MeetingRepository,UpdateMeetingInput} from "@/application/meetings/ports/meeting.repository";
import { supabaseServerClient } from "./supabase.client";

type SupabaseMeetingRow = {
  id: number;
  lead_id: number;
  provider: "zcal";
  provider_event_id: string;
  status: Meeting["status"];
  scheduled_at: string;
  timezone: string;
  meeting_url: string | null;
  created_at: string;
  updated_at: string;
};

function mapRowToMeeting(row:SupabaseMeetingRow):Meeting{
    return {
        id: row.id,
        leadId: row.lead_id,
        provider: row.provider,
        providerEventId: row.provider_event_id,
        status: row.status,
        scheduledAt: row.scheduled_at,
        timezone: row.timezone,
        ...(row.meeting_url ? { meetingUrl: row.meeting_url } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at  
    }
};

export class SupabaseMeetingRepository implements MeetingRepository {
    async findByProviderEventId(provider: "zcal", providerEventId: string): Promise<Meeting | null> {
        const {data,error} = await supabaseServerClient
        .from("meetings")
        .select("id, lead_id, provider, provider_event_id, status, scheduled_at, timezone, meeting_url, created_at, updated_at")
        .eq("provider", provider)
        .eq("provider_event_id", providerEventId)
        .maybeSingle();

        if (error) {
            throw new Error(`Error fetching meeting: ${error.message}`);
        }
        return data ? mapRowToMeeting(data as SupabaseMeetingRow) : null;
    }
    async create(input: CreateMeetingInput): Promise<Meeting> {
        const {data,error} = await supabaseServerClient
        .from("meetings")
        .insert({
           lead_id: input.leadId,
            provider: input.provider,
            provider_event_id: input.providerEventId,
            status: input.status,
            scheduled_at: input.scheduledAt,
            timezone: input.timezone,
            meeting_url: input.meetingUrl ?? null, 
        }).select("id, lead_id, provider, provider_event_id, status, scheduled_at, timezone, meeting_url, created_at, updated_at")
        .single();

        if (error) {
            throw new Error(`Error creating meeting: ${error.message}`);
        }

        return mapRowToMeeting(data as SupabaseMeetingRow);
    }

    async updateByProviderEventId(provider: "zcal", providerEventId: string, input: UpdateMeetingInput): Promise<Meeting> {
        const {data,error} = await supabaseServerClient
        .from("meetings")
        .update({
            ...(input.status !== undefined && { status: input.status }),
            ...(input.scheduledAt !== undefined && {
            scheduled_at: input.scheduledAt,
            }),
            ...(input.timezone !== undefined && {
          timezone: input.timezone,
            }),
        ...(input.meetingUrl !== undefined && {
          meeting_url: input.meetingUrl,
        }),
        })
        .eq("provider", provider)
        .eq("provider_event_id", providerEventId)
        .select("id, lead_id, provider, provider_event_id, status, scheduled_at, timezone, meeting_url, created_at, updated_at")
        .single();

        if (error) {
            throw new Error(`Error updating meeting: ${error.message}`);
        }
        return mapRowToMeeting(data as SupabaseMeetingRow);
    }

}