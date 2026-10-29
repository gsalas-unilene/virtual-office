import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the UNILENE-branded sign-in form', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Iniciar sesión');
    expect(compiled.querySelector('form')).toBeTruthy();
    const user = compiled.querySelector<HTMLInputElement>('#usuario');
    expect(user?.required).toBe(true);
    expect(user?.type).toBe('text');
    expect(user?.placeholder).toBe('Ingresa tu usuario');
    expect(user?.autocomplete).toBe('username');
    expect(compiled.querySelector('label[for="usuario"]')?.textContent).toContain('Usuario');
    expect(compiled.querySelector<HTMLInputElement>('#password')?.required).toBe(true);
    expect(compiled.querySelector('img[src="/logo_largo.png"]')).toBeTruthy();
    expect(compiled.querySelector('img[src="/logo_circular.png"]')).toBeTruthy();
  });

  it('shows the 3D viewer only after successful authentication', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"username":"tester"}', { status: 200 }));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    (form.elements.namedItem('usuario') as HTMLInputElement).value = 'tester';
    (form.elements.namedItem('password') as HTMLInputElement).value = 'example';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('iframe')?.getAttribute('src')).toBe('/viewer/#puestos');
    vi.restoreAllMocks();
  });
});
