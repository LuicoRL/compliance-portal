import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ComplianceRepositoryService, DatabaseRow } from '../compliance-repository.service';
import {
  ApplicationStatus, ComplianceApplication, ComplianceDocument
} from '../compliance.models';
import {
  ENHANCED_FIELDS, FOLLOW_UP_LEVEL_LABELS, INTERMEDIATE_FIELDS, RejectionCandidate,
  baseDocGroups, documentLabel, followUpLevels, getStatusLabel, rejectionCandidates
} from '../shared/compliance-fields';

@Component({
  selector: 'app-admin-view', standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-view.component.html',
  styleUrls: ['./admin-view.component.scss']
})
export class AdminViewComponent implements OnInit {
  applications: ComplianceApplication[] = [];
  selectedApplication?: ComplianceApplication;
  databaseRows: DatabaseRow[] = [];
  searchTerm = '';
  historicoSearch = '';
  statusFilter: 'ALL' | ApplicationStatus = 'ALL';
  adminTab: 'bandeja' | 'historico' = 'bandeja';
  notice = '';
  error = '';
  loadingDetail = false;
  rejectOpen = false;
  rejecting = false;
  rejectionSelection: string[] = [];

  readonly followUpLevelLabels = FOLLOW_UP_LEVEL_LABELS;
  readonly intermediateFields = INTERMEDIATE_FIELDS;
  readonly enhancedFields = ENHANCED_FIELDS;

  constructor(
    private readonly repository: ComplianceRepositoryService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([this.refreshApplications(), this.loadDatabaseRows()]);
  }

  get rejectionCandidates(): RejectionCandidate[] {
    return rejectionCandidates(Boolean(this.selectedApplication?.followUpFormsEnabled));
  }

  get filteredApplications(): ComplianceApplication[] {
    const statusMatch = (item: ComplianceApplication) =>
      this.statusFilter === 'ALL' || item.status === this.statusFilter;
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.applications.filter(statusMatch);
    return this.applications.filter(item =>
      statusMatch(item) && (item.clientName.toLowerCase().includes(term) ||
        item.nit.toLowerCase().includes(term) || this.getStatusLabel(item.status).toLowerCase().includes(term)));
  }

  get filteredDatabaseRows(): DatabaseRow[] {
    const term = this.historicoSearch.trim().toLowerCase();
    if (!term) return this.databaseRows;
    return this.databaseRows.filter(row => row.clientName.toLowerCase().includes(term));
  }

  get selectedApplicationId(): string | undefined { return this.selectedApplication?.id; }

  documentLabel(formKey: string): string { return documentLabel(formKey); }
  getStatusLabel(status: ApplicationStatus): string { return getStatusLabel(status); }
  baseDocGroups(application: ComplianceApplication) { return baseDocGroups(application); }
  followUpLevels(application: ComplianceApplication) { return followUpLevels(application); }

  formattedSize(size: number): string {
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / 1024).toFixed(0)} KB`;
  }

  canApprove(application: ComplianceApplication): boolean {
    return application.status !== 'APPROVED' && application.baseDocumentationReviewed &&
      (!application.followUpFormsEnabled || Boolean(application.followUpFormsSubmittedAt));
  }

  viewDocument(application: ComplianceApplication, document: ComplianceDocument): void {
    window.open(this.repository.documentViewUrl(application.id, document.id), '_blank');
  }

  selectApplication(item: ComplianceApplication): void {
    this.error = ''; this.notice = '';
    const requestedId = item.id;
    this.selectedApplication = item;
    this.loadingDetail = true;
    this.cdr.markForCheck();
    this.repository.getById(requestedId).then(detail => {
      if (requestedId !== this.selectedApplication?.id) return;
      this.selectedApplication = detail;
    }).catch(() => {
      if (requestedId !== this.selectedApplication?.id) return;
      this.error = 'No se pudo cargar el detalle completo del cliente.';
    }).finally(() => {
      if (requestedId !== this.selectedApplication?.id) return;
      this.loadingDetail = false;
      this.cdr.markForCheck();
    });
  }

  async approve(application: ComplianceApplication): Promise<void> {
    application.status = 'APPROVED';
    application.reviewedAt = new Date().toISOString();
    application.rejectedAt = undefined;
    application.rejectionFields = [];
    await this.repository.save(application);
    this.selectedApplication = application;
    await this.refreshApplications();
    this.notice = `${application.clientName} fue aprobado.`;
  }

  async markBaseDocumentationReviewed(application: ComplianceApplication): Promise<void> {
    application.baseDocumentationReviewed = true;
    application.baseDocumentationReviewedAt = new Date().toISOString();
    await this.saveInternalChange(application, 'Documentación base revisada. El cliente continúa Pendiente.');
  }

  async setFollowUpEligibility(application: ComplianceApplication, enabled: boolean): Promise<void> {
    application.followUpFormsEnabled = enabled;
    application.followUpFormsEnabledAt = enabled ? new Date().toISOString() : undefined;
    await this.saveInternalChange(application, enabled
      ? 'Formularios Intermedio y Reforzado habilitados para el cliente.'
      : 'Formularios adicionales deshabilitados.');
  }

  openReject(application: ComplianceApplication): void {
    this.selectedApplication = application;
    this.rejectionSelection = [];
    this.error = ''; this.notice = '';
    this.rejectOpen = true;
  }

  cancelReject(): void {
    this.rejectOpen = false;
    this.rejectionSelection = [];
    this.error = '';
  }

  toggleRejectionField(key: string): void {
    if (this.rejectionSelection.includes(key)) {
      this.rejectionSelection = this.rejectionSelection.filter(item => item !== key);
    } else {
      this.rejectionSelection = [...this.rejectionSelection, key];
    }
  }

  async confirmReject(): Promise<void> {
    this.error = ''; this.notice = '';
    const app = this.selectedApplication;
    if (!app) return;
    if (!this.rejectionSelection.length) {
      this.error = 'Selecciona al menos un campo que el cliente deba corregir.';
      return;
    }
    this.rejecting = true;
    try {
      app.status = 'REJECTED';
      app.reviewedAt = new Date().toISOString();
      app.rejectedAt = new Date().toISOString();
      app.rejectionFields = [...this.rejectionSelection];
      await this.repository.save(app);
      this.selectedApplication = app;
      await this.refreshApplications();
      this.rejectOpen = false;
      this.notice = `${app.clientName} fue rechazado(a). Deberá corregir los campos señalados y reenviar la solicitud.`;
    } catch {
      this.error = 'No se pudo rechazar la solicitud.';
    } finally { this.rejecting = false; }
  }

  async downloadReport(application: ComplianceApplication): Promise<void> {
    this.notice = ''; this.error = '';
    try {
      const info = await this.repository.generatePdf(application.id);
      window.open(this.repository.downloadPdfUrl(application.id), '_blank');
      await this.loadDatabaseRows();
      this.notice = `Informe PDF generado (${info.fileName}).`;
    } catch {
      this.error = 'No se pudo generar el informe PDF.';
    }
  }

  async generatePdfFor(row: DatabaseRow): Promise<void> {
    this.error = ''; this.notice = '';
    try {
      const info = await this.repository.generatePdf(row.id);
      window.open(this.repository.downloadPdfUrl(row.id), '_blank');
      await this.loadDatabaseRows();
      this.notice = `Informe PDF generado (${info.fileName}).`;
    } catch {
      this.error = 'No se pudo generar el informe PDF.';
    }
  }

  downloadReportById(id: string): void {
    window.open(this.repository.downloadPdfUrl(id), '_blank');
  }

  private async saveInternalChange(application: ComplianceApplication, message: string): Promise<void> {
    application.status = 'PENDING';
    await this.repository.save(application);
    this.selectedApplication = application;
    await this.refreshApplications();
    this.notice = message;
  }

  /** Refreshes the bandeja list only; it never replaces the open review panel. */
  private async refreshApplications(): Promise<void> {
    this.applications = await this.repository.getAll();
  }

  private async loadDatabaseRows(): Promise<void> {
    try {
      this.databaseRows = await this.repository.getDatabaseRows();
    } catch {
      this.error = 'No se pudo cargar la base de datos / histórico.';
    }
  }
}
