import type {
  ActivityCode,
  AdviceIntentCode,
  LeadSubmission,
} from '@/domain/leads/lead.types';
import type {ValidatedLeadInput} from './create-lead.schema';

const activityCodeByLabel: Record<ValidatedLeadInput['activity'], ActivityCode> = {
    'Exportación de servicios profesionales': 'PROFESSIONAL_SERVICES_EXPORT',
    'E-commerce': 'ECOMMERCE',
    'Trader / compra-venta de productos': 'PRODUCT_TRADING',
    'Invertir en Bolsa de Valores': 'STOCK_INVESTING',
    'Trader de Stocks': 'STOCK_TRADING',
    'Proteger mi patrimonio': 'ASSET_PROTECTION',
    'Negocios en bienes raíces': 'REAL_ESTATE',
    'Fintech': 'FINTECH',
};

const adviceIntentCodeByLabel: Record<ValidatedLeadInput['advice'], AdviceIntentCode> = {
    'Sí, quiero revisar mi caso con un experto': 'EXPERT_REVIEW',
    'Primero quiero más información': 'MORE_INFORMATION',
    'Me interesa, pero aún no estoy listo': 'NOT_READY',
};

export function mapCreateLeadInputToSubmission(input: ValidatedLeadInput) : LeadSubmission {
    return {
        submissionId: input.submissionId,
        name: input.name,
        email: input.email,
        countryCode: input.countryCode,
        phone: input.phone,
        activity: activityCodeByLabel[input.activity],
        adviceIntent: adviceIntentCodeByLabel[input.advice],
        question: input.question,
        source: input.source,
    };
};