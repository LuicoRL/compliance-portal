import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ComplianceRepositoryService, DatabaseRow } from '../compliance-repository.service';
import {
  ApplicationStatus, ComplianceApplication, ComplianceDocument,
  EMPTY_APPLICATION
} from '../compliance.models';

@Component({
  selector: 'app-master-view', standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './master-view.component.html',
  styleUrls: ['./master-view.component.scss']
})
export class MasterViewComponent implements OnInit {
  mode: 'client' | 'admin' = 'client';
  application = EMPTY_APPLICATION();
  applications: ComplianceApplication[] = [];
  selectedApplication?: ComplianceApplication;
  databaseRows: DatabaseRow[] = [];
  searchTerm = '';
  historicoSearch = '';
  statusFilter: 'ALL' | ApplicationStatus = 'ALL';
  adminTab: 'bandeja' | 'historico' = 'bandeja';
  notice = '';
  error = '';
  isSaving = false;
  loadingDetail = false;
  rejectOpen = false;
  rejecting = false;
  rejectionSelection: string[] = [];
  successMessage = '';
  neonFeedback: 'success' | 'error' | null = null;
  invalidUploadKeys: string[] = [];
  invalidFollowUpKeys: string[] = [];
  private neonTimer?: ReturnType<typeof setTimeout>;

  readonly followUpLevelLabels: Record<string, string> = {
    intermediate: 'NIVEL INTERMEDIO · Cliente estándar / regional',
    enhanced: 'NIVEL REFORZADO · Alto riesgo (EDD)'
  };

  readonly uploadFormatNote = 'Solo se admiten archivos en formato PDF';
  readonly optionalLegend = '* campo opcional';

  readonly mainUploadFields = [
    { key: 'constitutionRecord' as const, label: 'Testimonio de constitución o CI' },
    { key: 'nit' as const, label: 'NIT / TAX ID' },
    { key: 'commercialRegistration' as const, label: 'Registro de Comercio' },
    { key: 'representativeDocument' as const, label: 'Documento de identidad del Representante Legal' },
    { key: 'representativePower' as const, label: 'Poder del Representante Legal' },
    { key: 'bankCertification' as const, label: 'Certificación bancaria', placeholder: 'Ej. número de cuenta' }
  ];

  readonly intermediateFields = [
    { key: 'operatingLicense' as const, label: 'Licencia de Funcionamiento', hint: 'Si el rubro exige licencia de funcionamiento' },
    { key: 'uboIdentities' as const, label: 'Documento de identidad de accionistas / UBOs', hint: 'Participación ≥10%' },
    { key: 'orgChart' as const, label: 'Organigrama societario', hint: 'Estructura societaria' },
    { key: 'commercialEvidence' as const, label: 'Evidencia comercial', hint: 'Página web' }
  ];

  readonly enhancedFields = [
    { key: 'financialStatements' as const, label: 'Estados financieros', optional: true },
    { key: 'operatingFlow' as const, label: 'Flujo operativo / modelo de negocio' },
    { key: 'commercialContracts' as const, label: 'Contratos comerciales relevantes', optional: true },
    { key: 'amlManual' as const, label: 'Manual AML/CFT', optional: true },
    { key: 'regulatoryLicenses' as const, label: 'Licencias regulatorias del rubro', optional: true },
    { key: 'submerchants' as const, label: 'Información de subcomercios', optional: true, hint: 'Si opera como agregador' },
    { key: 'pepDeclaration' as const, label: 'Declaración de PEP', optional: false, hint: 'Persona expuesta políticamente' }
  ];

  private readonly fieldLabels: Record<string, string> = {
    ...Object.fromEntries(this.mainUploadFields.map(field => [field.key, field.label] as const)),
    ...Object.fromEntries(this.intermediateFields.map(field => [field.key, field.label] as const)),
    ...Object.fromEntries(this.enhancedFields.map(field => [field.key, field.label] as const)),
    base: 'Documentación de respaldo'
  };

  constructor(
    private readonly repository: ComplianceRepositoryService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> { await this.refreshApplications(); }
  get statusLabel(): string { return this.getStatusLabel(this.application.status); }
  get canEdit(): boolean {
    return this.application.status === 'NOT_APPROVED' || this.application.status === 'REJECTED';
  }

  get followUpEditable(): boolean {
    return !this.application.followUpFormsSubmittedAt || this.application.status === 'REJECTED';
  }

  get clientStatusTitle(): string {
    switch (this.application.status) {
      case 'PENDING': return 'Documentación en revisión';
      case 'APPROVED': return 'Cuenta aprobada';
      case 'REJECTED': return 'Solicitud rechazada';
      default: return 'Documentación pendiente de envío';
    }
  }

  get clientStatusDescription(): string {
    switch (this.application.status) {
      case 'PENDING': return 'La empresa está revisando la información enviada.';
      case 'APPROVED': return 'Tu documentación fue revisada y aprobada.';
      case 'REJECTED': return 'Corrige los campos señalados y vuelve a enviar tu solicitud.';
      default: return 'Completa el formulario y adjunta los documentos requeridos.';
    }
  }

  groupedDocuments(application: ComplianceApplication): { formKey: string; documents: ComplianceDocument[] }[] {
    const order: string[] = [
      ...this.mainUploadFields.map(field => field.key),
      ...this.intermediateFields.map(field => field.key),
      ...this.enhancedFields.map(field => field.key)
    ];
    const groups: { formKey: string; documents: ComplianceDocument[] }[] = order
      .map(formKey => ({ formKey, documents: application.documents.filter(doc => doc.formKey === formKey) }))
      .filter(group => group.documents.length > 0);
    const known = new Set(order);
    const leftoverKeys = [...new Set(
      application.documents.filter(doc => !known.has(doc.formKey)).map(doc => doc.formKey)
    )];
    for (const formKey of leftoverKeys) {
      groups.push({ formKey, documents: application.documents.filter(doc => doc.formKey === formKey) });
    }
    return groups;
  }

  baseDocGroups(application: ComplianceApplication): { formKey: string; documents: ComplianceDocument[] }[] {
    const followUpKeys = new Set<string>([
      ...this.intermediateFields.map(field => field.key),
      ...this.enhancedFields.map(field => field.key)
    ]);
    return this.groupedDocuments(application).filter(group => !followUpKeys.has(group.formKey));
  }

  intermediateDocGroups(application: ComplianceApplication): { formKey: string; documents: ComplianceDocument[] }[] {
    const keys = new Set<string>(this.intermediateFields.map(field => field.key));
    return this.groupedDocuments(application).filter(group => keys.has(group.formKey));
  }

  enhancedDocGroups(application: ComplianceApplication): { formKey: string; documents: ComplianceDocument[] }[] {
    const keys = new Set<string>(this.enhancedFields.map(field => field.key));
    return this.groupedDocuments(application).filter(group => keys.has(group.formKey));
  }

  followUpLevels(application: ComplianceApplication): { key: string; label: string; groups: { formKey: string; documents: ComplianceDocument[] }[] }[] {
    return [
      { key: 'intermediate', label: this.followUpLevelLabels['intermediate'], groups: this.intermediateDocGroups(application) },
      { key: 'enhanced', label: this.followUpLevelLabels['enhanced'], groups: this.enhancedDocGroups(application) }
    ].filter(level => level.groups.length > 0);
  }

  get rejectionCandidates(): { key: string; label: string }[] {
    const candidates: { key: string; label: string }[] = [
      ...this.mainUploadFields,
      { key: 'website', label: 'Página web / Redes sociales' }
    ];
    if (this.selectedApplication?.followUpFormsEnabled) {
      candidates.push(...this.intermediateFields.map(field => ({ key: field.key, label: field.label })));
      candidates.push(...this.enhancedFields.map(field => ({ key: field.key, label: field.label })));
    }
    return candidates;
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

  switchMode(mode: 'client' | 'admin'): void {
    this.mode = mode; this.notice = ''; this.error = '';
    this.successMessage = ''; this.neonFeedback = null;
    if (this.neonTimer) { clearTimeout(this.neonTimer); this.neonTimer = undefined; }
    this.cdr.markForCheck();
    if (mode === 'admin') {
      void this.refreshApplications();
      void this.loadDatabaseRows();
    }
  }

  onDocumentSelected(event: Event, formKey: string): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const isPdf = (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
    if (!isPdf) {
      this.error = `“${file.name}” no es un PDF. Solo se aceptan archivos PDF.`;
      input.value = '';
      return;
    }
    const document: ComplianceDocument = {
      id: crypto.randomUUID(), formKey,
      name: this.documentLabel(formKey),
      fileName: file.name,
      mimeType: 'application/pdf', size: file.size, content: file
    };
    this.application.documents = [...this.application.documents, document];
    this.invalidUploadKeys = this.invalidUploadKeys.filter(key => key !== formKey);
    this.invalidFollowUpKeys = this.invalidFollowUpKeys.filter(key => key !== formKey);
    this.error = '';
    this.notice = `${this.documentLabel(formKey)}: “${file.name}” cargado.`;
  }

  onFollowUpChange(key: string): void {
    this.invalidFollowUpKeys = this.invalidFollowUpKeys.filter(item => item !== key);
  }

  documentsFor(formKey: string): ComplianceDocument[] {
    return this.application.documents.filter(doc => doc.formKey === formKey);
  }

  hasUpload(formKey: string): boolean { return this.documentsFor(formKey).length > 0; }

  removeDocument(document: ComplianceDocument): void {
    this.application.documents = this.application.documents.filter(doc => doc.id !== document.id);
    this.notice = '';
  }

  formattedSize(size: number): string {
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / 1024).toFixed(0)} KB`;
  }

  showSuccess(message: string): void {
    this.successMessage = message;
    this.cdr.markForCheck();
  }

  closeSuccess(): void {
    this.successMessage = '';
    this.cdr.markForCheck();
  }

  private setNeon(feedback: 'success' | 'error'): void {
    if (this.neonTimer) clearTimeout(this.neonTimer);
    this.neonFeedback = feedback;
    this.cdr.markForCheck();
    this.neonTimer = setTimeout(() => {
      this.neonFeedback = null;
      this.cdr.markForCheck();
    }, 1200);
  }

  async submit(form: NgForm): Promise<void> {
    this.error = ''; this.notice = ''; this.invalidUploadKeys = [];
    if (form.invalid) {
      form.control.markAllAsTouched();
      this.error = 'Completa todos los campos obligatorios antes de enviar.';
      this.setNeon('error');
      return;
    }
    const requiredUploads = this.mainUploadFields.map(field => field.key);
    if (!this.validateUploads(requiredUploads)) {
      this.invalidUploadKeys = this.uploadIssues(requiredUploads);
      this.setNeon('error');
      return;
    }
    await this.saveAndComplete('submittedAt', 'No se pudo guardar la solicitud. Inténtalo nuevamente.', true);
  }

  private async saveAndComplete(
    timestampKey: 'submittedAt' | 'followUpFormsSubmittedAt',
    errorMessage: string,
    resetStatusOnFailure: boolean
  ): Promise<void> {
    this.isSaving = true;
    try {
      this.application[timestampKey] = new Date().toISOString();
      this.application.status = 'PENDING';
      this.application.rejectedAt = undefined;
      this.application.rejectionFields = [];
      await this.repository.save(this.application);
      await this.refreshApplications();
      this.setNeon('success');
      this.showSuccess('Su documentación será revisada.');
    } catch {
      if (resetStatusOnFailure) this.application.status = 'NOT_APPROVED';
      this.error = errorMessage;
      this.setNeon('error');
    } finally { this.isSaving = false; }
  }

  async approve(application: ComplianceApplication): Promise<void> {
    application.status = 'APPROVED';
    application.reviewedAt = new Date().toISOString();
    application.rejectedAt = undefined;
    application.rejectionFields = [];
    await this.repository.save(application);
    this.syncApplication(application);
    await this.refreshApplications(false);
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

  async submitFollowUpForms(): Promise<void> {
    this.error = ''; this.notice = '';
    const uploadKeys = [
      ...this.intermediateFields.map(field => field.key),
      ...this.enhancedFields.filter(field => !field.optional).map(field => field.key)
    ];
    this.invalidFollowUpKeys = [...new Set([
      ...this.intermediateFields.filter(field => !this.application.followUpDocs[field.key].trim()).map(field => field.key),
      ...this.enhancedFields.filter(field => !field.optional && !this.application.followUpDocs[field.key].trim()).map(field => field.key),
      ...this.uploadIssues(uploadKeys)
    ])];
    const missing = [
      ...this.intermediateFields.filter(field => !this.application.followUpDocs[field.key].trim()),
      ...this.enhancedFields.filter(field => !field.optional && !this.application.followUpDocs[field.key].trim())
    ].map(field => field.label);
    if (missing.length) {
      this.error = `Completa los campos obligatorios: ${missing.join(', ')}.`;
      this.setNeon('error');
      return;
    }
    if (!this.validateUploads(uploadKeys)) {
      this.setNeon('error');
      return;
    }
    await this.saveAndComplete('followUpFormsSubmittedAt', 'No se pudieron guardar los formularios adicionales.', false);
  }

  canApprove(application: ComplianceApplication): boolean {
    return application.status !== 'APPROVED' && application.baseDocumentationReviewed &&
      (!application.followUpFormsEnabled || Boolean(application.followUpFormsSubmittedAt));
  }

  viewDocument(application: ComplianceApplication, document: ComplianceDocument): void {
    window.open(this.repository.documentViewUrl(application.id, document.id), '_blank');
  }

  documentLabel(formKey: string): string {
    return this.fieldLabels[formKey] ?? formKey;
  }

  isRejectedField(formKey: string): boolean {
    return (this.application.rejectionFields ?? []).includes(formKey);
  }

  private uploadIssues(requiredKeys: string[]): string[] {
    const unnamedKeys = [...new Set(
      this.application.documents.filter(doc => !(doc.name ?? '').trim()).map(doc => doc.formKey)
    )];
    if (unnamedKeys.length) return unnamedKeys;
    return requiredKeys.filter(key => !this.hasUpload(key));
  }

  private validateUploads(requiredKeys: string[]): boolean {
    const issues = this.uploadIssues(requiredKeys);
    if (!issues.length) return true;
    const unnamed = this.application.documents.filter(doc => !(doc.name ?? '').trim());
    if (unnamed.length) {
      this.error = `Todos los archivos necesitan un nombre. Nómbralos: ${unnamed.map(doc => `“${doc.fileName}”`).join(', ')}.`;
      return false;
    }
    this.error = `Adjunta al menos un PDF en: ${issues.map(key => this.documentLabel(key)).join(', ')}.`;
    return false;
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
      this.syncApplication(app);
      await this.refreshApplications(false);
      this.rejectOpen = false;
      this.notice = `${app.clientName} fue rechazado(a). Deberá corregir los campos señalados y reenviar la solicitud.`;
    } catch {
      this.error = 'No se pudo rechazar la solicitud.';
    } finally { this.rejecting = false; }
  }
  async downloadReport(application: ComplianceApplication = this.application): Promise<void> {
    this.notice = ''; this.error = '';
    try {
      const info = await this.repository.generatePdf(application.id);
      window.open(this.repository.downloadPdfUrl(application.id), '_blank');
      this.notice = `Informe PDF generado (${info.fileName}).`;
      if (this.mode === 'admin') await this.loadDatabaseRows();
    } catch {
      this.error = 'No se pudo generar el informe PDF.';
    }
  }
  resetDemo(): void {
    this.application = EMPTY_APPLICATION();
    this.notice = ''; this.error = '';
    this.successMessage = ''; this.neonFeedback = null;
    this.invalidUploadKeys = []; this.invalidFollowUpKeys = [];
    this.cdr.markForCheck();
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

  getStatusLabel(status: ApplicationStatus): string {
    return { NOT_APPROVED: 'No aprobado', PENDING: 'Pendiente', APPROVED: 'Aprobado', REJECTED: 'Rechazado' }[status];
  }

  private async refreshApplications(loadCurrent = true): Promise<void> {
    this.applications = await this.repository.getAll();
    if (loadCurrent && this.applications.length) this.application = this.applications[0];
  }

  private async loadDatabaseRows(): Promise<void> {
    try {
      this.databaseRows = await this.repository.getDatabaseRows();
    } catch {
      this.error = 'No se pudo cargar la base de datos / históricos.';
    }
  }

  selectApplication(item: ComplianceApplication): void {
    this.error = ''; this.notice = '';
    const requestedId = item.id;
    this.application = item;
    this.selectedApplication = item;
    this.loadingDetail = true;
    this.cdr.markForCheck();
    this.repository.getById(requestedId).then(detail => {
      if (requestedId !== this.selectedApplication?.id) return;
      this.selectedApplication = detail;
      this.application = detail;
    }).catch(() => {
      if (requestedId !== this.selectedApplication?.id) return;
      this.error = 'No se pudo cargar el detalle completo del cliente.';
    }).finally(() => {
      this.loadingDetail = false;
      this.cdr.markForCheck();
    });
  }

  private async saveInternalChange(application: ComplianceApplication, message: string): Promise<void> {
    application.status = 'PENDING';
    await this.repository.save(application);
    this.syncApplication(application);
    await this.refreshApplications(false);
    this.notice = message;
  }

  private syncApplication(application: ComplianceApplication): void {
    if (this.application.id === application.id) this.application = application;
    this.selectedApplication = application;
  }
}
