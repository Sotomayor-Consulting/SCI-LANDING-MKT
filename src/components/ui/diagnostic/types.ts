export interface DiagnosticOption {
  value: string;
  label: string;
}

export interface DiagnosticQuestion {
  id: string;
  title: string;
  description: string;
  options: DiagnosticOption[];
}

export interface DiagnosticPlan {
  name: string;
  price: string;
  description: string;
  featured?: boolean;
}

export interface DiagnosticReview {
  quote: string;
  country: string;
}

export interface DiagnosticProcessStep {
  title: string;
  description: string;
}
