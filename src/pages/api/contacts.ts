import axios from 'axios';
import type { APIRoute } from 'astro';

import { odooClient } from '../../infrastructure/odoo/odoo.client';

type OdooContact = {
  id: number;
  name: string;
  email: string | false;
  phone: string | false;
};

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const email = url.searchParams.get('email')?.trim().toLowerCase();

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
    const response = await odooClient.post<OdooContact[]>(
      '/res.partner/search_read',
      {
        domain: [['email', '=', email]],
        fields: ['id', 'name', 'email', 'phone'],
        limit: 1,
      }
    );

    const contact = response.data[0] ?? null;

    return Response.json({
      success: true,
      found: contact !== null,
      contact,
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Odoo contact lookup failed', {
        status: error.response?.status,
        code: error.code,
      });

      return Response.json(
        {
          success: false,
          code: 'ODOO_REQUEST_FAILED',
          message: 'The contact lookup could not be completed.',
        },
        { status: 502 }
      );
    }

    console.error('Unexpected contact lookup error', error);

    return Response.json(
      {
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'The contact lookup could not be completed.',
      },
      { status: 500 }
    );
  }
};
