import { vi } from 'vitest';
import { DatabaseRow, PdfInfo } from '../compliance-repository.service';
import { ComplianceApplication, EMPTY_APPLICATION } from '../compliance.models';

export interface RepositoryFake {
  getAll: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  getDatabaseRows: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  generatePdf: ReturnType<typeof vi.fn>;
  downloadPdfUrl: ReturnType<typeof vi.fn>;
  documentViewUrl: ReturnType<typeof vi.fn>;
}

/** Stands in for ComplianceRepositoryService so specs never touch HttpClient. */
export function createRepositoryFake(overrides: Partial<RepositoryFake> = {}): RepositoryFake {
  return {
    getAll: vi.fn(() => Promise.resolve([] as ComplianceApplication[])),
    getById: vi.fn((id: string) => Promise.resolve(Object.assign(EMPTY_APPLICATION(), { id }))),
    getDatabaseRows: vi.fn(() => Promise.resolve([] as DatabaseRow[])),
    save: vi.fn(() => Promise.resolve()),
    generatePdf: vi.fn((id: string) => Promise.resolve({
      id, fileName: `informe-${id}.pdf`, contentType: 'application/pdf', generatedAt: new Date().toISOString()
    } as PdfInfo)),
    downloadPdfUrl: vi.fn((id: string) => `http://test/applications/${id}/pdf`),
    documentViewUrl: vi.fn((clientId: string, docId: string) =>
      `http://test/applications/${clientId}/documents/${docId}?inline=true`),
    ...overrides
  };
}

/** Resolves after the microtask + timer queue drains, so `.then` chains settle. */
export const flush = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

export const namedDocument = (formKey: string, name: string) => ({
  id: crypto.randomUUID(), formKey, name, fileName: `${name}.pdf`,
  mimeType: 'application/pdf', size: 10, content: new Blob()
});

/** An application with every required follow-up text field and upload satisfied. */
export function applicationWithCompleteFollowUp(overrides: Partial<ComplianceApplication> = {}): ComplianceApplication {
  const app = Object.assign(EMPTY_APPLICATION(), { id: 'x', clientName: 'Pepito', ...overrides });
  app.followUpFormsEnabled = true;
  for (const key of ['operatingLicense', 'uboIdentities', 'orgChart', 'commercialEvidence', 'operatingFlow', 'pepDeclaration'] as const) {
    app.followUpDocs[key] = 'dato';
  }
  app.documents = [
    namedDocument('operatingLicense', 'Licencia'), namedDocument('uboIdentities', 'Identidades'),
    namedDocument('orgChart', 'Organigrama'), namedDocument('commercialEvidence', 'Evidencia'),
    namedDocument('operatingFlow', 'Flujo'), namedDocument('pepDeclaration', 'Pep')
  ];
  return app;
}
