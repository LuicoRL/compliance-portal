import { ApplicationStatus, ComplianceApplication, ComplianceDocument } from '../compliance.models';

export type MainUploadKey =
  | 'constitutionRecord' | 'nit' | 'commercialRegistration'
  | 'representativeDocument' | 'representativePower' | 'bankCertification';

export type IntermediateKey = 'operatingLicense' | 'uboIdentities' | 'orgChart' | 'commercialEvidence';

export type EnhancedKey =
  | 'financialStatements' | 'operatingFlow' | 'commercialContracts' | 'amlManual'
  | 'regulatoryLicenses' | 'submerchants' | 'pepDeclaration';

export interface MainUploadField {
  readonly key: MainUploadKey;
  readonly label: string;
  readonly placeholder?: string;
}

export interface IntermediateField {
  readonly key: IntermediateKey;
  readonly label: string;
  readonly hint?: string;
}

export interface EnhancedField {
  readonly key: EnhancedKey;
  readonly label: string;
  readonly required?: boolean;
  readonly hint?: string;
}

export interface DocumentGroup {
  formKey: string;
  documents: ComplianceDocument[];
}

export interface FollowUpLevel {
  key: string;
  label: string;
  groups: DocumentGroup[];
}

export interface RejectionCandidate {
  key: string;
  label: string;
}

export const MAIN_UPLOAD_FIELDS: readonly MainUploadField[] = [
  { key: 'constitutionRecord', label: 'Testimonio de constitución o CI' },
  { key: 'nit', label: 'NIT / TAX ID' },
  { key: 'commercialRegistration', label: 'Registro de Comercio' },
  { key: 'representativeDocument', label: 'Documento de identidad del Representante Legal' },
  { key: 'representativePower', label: 'Poder del Representante Legal' },
  { key: 'bankCertification', label: 'Certificación bancaria', placeholder: 'Ej. número de cuenta' }
];

export const INTERMEDIATE_FIELDS: readonly IntermediateField[] = [
  { key: 'operatingLicense', label: 'Licencia de Funcionamiento', hint: 'Si el rubro exige licencia de funcionamiento' },
  { key: 'uboIdentities', label: 'Documento de identidad de accionistas / UBOs', hint: 'Participación ≥10%' },
  { key: 'orgChart', label: 'Organigrama societario', hint: 'Estructura societaria' },
  { key: 'commercialEvidence', label: 'Evidencia comercial', hint: 'Página web' }
];

export const ENHANCED_FIELDS: readonly EnhancedField[] = [
  { key: 'financialStatements', label: 'Estados financieros' },
  { key: 'operatingFlow', label: 'Flujo operativo / modelo de negocio', required: true },
  { key: 'commercialContracts', label: 'Contratos comerciales relevantes' },
  { key: 'amlManual', label: 'Manual AML/CFT' },
  { key: 'regulatoryLicenses', label: 'Licencias regulatorias del rubro' },
  { key: 'submerchants', label: 'Información de subcomercios', hint: 'Si opera como agregador' },
  { key: 'pepDeclaration', label: 'Declaración de PEP', required: true, hint: 'Persona expuesta políticamente' }
];

export const FOLLOW_UP_LEVEL_LABELS: Readonly<Record<string, string>> = {
  intermediate: 'NIVEL INTERMEDIO · Cliente estándar / regional',
  enhanced: 'NIVEL REFORZADO · Alto riesgo (EDD)'
};

export const UPLOAD_FORMAT_NOTE = 'Solo se admiten archivos en formato PDF';
export const REQUIRED_LEGEND = '* (campo obligatorio)';

export const STATUS_LABELS: Readonly<Record<ApplicationStatus, string>> = {
  NOT_APPROVED: 'No aprobado',
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado'
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(MAIN_UPLOAD_FIELDS.map(field => [field.key, field.label] as const)),
  ...Object.fromEntries(INTERMEDIATE_FIELDS.map(field => [field.key, field.label] as const)),
  ...Object.fromEntries(ENHANCED_FIELDS.map(field => [field.key, field.label] as const)),
  base: 'Documentación de respaldo'
};

const DOCUMENT_ORDER: readonly string[] = [
  ...MAIN_UPLOAD_FIELDS.map(field => field.key),
  ...INTERMEDIATE_FIELDS.map(field => field.key),
  ...ENHANCED_FIELDS.map(field => field.key)
];

const INTERMEDIATE_KEYS: ReadonlySet<string> = new Set(INTERMEDIATE_FIELDS.map(field => field.key));
const ENHANCED_KEYS: ReadonlySet<string> = new Set(ENHANCED_FIELDS.map(field => field.key));
const FOLLOW_UP_KEYS: ReadonlySet<string> = new Set([...INTERMEDIATE_KEYS, ...ENHANCED_KEYS]);

export function getStatusLabel(status: ApplicationStatus): string {
  return STATUS_LABELS[status];
}

export function documentLabel(formKey: string): string {
  return FIELD_LABELS[formKey] ?? formKey;
}

/** Fields the internal reviewer can flag for correction, extended with follow-ups once they are enabled. */
export function rejectionCandidates(followUpFormsEnabled: boolean): RejectionCandidate[] {
  const candidates: RejectionCandidate[] = [
    ...MAIN_UPLOAD_FIELDS.map(field => ({ key: field.key, label: field.label })),
    { key: 'website', label: 'Página web / Redes sociales' }
  ];
  if (followUpFormsEnabled) {
    candidates.push(...INTERMEDIATE_FIELDS.map(field => ({ key: field.key, label: field.label })));
    candidates.push(...ENHANCED_FIELDS.map(field => ({ key: field.key, label: field.label })));
  }
  return candidates;
}

export function groupedDocuments(application: ComplianceApplication): DocumentGroup[] {
  const groups = DOCUMENT_ORDER
    .map(formKey => ({ formKey, documents: application.documents.filter(doc => doc.formKey === formKey) }))
    .filter(group => group.documents.length > 0);
  const known = new Set(DOCUMENT_ORDER);
  const leftoverKeys = [...new Set(
    application.documents.filter(doc => !known.has(doc.formKey)).map(doc => doc.formKey)
  )];
  for (const formKey of leftoverKeys) {
    groups.push({ formKey, documents: application.documents.filter(doc => doc.formKey === formKey) });
  }
  return groups;
}

export function baseDocGroups(application: ComplianceApplication): DocumentGroup[] {
  return groupedDocuments(application).filter(group => !FOLLOW_UP_KEYS.has(group.formKey));
}

export function intermediateDocGroups(application: ComplianceApplication): DocumentGroup[] {
  return groupedDocuments(application).filter(group => INTERMEDIATE_KEYS.has(group.formKey));
}

export function enhancedDocGroups(application: ComplianceApplication): DocumentGroup[] {
  return groupedDocuments(application).filter(group => ENHANCED_KEYS.has(group.formKey));
}

export function followUpLevels(application: ComplianceApplication): FollowUpLevel[] {
  return [
    { key: 'intermediate', label: FOLLOW_UP_LEVEL_LABELS['intermediate'], groups: intermediateDocGroups(application) },
    { key: 'enhanced', label: FOLLOW_UP_LEVEL_LABELS['enhanced'], groups: enhancedDocGroups(application) }
  ].filter(level => level.groups.length > 0);
}
