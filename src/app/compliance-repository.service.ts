import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import {
  ApplicationStatus, ComplianceApplication, ComplianceDocument,
  EMPTY_FOLLOW_UP_DOCS, FollowUpDocs
} from './compliance.models';

export interface DatabaseRow {
  id: string;
  clientName: string;
  nit: string;
  status: ApplicationStatus;
  createdAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
  pdfFileName?: string;
  pdfGeneratedAt?: string;
  hasPdf: boolean;
}

export interface PdfInfo {
  id: string;
  fileName: string;
  contentType: string;
  generatedAt: string;
}

interface ServerDocumentPayload {
  id: string;
  formKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  contentBase64: string;
}

interface ServerApplicationPayload {
  id: string;
  clientName: string;
  nit: string;
  constitutionRecord: string;
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
  followUpDocs: FollowUpDocs;
  documents: ServerDocumentPayload[];
}

@Injectable({ providedIn: 'root' })
export class ComplianceRepositoryService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  /** List rows (client name, NIT, status, pdf info) used by the internal bandeja. */
  getAll(): Promise<ComplianceApplication[]> {
    return lastValueFrom(this.http.get<DatabaseRow[]>(`${this.apiUrl}/applications`))
      .then(rows => rows.map(row => this.rowToApplication(row)));
  }

  /** Full detail for the review panel. */
  getById(id: string): Promise<ComplianceApplication> {
    return lastValueFrom(this.http.get<ServerApplicationPayload>(`${this.apiUrl}/applications/${id}`))
      .then(detail => this.detailToApplication(detail));
  }

  /** Rows of the admin "database / histórico" view. */
  getDatabaseRows(): Promise<DatabaseRow[]> {
    return lastValueFrom(this.http.get<DatabaseRow[]>(`${this.apiUrl}/applications`));
  }

  /** Persist an application (create or update) with its documents. */
  async save(application: ComplianceApplication): Promise<ComplianceApplication> {
    const payload = await this.toServerPayload(application);
    return lastValueFrom(this.http.post<ServerApplicationPayload>(`${this.apiUrl}/applications`, payload))
      .then(detail => this.detailToApplication(detail));
  }

  /** Ask the backend to generate + store a PDF for a client. */
  generatePdf(id: string): Promise<PdfInfo> {
    return lastValueFrom(this.http.post<PdfInfo>(`${this.apiUrl}/applications/${id}/pdf`, {}));
  }

  /** Direct download URL for the stored PDF of a client. */
  downloadPdfUrl(id: string): string {
    return `${this.apiUrl}/applications/${id}/pdf`;
  }

  /** URL to view a stored source document in a new tab (inline, not downloaded). */
  documentViewUrl(clientId: string, docId: string): string {
    return `${this.apiUrl}/applications/${clientId}/documents/${docId}?inline=true`;
  }

  private async toServerPayload(app: ComplianceApplication): Promise<ServerApplicationPayload> {
    return {
      id: app.id,
      clientName: app.clientName,
      nit: app.nit,
      constitutionRecord: app.constitutionRecord,
      commercialRegistration: app.commercialRegistration,
      representativeDocument: app.representativeDocument,
      representativePower: app.representativePower,
      bankCertification: app.bankCertification,
      website: app.website,
      status: app.status,
      rejectedAt: app.rejectedAt,
      rejectionFields: app.rejectionFields,
      baseDocumentationReviewed: app.baseDocumentationReviewed,
      baseDocumentationReviewedAt: app.baseDocumentationReviewedAt,
      followUpFormsEnabled: app.followUpFormsEnabled,
      followUpFormsEnabledAt: app.followUpFormsEnabledAt,
      followUpFormsSubmittedAt: app.followUpFormsSubmittedAt,
      createdAt: app.createdAt,
      submittedAt: app.submittedAt,
      reviewedAt: app.reviewedAt,
      followUpDocs: app.followUpDocs,
      documents: await Promise.all(app.documents.map(doc => this.toDocumentPayload(doc)))
    };
  }

  private async toDocumentPayload(doc: ComplianceDocument): Promise<ServerDocumentPayload> {
    let contentBase64 = '';
    if (doc.content) {
      try { contentBase64 = await this.fileToBase64(doc.content); } catch { contentBase64 = ''; }
    }
    return {
      id: doc.id,
      formKey: doc.formKey,
      fileName: (doc.name || '').trim() || 'documento',
      mimeType: doc.mimeType,
      size: doc.size,
      contentBase64
    };
  }

  private fileToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  private rowToApplication(row: DatabaseRow): ComplianceApplication {
    return {
      id: row.id,
      clientName: row.clientName,
      nit: row.nit,
      constitutionRecord: '',
      commercialRegistration: '',
      representativeDocument: '',
      representativePower: '',
      bankCertification: '',
      website: '',
      status: row.status,
      createdAt: row.createdAt ?? new Date().toISOString(),
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt,
      rejectionFields: [],
      baseDocumentationReviewed: false,
      followUpFormsEnabled: false,
      documents: [],
      followUpDocs: EMPTY_FOLLOW_UP_DOCS()
    };
  }

  private detailToApplication(detail: ServerApplicationPayload): ComplianceApplication {
    return {
      id: detail.id,
      clientName: detail.clientName,
      nit: detail.nit,
      constitutionRecord: detail.constitutionRecord,
      commercialRegistration: detail.commercialRegistration,
      representativeDocument: detail.representativeDocument,
      representativePower: detail.representativePower,
      bankCertification: detail.bankCertification,
      website: detail.website,
      status: detail.status,
      createdAt: detail.createdAt ?? new Date().toISOString(),
      submittedAt: detail.submittedAt,
      reviewedAt: detail.reviewedAt,
      rejectedAt: detail.rejectedAt,
      rejectionFields: Array.isArray(detail.rejectionFields) ? detail.rejectionFields.map(String) : [],
      baseDocumentationReviewed: !!detail.baseDocumentationReviewed,
      baseDocumentationReviewedAt: detail.baseDocumentationReviewedAt,
      followUpFormsEnabled: !!detail.followUpFormsEnabled,
      followUpFormsEnabledAt: detail.followUpFormsEnabledAt,
      followUpFormsSubmittedAt: detail.followUpFormsSubmittedAt,
      documents: (detail.documents ?? []).map((d: ServerDocumentPayload) => ({
        id: d.id,
        formKey: d.formKey,
        name: d.fileName ?? '',
        fileName: d.fileName ?? '',
        mimeType: d.mimeType,
        size: d.size,
        content: new Blob()
      })),
      followUpDocs: { ...EMPTY_FOLLOW_UP_DOCS(), ...(detail.followUpDocs ?? {}) }
    };
  }
}
