import axios from 'axios';

const baseUrl = import.meta.env.ODOO_BASE_URL?.replace(/\/$/, '');
const database = import.meta.env.ODOO_DATABASE;
const apiKey = import.meta.env.ODOO_API_KEY;
const timeout = Number(import.meta.env.ODOO_API_TIMEOUT_MS ?? 5000);

if (!baseUrl || !database || !apiKey) {
  throw new Error(
    'ODOO_BASE_URL, ODOO_DATABASE and ODOO_API_KEY are required'
  );
}

export const odooClient = axios.create({
  baseURL: `${baseUrl}/json/2`,
  timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 5000,
  headers: {
    Authorization: `bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Odoo-Database': database,
    'User-Agent': 'SCI-LANDING-MKT/1.0.0',
  },
});