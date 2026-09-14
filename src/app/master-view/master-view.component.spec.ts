import { NgForm } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComplianceRepositoryService } from '../compliance-repository.service';
import { EMPTY_APPLICATION } from '../compliance.models';
import { MasterViewComponent } from './master-view.component';

describe('MasterViewComponent', () => {
  let component: MasterViewComponent;
  let fixture: ComponentFixture<MasterViewComponent>;

  const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MasterViewComponent],
      providers: [{
        provide: ComplianceRepositoryService,
        useValue: {
          getAll: () => Promise.resolve([]),
          save: () => Promise.resolve(),
          getById: (id: string) => Promise.resolve(Object.assign(EMPTY_APPLICATION(), { id })),
          getDatabaseRows: () => Promise.resolve([])
        }
      }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MasterViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps the client pending when follow-up forms are enabled', async () => {
    component.application.status = 'PENDING';
    component.application.baseDocumentationReviewed = true;

    await component.setFollowUpEligibility(component.application, true);

    expect(component.application.status).toBe('PENDING');
    expect(component.application.followUpFormsEnabled).toBe(true);
  });

  it('requires applicable follow-up forms before final approval', () => {
    component.application.status = 'PENDING';
    component.application.baseDocumentationReviewed = true;
    component.application.followUpFormsEnabled = true;

    expect(component.canApprove(component.application)).toBe(false);
    component.application.followUpFormsSubmittedAt = new Date().toISOString();
    expect(component.canApprove(component.application)).toBe(true);
  });

  it('filters the application list by status', () => {
    component.applications = [
      Object.assign(EMPTY_APPLICATION(), { id: 'a', clientName: 'Pepito', nit: '100', status: 'PENDING' as const }),
      Object.assign(EMPTY_APPLICATION(), { id: 'b', clientName: 'Juan', nit: '200', status: 'APPROVED' as const }),
      Object.assign(EMPTY_APPLICATION(), { id: 'c', clientName: 'Ana', nit: '300', status: 'NOT_APPROVED' as const })
    ];

    component.statusFilter = 'PENDING';
    expect(component.filteredApplications.map(a => a.id)).toEqual(['a']);

    component.statusFilter = 'APPROVED';
    expect(component.filteredApplications.map(a => a.id)).toEqual(['b']);

    component.statusFilter = 'ALL';
    expect(component.filteredApplications.map(a => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters the historico database rows by client name', () => {
    component.databaseRows = [
      { id: 'a', clientName: 'Pepito S.R.L.', nit: '100', status: 'PENDING', hasPdf: true },
      { id: 'b', clientName: 'Juan S.A.', nit: '200', status: 'APPROVED', hasPdf: false },
      { id: 'c', clientName: 'Ana Ltda.', nit: '300', status: 'NOT_APPROVED', hasPdf: true }
    ];

    component.historicoSearch = 'pepito';
    expect(component.filteredDatabaseRows.map(r => r.id)).toEqual(['a']);

    component.historicoSearch = '  JUAN  ';
    expect(component.filteredDatabaseRows.map(r => r.id)).toEqual(['b']);

    component.historicoSearch = '';
    expect(component.filteredDatabaseRows.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('only accepts PDF files and keeps multiple per field', () => {
    const pdf = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' });
    const pdf2 = new File(['%PDF'], 'renovado.pdf', { type: 'application/pdf' });
    component.onDocumentSelected({ target: { value: '', files: [pdf] } } as unknown as Event, 'constitutionRecord');
    component.onDocumentSelected({ target: { value: '', files: [pdf2] } } as unknown as Event, 'constitutionRecord');

    expect(component.documentsFor('constitutionRecord').length).toBe(2);

    const png = new File(['img'], 'foto.png', { type: 'image/png' });
    component.onDocumentSelected({ target: { value: '', files: [png] } } as unknown as Event, 'nit');
    expect(component.documentsFor('nit').length).toBe(0);
    expect(component.error).toContain('PDF');
  });

  it('stores the field name for an uploaded file and keeps the original file name apart', () => {
    const pdf = new File(['%PDF'], 'testimonio.pdf', { type: 'application/pdf' });
    component.onDocumentSelected({ target: { value: '', files: [pdf] } } as unknown as Event, 'constitutionRecord');
    const doc = component.documentsFor('constitutionRecord')[0];
    expect(doc.name).toBe('Testimonio de constitución o CI');
    expect(doc.fileName).toBe('testimonio.pdf');
  });

  it('labels document groups by their field', () => {
    expect(component.documentLabel('constitutionRecord')).toBe('Testimonio de constitución o CI');
    expect(component.documentLabel('representativePower')).toBe('Poder del Representante Legal');
    expect(component.documentLabel('operatingLicense')).toBe('Licencia de Funcionamiento');
    expect(component.documentLabel('pepDeclaration')).toBe('Declaración de PEP');
    expect(component.documentLabel('unknownKey')).toBe('unknownKey');
  });

  it('groups legacy documents without a known form key', () => {
    const app = EMPTY_APPLICATION();
    app.documents = [
      { id: crypto.randomUUID(), formKey: 'base', name: 'Respaldo', fileName: 'respaldo.pdf', mimeType: 'application/pdf', size: 1024, content: new Blob() }
    ];

    const groups = component.groupedDocuments(app);

    expect(groups.length).toBe(1);
    expect(groups[0].formKey).toBe('base');
    expect(component.documentLabel('base')).toBe('Documentación de respaldo');
  });

  it('splits the uploaded files into base, intermediate and enhanced groups', () => {
    const app = EMPTY_APPLICATION();
    const doc = (formKey: string, name: string) => ({
      id: crypto.randomUUID(), formKey, name, fileName: `${name}.pdf`,
      mimeType: 'application/pdf', size: 10, content: new Blob()
    });
    app.documents = [
      doc('constitutionRecord', 'Constitucion'), doc('nit', 'NIT'),
      doc('operatingLicense', 'Licencia'), doc('pepDeclaration', 'Pep')
    ];

    expect(component.baseDocGroups(app).map(g => g.formKey)).toEqual(['constitutionRecord', 'nit']);
    expect(component.intermediateDocGroups(app).map(g => g.formKey)).toEqual(['operatingLicense']);
    expect(component.enhancedDocGroups(app).map(g => g.formKey)).toEqual(['pepDeclaration']);
  });

  it('keeps legacy documents in the base group and only renders levels with files', () => {
    const app = EMPTY_APPLICATION();
    app.documents = [
      { id: crypto.randomUUID(), formKey: 'base', name: 'Respaldo', fileName: 'respaldo.pdf', mimeType: 'application/pdf', size: 10, content: new Blob() },
      { id: crypto.randomUUID(), formKey: 'operatingLicense', name: 'Licencia', fileName: 'lic.pdf', mimeType: 'application/pdf', size: 10, content: new Blob() }
    ];

    expect(component.baseDocGroups(app).map(g => g.formKey)).toEqual(['base']);
    const levels = component.followUpLevels(app);
    expect(levels.map(l => l.key)).toEqual(['intermediate']);
    expect(levels[0].groups[0].formKey).toBe('operatingLicense');
  });

  it('rejects an application and stores the flagged fields', async () => {
    const app = Object.assign(EMPTY_APPLICATION(), { id: 'x', clientName: 'Pepito', status: 'PENDING' as const });
    component.selectedApplication = app;
    component.rejectionSelection = ['constitutionRecord', 'website'];

    await component.confirmReject();

    expect(app.status).toBe('REJECTED');
    expect(app.rejectionFields).toEqual(['constitutionRecord', 'website']);
    expect(app.rejectedAt).toBeTruthy();
    expect(component.rejectOpen).toBe(false);
    expect(component.getStatusLabel('REJECTED')).toBe('Rechazado');
  });

  it('requires at least one field before confirming a rejection', async () => {
    const app = Object.assign(EMPTY_APPLICATION(), { id: 'x', clientName: 'Pepito', status: 'PENDING' as const });
    component.selectedApplication = app;
    component.rejectionSelection = [];

    await component.confirmReject();

    expect(app.status).toBe('PENDING');
    expect(component.error).toContain('Selecciona');
  });

  it('re-enables editing and follow-ups for rejected clients', () => {
    component.application = Object.assign(EMPTY_APPLICATION(), { status: 'REJECTED' as const });
    expect(component.canEdit).toBe(true);
    expect(component.clientStatusTitle).toBe('Solicitud rechazada');
    expect(component.followUpEditable).toBe(true);
    expect(component.isRejectedField('operatingLicense')).toBe(false);
    component.application.rejectionFields = ['operatingLicense'];
    expect(component.isRejectedField('operatingLicense')).toBe(true);
  });

  it('filters the application list by REJECTED', () => {
    component.applications = [
      Object.assign(EMPTY_APPLICATION(), { id: 'a', clientName: 'Pepito', nit: '100', status: 'PENDING' as const }),
      Object.assign(EMPTY_APPLICATION(), { id: 'b', clientName: 'Juan', nit: '200', status: 'REJECTED' as const })
    ];

    component.statusFilter = 'REJECTED';
    expect(component.filteredApplications.map(a => a.id)).toEqual(['b']);
  });

  it('requires a user-given name for every uploaded file', async () => {
    const app = Object.assign(EMPTY_APPLICATION(), { id: 'x', clientName: 'Pepito' });
    component.application = app;
    component.application.followUpFormsEnabled = true;
    (['operatingLicense', 'uboIdentities', 'orgChart', 'commercialEvidence', 'operatingFlow', 'pepDeclaration'] as const)
      .forEach(key => { app.followUpDocs[key] = 'dato'; });
    app.documents = [{
      id: crypto.randomUUID(), formKey: 'operatingLicense', name: '', fileName: 'lic.pdf',
      mimeType: 'application/pdf', size: 10, content: new Blob()
    }];

    await component.submitFollowUpForms();

    expect(component.error).toContain('nombre');
    expect(app.status).toBe('NOT_APPROVED');
    expect(component.invalidFollowUpKeys).toContain('operatingLicense');
  });

  it('clears the rejection when the client resubmits follow-up forms', async () => {
    const app = Object.assign(EMPTY_APPLICATION(), {
      id: 'x', clientName: 'Pepito', status: 'REJECTED' as const,
      rejectedAt: new Date().toISOString(), rejectionFields: ['operatingLicense']
    });
    component.application = app;
    component.application.followUpFormsEnabled = true;
    (['operatingLicense', 'uboIdentities', 'orgChart', 'commercialEvidence', 'operatingFlow', 'pepDeclaration'] as const)
      .forEach(key => { app.followUpDocs[key] = 'dato'; });
    const namedDoc = (formKey: string, name: string) => ({
      id: crypto.randomUUID(), formKey, name, fileName: `${name}.pdf`,
      mimeType: 'application/pdf', size: 10, content: new Blob()
    });
    app.documents = [
      namedDoc('operatingLicense', 'Licencia'), namedDoc('uboIdentities', 'Identidades'),
      namedDoc('orgChart', 'Organigrama'), namedDoc('commercialEvidence', 'Evidencia'),
      namedDoc('operatingFlow', 'Flujo'), namedDoc('pepDeclaration', 'Pep')
    ];

    await component.submitFollowUpForms();

    expect(app.status).toBe('PENDING');
    expect(app.rejectionFields).toEqual([]);
    expect(app.rejectedAt).toBeUndefined();
    expect(component.invalidFollowUpKeys).toEqual([]);
  });

  it('keeps the success popup open until the user closes it', () => {
    component.showSuccess('Su documentación será revisada.');
    fixture.detectChanges();

    expect(component.successMessage).toBe('Su documentación será revisada.');
    expect(fixture.nativeElement.querySelector('.success-overlay')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.success-modal')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.success-overlay p')?.textContent?.trim())
      .toBe('Su documentación será revisada.');

    const overlay = fixture.nativeElement.querySelector('.success-overlay');
    overlay.dispatchEvent(new Event('click', { bubbles: true }));
    fixture.detectChanges();

    expect(component.successMessage).toBe('');
  });

  it('closes the success popup immediately', () => {
    component.showSuccess('Su documentación será revisada.');
    component.closeSuccess();

    expect(component.successMessage).toBe('');
  });

  it('turns the follow-up panel green and opens the popup on a successful submit', async () => {
    const app = Object.assign(EMPTY_APPLICATION(), {
      id: 'x', clientName: 'Pepito', status: 'PENDING' as const
    });
    component.application = app;
    component.application.followUpFormsEnabled = true;
    (['operatingLicense', 'uboIdentities', 'orgChart', 'commercialEvidence', 'operatingFlow', 'pepDeclaration'] as const)
      .forEach(key => { app.followUpDocs[key] = 'dato'; });
    const namedDoc = (formKey: string, name: string) => ({
      id: crypto.randomUUID(), formKey, name, fileName: `${name}.pdf`,
      mimeType: 'application/pdf', size: 10, content: new Blob()
    });
    app.documents = [
      namedDoc('operatingLicense', 'Licencia'), namedDoc('uboIdentities', 'Identidades'),
      namedDoc('orgChart', 'Organigrama'), namedDoc('commercialEvidence', 'Evidencia'),
      namedDoc('operatingFlow', 'Flujo'), namedDoc('pepDeclaration', 'Pep')
    ];

    await component.submitFollowUpForms();

    expect(component.neonFeedback).toBe('success');
    expect(component.successMessage).toBe('Su documentación será revisada.');
    expect(component.invalidFollowUpKeys).toEqual([]);
  });

  it('turns the follow-up panel red without a popup when required data is missing', async () => {
    const app = Object.assign(EMPTY_APPLICATION(), {
      id: 'x', clientName: 'Pepito', status: 'PENDING' as const
    });
    component.application = app;
    component.application.followUpFormsEnabled = true;

    await component.submitFollowUpForms();

    expect(component.neonFeedback).toBe('error');
    expect(component.successMessage).toBe('');
    expect(component.error).toContain('Completa los campos obligatorios');
    expect(component.invalidFollowUpKeys).toEqual(expect.arrayContaining(['operatingLicense', 'pepDeclaration']));
  });

  it('flags the main-form fields missing a required upload', async () => {
    component.application = Object.assign(EMPTY_APPLICATION(), { id: 'x' });

    await component.submit({ invalid: false } as unknown as NgForm);

    expect(component.neonFeedback).toBe('error');
    expect(component.invalidUploadKeys).toEqual(expect.arrayContaining(['constitutionRecord', 'nit']));
    expect(component.error).toContain('Adjunta al menos un PDF');
  });

  it('clears the missing-upload flag once a file is added', () => {
    component.invalidUploadKeys = ['nit', 'constitutionRecord'];
    const pdf = new File(['%PDF'], 'ci.pdf', { type: 'application/pdf' });
    component.onDocumentSelected({ target: { value: '', files: [pdf] } } as unknown as Event, 'nit');

    expect(component.invalidUploadKeys).not.toContain('nit');
    expect(component.invalidUploadKeys).toContain('constitutionRecord');
  });

  it('clears the follow-up flag once the user types a value', () => {
    component.invalidFollowUpKeys = ['operatingLicense', 'pepDeclaration'];
    component.onFollowUpChange('operatingLicense');

    expect(component.invalidFollowUpKeys).not.toContain('operatingLicense');
    expect(component.invalidFollowUpKeys).toContain('pepDeclaration');
  });

  it('closes the success popup when switching views', () => {
    component.showSuccess('Su documentación será revisada.');
    component.switchMode('admin');

    expect(component.successMessage).toBe('');
    expect(component.neonFeedback).toBeNull();
  });

  it('flags the change detector when showing the success popup', () => {
    const spy = vi.spyOn(component['cdr'], 'markForCheck');
    component.showSuccess('Su documentación será revisada.');

    expect(spy).toHaveBeenCalled();
  });

  it('flags the change detector when closing the success popup', () => {
    const spy = vi.spyOn(component['cdr'], 'markForCheck');
    component.closeSuccess();

    expect(spy).toHaveBeenCalled();
  });

  it('loads the full detail and stops loading on selection', async () => {
    const row = Object.assign(EMPTY_APPLICATION(), { id: 'a', clientName: 'Pepito', documents: [] });
    const detail = Object.assign(EMPTY_APPLICATION(), {
      id: 'a', clientName: 'Pepito',
      documents: [{ id: 'd1', formKey: 'nit', name: 'NIT', fileName: 'NIT.pdf', mimeType: 'application/pdf', size: 10, content: new Blob() }]
    });
    const fake: any = component['repository'];
    fake.getById = () => Promise.resolve(detail);

    component.selectApplication(row);

    expect(component.loadingDetail).toBe(true);
    await flush();

    expect(component.loadingDetail).toBe(false);
    expect(component.selectedApplication?.documents.length).toBe(1);
    expect(component.selectedApplication?.documents[0].formKey).toBe('nit');
  });

  it('ignores a stale detail response for a previous selection', async () => {
    const fake: any = component['repository'];
    let resolveFirst!: (value: any) => void;
    fake.getById = (id: string) => id === 'first'
      ? new Promise(res => { resolveFirst = res; })
      : Promise.resolve(Object.assign(EMPTY_APPLICATION(), { id: 'second' }));

    component.selectApplication(Object.assign(EMPTY_APPLICATION(), { id: 'first', clientName: 'Uno' }));
    component.selectApplication(Object.assign(EMPTY_APPLICATION(), { id: 'second', clientName: 'Dos' }));
    await flush();
    resolveFirst(Object.assign(EMPTY_APPLICATION(), { id: 'first', clientName: 'Uno', documents: [{ id: 'x', formKey: 'nit', name: 'NIT', fileName: 'NIT.pdf', mimeType: 'application/pdf', size: 1, content: new Blob() }] }));
    await flush();

    expect(component.selectedApplication?.id).toBe('second');
    expect(component.selectedApplication?.documents.length).toBe(0);
    expect(component.loadingDetail).toBe(false);
  });
});
