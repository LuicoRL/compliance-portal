import { NgForm } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ComplianceRepositoryService } from '../compliance-repository.service';
import { EMPTY_APPLICATION } from '../compliance.models';
import {
  RepositoryFake, applicationWithCompleteFollowUp, createRepositoryFake, flush
} from '../testing/compliance-repository.fake';
import { ClientViewComponent } from './client-view.component';

describe('ClientViewComponent', () => {
  let component: ClientViewComponent;
  let fixture: ComponentFixture<ClientViewComponent>;
  let repository: RepositoryFake;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let router: Router;

  /** Simulates the router landing on /solicitud or /solicitud/:id. */
  const navigateTo = async (id?: string) => {
    params.next(convertToParamMap(id ? { id } : {}));
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    repository = createRepositoryFake();
    params = new BehaviorSubject(convertToParamMap({}));

    await TestBed.configureTestingModule({
      imports: [ClientViewComponent],
      providers: [
        provideRouter([]),
        { provide: ComplianceRepositoryService, useValue: repository },
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } }
      ]
    })
    .compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ClientViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens a blank application when no id is present in the URL', async () => {
    await navigateTo();

    expect(component.application.clientName).toBe('');
    expect(component.application.status).toBe('NOT_APPROVED');
    expect(repository.getById).not.toHaveBeenCalled();
  });

  it('loads the application named by the :id segment', async () => {
    repository.getById.mockResolvedValue(
      Object.assign(EMPTY_APPLICATION(), { id: 'abc', clientName: 'Farmacorp', status: 'PENDING' })
    );

    await navigateTo('abc');

    expect(repository.getById).toHaveBeenCalledWith('abc');
    expect(component.application.clientName).toBe('Farmacorp');
    expect(component.loadingDetail).toBe(false);
  });

  it('reports a bad :id instead of leaving the screen stuck loading', async () => {
    repository.getById.mockRejectedValue(new Error('404'));

    await navigateTo('nope');

    expect(component.error).toContain('No se pudo cargar la solicitud');
    expect(component.loadingDetail).toBe(false);
  });

  it('marks required base fields with an asterisk and leaves the optional one bare', async () => {
    await navigateTo();
    const text: string = fixture.nativeElement.textContent;

    expect(text).toContain('* (campo obligatorio)');
    expect(text).toContain('Nombre o razón social *');
    expect(text).toContain('Testimonio de constitución o CI *');
    expect(text).toContain('Certificación bancaria *');
    // website is the only optional field in the base form.
    expect(text).toContain('Página web / Redes sociales');
    expect(text).not.toContain('Página web / Redes sociales *');
  });

  it('marks every intermediate field and only the two required enhanced ones', async () => {
    repository.getById.mockResolvedValue(Object.assign(EMPTY_APPLICATION(), {
      id: 'follow', clientName: 'Pepito', status: 'PENDING' as const, followUpFormsEnabled: true
    }));

    await navigateTo('follow');
    const text: string = fixture.nativeElement.textContent;

    // All four intermediate fields are required.
    expect(text).toContain('Licencia de Funcionamiento *');
    expect(text).toContain('Organigrama societario *');
    // operatingFlow and pepDeclaration are the only required enhanced fields.
    expect(text).toContain('Flujo operativo / modelo de negocio *');
    expect(text).toContain('Declaración de PEP *');
    for (const optional of [
      'Estados financieros', 'Contratos comerciales relevantes', 'Manual AML/CFT',
      'Licencias regulatorias del rubro', 'Información de subcomercios'
    ]) {
      expect(text).toContain(optional);
      expect(text).not.toContain(`${optional} *`);
    }
  });

  it('moves the URL to /solicitud/:id after the first successful submit', async () => {
    const app = Object.assign(EMPTY_APPLICATION(), { id: 'new-id', clientName: 'Pepito' });
    for (const field of component.mainUploadFields) {
      app[field.key] = 'dato';
      app.documents.push({
        id: crypto.randomUUID(), formKey: field.key, name: field.label,
        fileName: `${field.key}.pdf`, mimeType: 'application/pdf', size: 10, content: new Blob()
      });
    }
    component.application = app;

    await component.submit({ invalid: false } as unknown as NgForm);

    expect(repository.save).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/solicitud', 'new-id'], { replaceUrl: true });
  });

  it('clears the :id segment when starting a new application', async () => {
    await navigateTo('abc');
    component.startNewApplication();
    await flush();

    expect(router.navigate).toHaveBeenCalledWith(['/solicitud'], { replaceUrl: true });
    expect(component.application.clientName).toBe('');
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

  it('re-enables editing and follow-ups for rejected clients', () => {
    component.application = Object.assign(EMPTY_APPLICATION(), { status: 'REJECTED' as const });
    expect(component.canEdit).toBe(true);
    expect(component.clientStatusTitle).toBe('Solicitud rechazada');
    expect(component.followUpEditable).toBe(true);
    expect(component.isRejectedField('operatingLicense')).toBe(false);
    component.application.rejectionFields = ['operatingLicense'];
    expect(component.isRejectedField('operatingLicense')).toBe(true);
  });

  it('only keeps rejected fields editable after a rejection', () => {
    component.application = Object.assign(EMPTY_APPLICATION(), {
      status: 'REJECTED' as const,
      rejectionFields: ['constitutionRecord']
    });

    expect(component.isFieldEditable('constitutionRecord')).toBe(true);
    expect(component.isFieldEditable('nit')).toBe(false);
    expect(component.isFieldEditable('website')).toBe(false);
    expect(component.isFieldEditable('clientName')).toBe(false);
    expect(component.isFieldEditable('operatingLicense')).toBe(false);
  });

  it('keeps every field editable outside an active rejection', () => {
    component.application = Object.assign(EMPTY_APPLICATION(), {
      status: 'NOT_APPROVED' as const,
      rejectionFields: ['constitutionRecord']
    });

    expect(component.isFieldEditable('nit')).toBe(true);
    expect(component.isFieldEditable('website')).toBe(true);

    component.application.status = 'REJECTED';
    expect(component.isFieldEditable('nit')).toBe(false);
  });

  it('requires a user-given name for every uploaded file', async () => {
    const app = applicationWithCompleteFollowUp();
    app.documents = [{
      id: crypto.randomUUID(), formKey: 'operatingLicense', name: '', fileName: 'lic.pdf',
      mimeType: 'application/pdf', size: 10, content: new Blob()
    }];
    component.application = app;

    await component.submitFollowUpForms();

    expect(component.error).toContain('nombre');
    expect(app.status).toBe('NOT_APPROVED');
    expect(component.invalidFollowUpKeys).toContain('operatingLicense');
  });

  it('clears the rejection when the client resubmits follow-up forms', async () => {
    const app = applicationWithCompleteFollowUp({
      status: 'REJECTED' as const,
      rejectedAt: new Date().toISOString(),
      rejectionFields: ['operatingLicense']
    });
    component.application = app;

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
    component.application = applicationWithCompleteFollowUp({ status: 'PENDING' as const });

    await component.submitFollowUpForms();

    expect(component.neonFeedback).toBe('success');
    expect(component.successMessage).toBe('Su documentación será revisada.');
    expect(component.invalidFollowUpKeys).toEqual([]);
  });

  it('turns the follow-up panel red without a popup when required data is missing', async () => {
    const app = Object.assign(EMPTY_APPLICATION(), { id: 'x', clientName: 'Pepito', status: 'PENDING' as const });
    app.followUpFormsEnabled = true;
    component.application = app;

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
});
