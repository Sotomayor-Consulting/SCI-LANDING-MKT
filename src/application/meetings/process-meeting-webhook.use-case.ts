import type {LeadLookupRepository} from "@/application/leads/ports/lead-lookup.repository";
import type { LeadRepository } from "@/application/leads/ports/lead.repository";
import type { MeetingRepository } from "@/application/meetings/ports/meeting.repository";

import type {Meeting} from "@/domain/meetings/meeting.entity";
import type {ProcessMeetingWebhookInput} from "./process-meeting-webhook.input";

type ProcessMeetingWebhookDependencies = {
    leadLookupRepository : LeadLookupRepository;
    leadRepository: LeadRepository;
    meetingRepository: MeetingRepository;
}

export class ProcessMeetingWebhookUseCase {
    constructor(private readonly dependencies: ProcessMeetingWebhookDependencies,){}
    
    async execute(input: ProcessMeetingWebhookInput):Promise<Meeting>{
        const existingMeeting = await this.dependencies.meetingRepository.findByProviderEventId(input.provider,input.providerEventId);

        if (input.eventType === "created") {
            return this.handleCreated(input,existingMeeting);
        }

        if (!existingMeeting) {
            throw new Error(`Meeting with providerEventId ${input.providerEventId} not found.`);
        }

        if (input.eventType === 'rescheduled') {
            return this.dependencies.meetingRepository.updateByProviderEventId(input.provider,input.providerEventId, {
                 scheduledAt: input.scheduledAt,
                timezone: input.timezone,
                ...(input.meetingUrl !== undefined && {
                meetingUrl: input.meetingUrl,
                }),   
            })
        };

        return this.dependencies.meetingRepository.updateByProviderEventId(input.provider,input.providerEventId, {
            status: "cancelled",
        })
    }

    private async handleCreated(input:ProcessMeetingWebhookInput, existingMeeting: Meeting | null): Promise<Meeting>{
        if (existingMeeting) {
            await this.dependencies.leadRepository.updateStatusById(
                existingMeeting.leadId,
                "scheduled",
            );
            return existingMeeting;
        }

        const lead = await this.dependencies.leadLookupRepository.findByEmail(input.attendeeEmail);

        if (!lead) {
            throw new Error(`Lead with email ${input.attendeeEmail} not found.`);
        }

        const meeting = await this.dependencies.meetingRepository.create({
            leadId: lead.id,
            provider: input.provider,
            providerEventId: input.providerEventId,
            status: "scheduled",
            scheduledAt: input.scheduledAt,
            timezone: input.timezone,
            ...(input.meetingUrl !== undefined && {
            meetingUrl: input.meetingUrl,
            }),
        });

        await this.dependencies.leadRepository.updateStatusById(
            lead.id,
            "scheduled",
        );

        return meeting;
    }
}

export function createProcessMeetingWebhookUseCase(dependencies:ProcessMeetingWebhookDependencies):ProcessMeetingWebhookUseCase{
    return new ProcessMeetingWebhookUseCase(dependencies);
}