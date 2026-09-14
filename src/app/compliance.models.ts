export type ApplicationStatus = 'NOT_APPROVED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ComplianceDocument {
  id: string;
  formKey: string;
  /** Nombre que el cliente asigna al archivo (visible en la vista interna). */
  name: string;
  fileName: string;
  mimeType: string;
  size: number;
  content: Blob;
}

export interface FollowUpDocs {
  operatingLicense: string;
  uboIdentities: string;
  orgChart: string;
  commercialEvidence: string;
  financialStatements: string;
  operatingFlow: string;
  commercialContracts: string;
  amlManual: string;
  regulatoryLicenses: string;
  submerchants: string;
  pepDeclaration: string;
}

export interface ComplianceApplication {
  id: string;
  clientName: string;
  constitutionRecord: string;
  nit: string;
  commercialRegistration: string;
  representativeDocument: string;
  representativePower: string;
  bankCertification: string;
  website: string;
  status: ApplicationStatus;
  createdAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  rejectedAt?: string;
  rejectionFields: string[];
  baseDocumentationReviewed: boolean;
  baseDocumentationReviewedAt?: string;
  followUpFormsEnabled: boolean;
  followUpFormsEnabledAt?: string;
  followUpFormsSubmittedAt?: string;
  documents: ComplianceDocument[];
  followUpDocs: FollowUpDocs;
}

export const EMPTY_FOLLOW_UP_DOCS = (): FollowUpDocs => ({
  operatingLicense: '', uboIdentities: '', orgChart: '', commercialEvidence: '',
  financialStatements: '', operatingFlow: '', commercialContracts: '', amlManual: '',
  regulatoryLicenses: '', submerchants: '', pepDeclaration: ''
});

export const EMPTY_APPLICATION = (): ComplianceApplication => ({
  id: crypto.randomUUID(), clientName: '', constitutionRecord: '', nit: '',
  commercialRegistration: '', representativeDocument: '', representativePower: '',
  bankCertification: '', website: '', status: 'NOT_APPROVED',
  createdAt: new Date().toISOString(), documents: [], followUpDocs: EMPTY_FOLLOW_UP_DOCS(),
  baseDocumentationReviewed: false, followUpFormsEnabled: false, rejectionFields: []
});
