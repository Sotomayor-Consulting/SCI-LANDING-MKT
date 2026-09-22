import axios from "axios";
import type {APIRoute} from "astro";

import {odooClient} from "../../infrastructure/odoo/odoo.client";

type OdooLeadBlacklist = {
    id: number;
    name: string;
    email: string;
    phone: string;
};

export const prerender = false;

export const GET: APIRoute = async ({url}) => {
    const email = url.searchParams.get("email")?.trim().toLowerCase();

    if (!email) {
        return Response.json(
      {
        success: false,
        code: 'EMAIL_REQUIRED',
        message: 'The email query parameter is required.',
      },
      { status: 400 }
    );
    }

    try {
        const response = await odooClient.post<OdooLeadBlacklist[]>(
            '/crm.lead/search_read',
            {
                domain: ["&", ['stage_id', 'in', [17]], ['email_from', '=', email]],
                fields: ['id', 'name', 'email_from', 'phone'],
                limit: 1,
            }
        )

        const lead = response.data[0] ?? null;

        return Response.json({
            success: true,
            found: lead !== null,
            lead,
        });

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Odoo lead blacklist lookup failed', {
                status: error.response?.status,
                code: error.code,
                message: error.message,
            });

            return Response.json({
                success: false,
                code: 'ODOO_REQUEST_FAILED',
                message: 'The lead blacklist lookup could not be completed.',
            }, 
            {status: 502});
        }

        console.error('Unexpected error during Odoo lead blacklist lookup')

        return Response.json({
            success: false,
            code: 'INTERNAL_ERROR',
            message: 'The lead blacklist lookup could not be completed due to an unexpected error.',
        },
    {status: 500}
    );
    }
};