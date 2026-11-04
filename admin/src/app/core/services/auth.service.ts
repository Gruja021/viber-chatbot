import { Injectable, signal, computed } from '@angular/core';

const TOKEN_KEY = 'admin_api_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_KEY));

  readonly isLoggedIn = computed(() => !!this.tokenSignal());

  getToken(): string | null {
    return this.tokenSignal();
  }

  login(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    this.tokenSignal.set(token);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.tokenSignal.set(null);
  }
}
