import { TestBed } from '@angular/core/testing';
import { Instructivo } from './instructivo';

describe('Instructivo', () => {
  it('muestra el visor de demostración público sin sesión', async () => {
    await TestBed.configureTestingModule({ imports: [Instructivo] }).compileComponents();
    const fixture = TestBed.createComponent(Instructivo);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('h1')?.textContent).toContain('Cómo reservar tu puesto');
    expect(html.querySelector('iframe')?.getAttribute('src')).toBe('/demo/?demo#puestos');
  });
});
