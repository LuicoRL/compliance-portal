import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, viewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ComplianceRepositoryService } from '../compliance-repository.service';
import {
  ApplicationStatus, ComplianceDocument, EMPTY_APPLICATION
} from '../compliance.models';
import {
  ENHANCED_FIELDS, INTERMEDIATE_FIELDS, MAIN_UPLOAD_FIELDS, REQUIRED_LEGEND,
  UPLOAD_FORMAT_NOTE, documentLabel, getStatusLabel
} from '../shared/compliance-fields';

@Component({
  selector: 'app-client-view', standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-view.component.html',
  styleUrls: ['./client-view.component.scss']
})
export class ClientViewComponent implements OnInit, OnDestroy {
  application = EMPTY_APPLICATION();
  notice = '';
  error = '';
  isSaving = false;
  loadingDetail = false;
  successMessage = '';
  neonFeedback: 'success' | 'error' | null = null;
  invalidUploadKeys: string[] = [];
  invalidFollowUpKeys: string[] = [];
  private neonTimer?: ReturnType<typeof setTimeout>;
  private detailRequestId?: string;
  readonly applicationForm = viewChild<NgForm>('applicationForm');

  readonly mainUploadFields = MAIN_UPLOAD_FIELDS;
  readonly intermediateFields = INTERMEDIATE_FIELDS;
  readonly enhancedFields = ENHANCED_FIELDS;
  readonly uploadFormatNote = UPLOAD_FORMAT_NOTE;
  readonly requiredLegend = REQUIRED_LEGEND;

  constructor(
    private readonly repository: ComplianceRepositoryService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id && id !== this.application.id) {
        this.loadApplication(id);
      } else if (!id) {
        this.resetDemo();
      }
    });
  }

  ngOnDestroy(): void {
    this.clearNeonTimer();
  }

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

  documentLabel(formKey: string): string { return documentLabel(formKey); }
  getStatusLabel(status: ApplicationStatus): string { return getStatusLabel(status); }

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

  showSuccess(message: string): void {
    this.successMessage = message;
    this.cdr.markForCheck();
  }

  closeSuccess(): void {
    this.successMessage = '';
    this.cdr.markForCheck();
  }

  private setNeon(feedback: 'success' | 'error'): void {
    this.clearNeonTimer();
    this.neonFeedback = feedback;
    this.cdr.markForCheck();
    this.neonTimer = setTimeout(() => {
      this.neonFeedback = null;
      this.cdr.markForCheck();
    }, 1200);
  }

  private clearNeonTimer(): void {
    if (!this.neonTimer) return;
    clearTimeout(this.neonTimer);
    this.neonTimer = undefined;
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
      this.setNeon('success');
      this.showSuccess('Su documentación será revisada.');
    } catch {
      if (resetStatusOnFailure) this.application.status = 'NOT_APPROVED';
      this.error = errorMessage;
      this.setNeon('error');
    } finally { this.isSaving = false; }
    // Outside the try: a navigation failure must not roll back an already-saved status.
    await this.router.navigate(['/solicitud', this.application.id], { replaceUrl: true });
  }

  async submitFollowUpForms(): Promise<void> {
    this.error = ''; this.notice = '';
    const uploadKeys = [
      ...this.intermediateFields.map(field => field.key),
      ...this.enhancedFields.filter(field => field.required).map(field => field.key)
    ];
    this.invalidFollowUpKeys = [...new Set([
      ...this.intermediateFields.filter(field => !this.application.followUpDocs[field.key].trim()).map(field => field.key),
      ...this.enhancedFields.filter(field => field.required && !this.application.followUpDocs[field.key].trim()).map(field => field.key),
      ...this.uploadIssues(uploadKeys)
    ])];
    const missing = [
      ...this.intermediateFields.filter(field => !this.application.followUpDocs[field.key].trim()),
      ...this.enhancedFields.filter(field => field.required && !this.application.followUpDocs[field.key].trim())
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

  isRejectedField(formKey: string): boolean {
    return (this.application.rejectionFields ?? []).includes(formKey);
  }

  isFieldEditable(formKey: string): boolean {
    if (this.application.status !== 'REJECTED') return true;
    return this.isRejectedField(formKey);
  }

  resetDemo(): void {
    this.detailRequestId = undefined;
    this.loadingDetail = false;
    this.application = EMPTY_APPLICATION();
    this.notice = ''; this.error = '';
    this.successMessage = ''; this.neonFeedback = null;
    this.invalidUploadKeys = []; this.invalidFollowUpKeys = [];
    this.cdr.markForCheck();
  }

  /** Start over on the blank form, dropping the :id segment from the URL. */
  startNewApplication(): void {
    this.resetDemo();
    void this.router.navigate(['/solicitud'], { replaceUrl: true });
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

  private loadApplication(id: string): void {
    this.error = ''; this.notice = '';
    this.successMessage = ''; this.neonFeedback = null;
    this.clearNeonTimer();
    this.detailRequestId = id;
    this.loadingDetail = true;
    this.cdr.markForCheck();
    this.repository.getById(id).then(detail => {
      if (this.detailRequestId !== id) return;
      this.application = detail;
      this.resetFormControls();
    }).catch(() => {
      if (this.detailRequestId !== id) return;
      this.error = 'No se pudo cargar la solicitud. Revisa el enlace o inicia una nueva.';
    }).finally(() => {
      if (this.detailRequestId !== id) return;
      this.loadingDetail = false;
      this.cdr.markForCheck();
    });
  }

  /** ngModel controls keep their values when `application` is swapped, so rebind them. */
  private resetFormControls(): void {
    this.applicationForm()?.resetForm(this.application);
  }
}
