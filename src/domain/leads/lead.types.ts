export const activityCodes = [
  'PROFESSIONAL_SERVICES_EXPORT',
  'ECOMMERCE',
  'PRODUCT_TRADING',
  'STOCK_INVESTING',
  'STOCK_TRADING',
  'ASSET_PROTECTION',
  'REAL_ESTATE',
  'FINTECH',
] as const;

export type ActivityCode = (typeof activityCodes)[number];

export const adviceIntentCodes = [
  'EXPERT_REVIEW',
  'MORE_INFORMATION',
  'NOT_READY',
] as const;

export type AdviceIntentCode = (typeof adviceIntentCodes)[number];
export type LeadSource = 'landing';

export type LeadSubmission = {
  submissionId: string;
  name: string;
  email: string;
  countryCode: string;
  phone: string;
  activity: ActivityCode;
  adviceIntent: AdviceIntentCode;
  question?: string;
  source: LeadSource;
};