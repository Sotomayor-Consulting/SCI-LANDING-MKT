import type {ValidatedLeadInput} from "./create-lead.schema";

export function isBotSubmission(input: Pick<ValidatedLeadInput, 'website'>) : boolean {
    return input.website.trim().length > 0;
}