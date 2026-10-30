import { TestBed } from '@angular/core/testing';
import { Instructivo, PASOS } from './instructivo';

describe('Instructivo', () => {
  it('muestra el recorrido sin sesión y cada paso apunta a un elemento de la maqueta', async () => {
    await TestBed.configureTestingModule({ imports: [Instructivo] }).compileComponents();
    const fixture = TestBed.createComponent(Instructivo);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('h1')?.textContent).toContain('Cómo reservar tu puesto');
    expect(html.querySelector('.iniciar')).toBeTruthy();
    for (const paso of PASOS.filter(item => item.element)) {
      expect(html.querySelector(paso.element as string), String(paso.element)).toBeTruthy();
    }
  });
});
