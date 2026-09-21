import type {Meeting,MeetingStatus} from "@/domain/meetings/meeting.entity";

export type CreateMeetingInput = {
  leadId: number;
  provider: "zcal";
  providerEventId: string;
  status: MeetingStatus;
  scheduledAt: string;
  timezone: string;
  meetingUrl?: string;
};

export type UpdateMeetingInput = {
  status?: MeetingStatus;
  scheduledAt?: string;
  timezone?: string;
  meetingUrl?: string;
};

export  interface MeetingRepository{
    findByProviderEventId(provider: "zcal",providerEventId:string):Promise<Meeting| null>;
    create(input:CreateMeetingInput):Promise<Meeting>;
    updateByProviderEventId(provider: "zcal",providerEventId:string,input:UpdateMeetingInput):Promise<Meeting>;
}

