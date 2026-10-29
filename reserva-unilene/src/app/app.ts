import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly notice = signal('');
  protected readonly username = signal('');

  constructor() {
    void fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(async response => {
        if (response.ok) this.username.set((await response.json()).username);
      }).catch(() => {});
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    this.notice.set('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: data.get('usuario'), password: data.get('password') }),
      });
      if (!response.ok) {
        this.notice.set(response.status === 401 ? 'Usuario o contraseña incorrectos.' : 'No se pudo iniciar sesión. Inténtalo nuevamente.');
        return;
      }
      this.username.set((await response.json()).username);
    } catch {
      this.notice.set('No se pudo conectar al servicio.');
    }
  }

  protected async logout(): Promise<void> {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error('logout failed');
      this.username.set('');
    } catch {
      this.notice.set('No se pudo cerrar la sesión.');
    }
  }
}
