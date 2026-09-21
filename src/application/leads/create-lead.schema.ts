import { z } from 'astro/zod';

export const createLeadSchema = z.object({
    submissionId: z.uuid(),
    name: z
    .string()
    .trim()
    .min(2, 'Nombre debe tener al menos 2 caracteres')
    .max(120, 'Nombre no puede tener más de 120 caracteres'),

    email: z
    .email('El correo electrónico no es válido')
    .transform((value) => value.trim().toLowerCase()),

  countryCode: z.enum([
    '+593',
    '+57',
    '+52',
    '+51',
    '+1',
    '+34',
    '+54',
  ]),

  phone: z
    .string()
    .trim()
    .min(7, 'El teléfono debe tener al menos 7 caracteres')
    .max(15, 'El teléfono es demasiado largo')
    .regex(
      /^[0-9+\-().\s]+$/,
      'El teléfono contiene caracteres no permitidos'
    ),

  activity: z.enum([
    'Exportación de servicios profesionales',
    'E-commerce',
    'Trader / compra-venta de productos',
    'Invertir en Bolsa de Valores',
    'Trader de Stocks',
    'Proteger mi patrimonio',
    'Negocios en bienes raíces',
    'Fintech',
  ]),

  advice: z.enum([
    'Sí, quiero revisar mi caso con un experto',
    'Primero quiero más información',
    'Me interesa, pero aún no estoy listo',
  ]),

  question: z
    .string()
    .trim()
    .max(2000, 'La pregunta es demasiado larga'),

  source: z.literal('landing'),

  website: z
    .string()
    .trim()
    .max(200, 'El campo website es demasiado largo'),
});

export type CreateLeadInput = z.input<typeof createLeadSchema>;
export type ValidatedLeadInput = z.output<typeof createLeadSchema>;