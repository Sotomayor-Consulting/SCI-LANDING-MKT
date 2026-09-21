import { mapCreateLeadInputToSubmission } from "@/application/leads/create-lead.mapper";
import { createLeadSchema } from "@/application/leads/create-lead.schema";
import { isBotSubmission } from "@/application/leads/lead-antibot";
import { createProcessLeadUseCase } from "@/application/leads/process-lead.use-case";
import { OdooBlacklistRepository } from "@/infrastructure/odoo/odoo-blacklist.repository";
import { OdooContactRepository } from "@/infrastructure/odoo/odoo-contact.repository";
import { SupabaseLeadRepository } from "@/infrastructure/supabase/supabase-lead.repository";
import type { APIRoute } from "astro";


const contactRepository = new OdooContactRepository();
const blacklistRepository = new OdooBlacklistRepository();
const leadRepository = new SupabaseLeadRepository();

const processLead = createProcessLeadUseCase({
  contactRepository,
  blacklistRepository,
  leadRepository,
});

export const prerender = false;

export const POST:APIRoute = async ({request}) => {
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return Response.json({
        success: false,
        code: 'INVALID_JSON',
        message: 'El cuerpo de la solicitud no es un JSON válido.',
        },
      { status: 400 });
    }

    const parsed = createLeadSchema.safeParse(body);

    if (!parsed.success) {
        return Response.json({
        success: false,
        code: 'VALIDATION_ERROR',
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 });
    }

    const input = parsed.data;

    if (isBotSubmission(input)) {
      return Response.json({
    success: true,
    accepted: true,
    showCalendar: false,
  });
    }

    const lead = mapCreateLeadInputToSubmission(input);

    try {
        const decision = await processLead.execute({lead});

        switch(decision.status){
            case 'REJECTED':
                return Response.json({
            success: true,
            accepted: false,
            code: decision.reason,
            showCalendar: decision.showCalendar,
          },
          { status: 200 });
          case 'EXISTING_CONTACT':
            return Response.json(({
          success: true,
          accepted: true,
          code: decision.status,
          nextAction: decision.nextAction,
          showCalendar: decision.showCalendar,
        }))
            case 'QUALIFIED':
                return Response.json({
          success: true,
          accepted: true,
          code: decision.status,
          nextAction: decision.nextAction,
          segment: decision.segment,
          showCalendar: decision.showCalendar,
        });
            case 'NURTURE':
                return Response.json({
          success: true,
          accepted: true,
          code: decision.status,
          nextAction: decision.nextAction,
          segment: decision.segment,
          showCalendar: decision.showCalendar,
        })
        }
    } catch (error) {
        console.error('Error processing lead', error);
        return Response.json(
      {
        success: false,
        code: 'LEAD_PROCESSING_FAILED',
        message: 'No fue posible procesar el lead.',
      },
      { status: 502 }
    );
    }
}