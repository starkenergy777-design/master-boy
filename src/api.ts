import { Language, User, Advertisement, AdvertisementPublic, AdminTop15Member } from './types.js';
import { localizeApiError } from './i18n.js';

class ApiClient {
  private baseUrl = '/api/v1';
  private token: string | null = null;
  private lang: Language = 'ka';

  constructor() {
    this.token = localStorage.getItem('mb_session_token');
    const savedLang = localStorage.getItem('mb_lang') as Language;
    if (savedLang && ['ka', 'ru', 'en'].includes(savedLang)) {
      this.lang = savedLang;
    }
  }

  setLanguage(lang: Language) {
    this.lang = lang;
    localStorage.setItem('mb_lang', lang);
  }

  getLanguage(): Language {
    return this.lang;
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('mb_session_token', token);
    } else {
      localStorage.removeItem('mb_session_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  async request<T = any>(
    path: string,
    options: RequestInit & { idempotencyKey?: string } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Accept-Language': this.lang,
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const isGet = !options.method || options.method.toUpperCase() === 'GET';
    const maxRetries = isGet ? 2 : 0;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          headers,
        });

        if (!response.ok) {
          // If server is starting up (502, 503, 504), retry if attempts remain
          if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < maxRetries) {
            await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)));
            continue;
          }

          let errData: any = {};
          try {
            errData = await response.json();
          } catch (e) {
            errData = { message: response.statusText };
          }
          const error: any = new Error(localizeApiError(this.lang, errData.code, errData.message || 'API request failed'));
          error.status = response.status;
          error.code = errData.code;
          error.data = errData;
          throw error;
        }

        return await response.json();
      } catch (err: any) {
        lastError = err;
        // Network error during cold start -> retry if GET
        if (attempt < maxRetries && (!err.status || err.status >= 500)) {
          await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)));
          continue;
        }
        if (!err?.status) {
          throw new Error(localizeApiError(this.lang, undefined, err?.message || 'Network error'));
        }
        throw err;
      }
    }

    throw lastError;
  }

  // Public Endpoints
  getCities() {
    return this.request('/cities');
  }

  getProfessions() {
    return this.request('/professions');
  }

  search(cityId?: string, professionId?: string, page = 1, size = 20) {
    const params = new URLSearchParams();
    if (cityId) params.append('cityId', cityId);
    if (professionId) params.append('professionId', professionId);
    params.append('page', page.toString());
    params.append('size', size.toString());
    return this.request(`/search?${params.toString()}`);
  }

  getCraftsman(id: string) {
    return this.request(`/craftsmen/${id}`);
  }

  getCraftsmanRegistrationPrice() {
    return this.request<{ amountMinor: number; currency: string }>('/craftsmen/registration-price');
  }

  getTop15Price(cityId: string, professionId: string) {
    return this.request(`/top15/price?cityId=${cityId}&professionId=${professionId}`);
  }

  getBackendConfig() {
    return this.request('/config/backend');
  }

  // Auth
  requestOtp(phone: string) {
    return this.request('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  verifyOtp(challengeId: string, code: string) {
    return this.request('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId, code }),
    });
  }

  loginWithPassword(phone: string, password: string) {
    return this.request('/auth/password/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
  }

  logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  getMe() {
    return this.request<User>('/auth/me');
  }

  updateAdminPhone(currentPassword: string, phone: string) {
    return this.request<{ success: boolean; user: User }>('/admin/me/phone', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, phone }),
    });
  }

  updateAdminPassword(currentPassword: string, newPassword: string) {
    return this.request<{ success: boolean }>('/admin/me/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // Craftsman
  saveDraft(step: number, data: any) {
    return this.request('/craftsmen/me/draft', {
      method: 'PUT',
      body: JSON.stringify({ step, data }),
    });
  }

  registerCraftsman(data?: any) {
    return this.request('/craftsmen/register', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  directRegisterCraftsman(data: any) {
    return this.request('/auth/craftsman/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getMyCraftsman() {
    return this.request('/craftsmen/me');
  }

  updateMyCraftsman(updates: any) {
    return this.request('/craftsmen/me', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  getCraftsmanListing() {
    return this.request('/craftsmen/me/listing');
  }

  payCraftsmanListing(providerId: string) {
    return this.request('/craftsmen/me/listing/pay', {
      method: 'POST',
      headers: {
        'Idempotency-Key': `idem-list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      },
      body: JSON.stringify({ providerId }),
    });
  }

  renewCraftsmanListing(providerId: string) {
    return this.request('/craftsmen/me/listing/renew', {
      method: 'POST',
      headers: {
        'Idempotency-Key': `idem-renew-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      },
      body: JSON.stringify({ providerId }),
    });
  }

  getListingPrice() {
    return this.request('/admin/listing/price');
  }

  updateListingPrice(amountMinor: number) {
    return this.request('/admin/listing/price', {
      method: 'PUT',
      body: JSON.stringify({ amountMinor }),
    });
  }

  addPhoto(url: string, isPrimary = false) {
    return this.request('/craftsmen/me/photos', {
      method: 'POST',
      body: JSON.stringify({ url, isPrimary }),
    });
  }

  deletePhoto(photoId: string) {
    return this.request(`/craftsmen/me/photos/${photoId}`, {
      method: 'DELETE',
    });
  }

  getTop15Availability(cityId: string, professionId: string) {
    return this.request(`/top15/availability?cityId=${cityId}&professionId=${professionId}`);
  }

  reserveTop15Slot(cityId: string, professionId: string) {
    return this.request('/top15/reserve', {
      method: 'POST',
      body: JSON.stringify({ cityId, professionId }),
    });
  }

  getPaymentProviders() {
    return this.request('/top15/providers');
  }

  payTop15(reservationId: string, providerId: string, idempotencyKey: string) {
    return this.request('/top15/pay', {
      method: 'POST',
      idempotencyKey,
      body: JSON.stringify({ reservationId, providerId }),
    });
  }

  getMyMemberships() {
    return this.request('/top15/me/memberships');
  }

  getSupportMessages(after?: string) {
    return this.request(`/support/messages${after ? `?after=${after}` : ''}`);
  }

  sendSupportMessage(text: string) {
    return this.request('/support/messages', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  // Admin
  getAdmins() {
    return this.request<User[]>('/admin/admins');
  }

  createAdmin(payload: { phone: string; password: string; adminSharePercent: number }) {
    return this.request<User>('/admin/admins', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getAdminCraftsmen(query = '', status = '', page = 1, size = 50) {
    return this.request(`/admin/craftsmen?query=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&page=${page}&size=${size}`);
  }

  getAdminUsers(query = '', page = 1) {
    return this.request(`/admin/users?query=${query}&page=${page}`);
  }

  blockUser(id: string) {
    return this.request(`/admin/users/${id}/block`, { method: 'PUT' });
  }

  unblockUser(id: string) {
    return this.request(`/admin/users/${id}/unblock`, { method: 'PUT' });
  }

  deleteCraftsman(id: string) {
    return this.request(`/admin/craftsmen/${id}`, { method: 'DELETE' });
  }

  getAdminTop15Prices() {
    return this.request('/admin/top15/prices');
  }

  getAdminTop15Members() {
    return this.request<AdminTop15Member[]>('/admin/top15/members');
  }

  updateTop15Price(cityId: string, professionId: string, amountMinor: number) {
    return this.request('/admin/top15/prices', {
      method: 'PUT',
      body: JSON.stringify({ cityId, professionId, amountMinor }),
    });
  }

  getAnalytics() {
    return this.request('/admin/analytics');
  }

  getReports(type = '', page = 1) {
    return this.request(`/admin/reports?type=${type}&page=${page}`);
  }

  generateReport(type: string) {
    return this.request('/admin/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
  }

  getAuditLog() {
    return this.request('/admin/audit-log');
  }

  // Super Admin
  getProviders(type: string) {
    return this.request<any[]>(`/admin/providers/${type}`);
  }

  addProvider(type: string, data: any) {
    return this.request(`/admin/providers/${type}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updatePaymentProvider(id: string, data: any) {
    return this.request(`/admin/providers/payment/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  updateAiProvider(provider: 'gemini' | 'openai', apiKey?: string) {
    return this.request('/admin/providers/ai', {
      method: 'PUT',
      body: JSON.stringify({ provider, apiKey }),
    });
  }

  getAiProviderStatus() {
    return this.request('/admin/providers/ai/status');
  }

  getSuperAdminAgent() {
    return this.request<{ enabled: boolean; rules: string; messages: Array<{ role: 'user' | 'assistant'; content: string; createdAt: string }> }>('/admin/agent');
  }

  updateSuperAdminAgent(settings: { enabled?: boolean; rules?: string }) {
    return this.request('/admin/agent/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  sendSuperAdminAgentMessage(message: string) {
    return this.request('/admin/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  clearSuperAdminAgentChat() {
    return this.request('/admin/agent/chat', {
      method: 'DELETE',
    });
  }

  getRecipientAccount() {
    return this.request('/admin/payment/recipient-account');
  }

  updateRecipientAccount(data: any) {
    return this.request('/admin/payment/recipient-account', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  getConfigLock() {
    return this.request('/admin/config/lock');
  }

  activateConfigLock() {
    return this.request('/admin/config/lock', { method: 'POST' });
  }

  unlockConfig(credential: string) {
    return this.request('/admin/config/unlock', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
  }

  migrateBootstrap(newPhone: string, newPassword: string, otpCode: string) {
    return this.request('/admin/bootstrap/migrate', {
      method: 'POST',
      body: JSON.stringify({ newPhone, newPassword, otpCode }),
    });
  }

  getBootstrapStatus() {
    return this.request('/admin/bootstrap/status');
  }

  // --- Advertisements & Partner System ---
  getActiveAd() {
    return this.request<{ ad: AdvertisementPublic | null }>('/advertisements/active');
  }

  getAdminAds() {
    return this.request<Advertisement[]>('/admin/advertisements');
  }

  createAdminAd(payload: { company_name?: string; phone_number: string; password: string; days?: number; price_gel?: number }) {
    return this.request('/admin/advertisements', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  updateAdminAd(id: string, payload: any) {
    return this.request(`/admin/advertisements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  blockAndDeleteAdminAd(id: string) {
    return this.request(`/admin/advertisements/${id}/block-and-delete`, {
      method: 'POST',
    });
  }

  getPartnerAd() {
    return this.request<{ ad: Advertisement }>('/partner/ad');
  }

  acceptPartnerTerms() {
    return this.request('/partner/accept-terms', { method: 'POST' });
  }

  payPartnerAd() {
    const key = `adpay-${crypto.randomUUID()}`;
    return this.request('/partner/pay', { method: 'POST', headers: { 'Idempotency-Key': key } });
  }

  updatePartnerAd(payload: { company_name?: string; image_url?: string; target_url?: string }) {
    return this.request('/partner/ad', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  getPersistenceStatus() {
    return this.request<{
      databaseConfigured: boolean;
      databaseConnected: boolean;
      lastCheck: string;
      config: any;
    }>('/admin/persistence/status');
  }
}

export const api = new ApiClient();

