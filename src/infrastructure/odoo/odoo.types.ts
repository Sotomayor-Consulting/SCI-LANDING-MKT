export type OdooPartnerRecord = {
  id: number;
  name: string;
  email: string | false;
  phone: string | false;
};

export type OdooLeadBlacklistRecord = {
  id: number;
  name: string;
  email_from: string | false;
  phone: string | false;
};