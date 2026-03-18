// API Client for Marie Kondo Email Triage

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class ApiClient {
  private baseUrl = '/api';

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error('API request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Auth endpoints
  async getAuthUrl(): Promise<ApiResponse<{ authUrl: string }>> {
    return this.request('/auth/login');
  }

  async getAuthStatus(): Promise<ApiResponse<any>> {
    return this.request('/auth/status');
  }

  async logout(): Promise<ApiResponse> {
    return this.request('/auth/logout', { method: 'POST' });
  }

  // Email endpoints
  async scanEmails(
    query?: string,
    max?: number,
    onProgress?: (progress: any) => void
  ): Promise<void> {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    if (max) params.append('max', max.toString());

    const response = await fetch(
      `${this.baseUrl}/emails/scan?${params.toString()}`,
      { credentials: 'include' }
    );

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (onProgress) onProgress(data);
        }
      }
    }
  }

  async getEmails(limit = 50, offset = 0): Promise<ApiResponse<any[]>> {
    return this.request(`/emails?limit=${limit}&offset=${offset}`);
  }

  async getEmail(id: number): Promise<ApiResponse<any>> {
    return this.request(`/emails/${id}`);
  }

  // Triage endpoints
  async getTriageQueue(status = 'pending'): Promise<ApiResponse<any[]>> {
    return this.request(`/triage/queue?status=${status}`);
  }

  async approveTriage(id: number): Promise<ApiResponse> {
    return this.request(`/triage/approve/${id}`, { method: 'POST' });
  }

  async rejectTriage(id: number): Promise<ApiResponse> {
    return this.request(`/triage/reject/${id}`, { method: 'POST' });
  }

  async bulkApproveTriage(ids: number[]): Promise<ApiResponse> {
    return this.request('/triage/bulk-approve', {
      method: 'POST',
      body: JSON.stringify({ triageIds: ids }),
    });
  }

  async getSenderRules(): Promise<ApiResponse<any[]>> {
    return this.request('/triage/sender-rules');
  }

  async createSenderRule(body: { kind: string; value: string }): Promise<ApiResponse<any>> {
    const res = await fetch(`${this.baseUrl}/triage/sender-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = res.ok ? await res.json() : await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: (data as any).error || 'Request failed' };
    }
    return { success: true, data };
  }

  async deleteSenderRule(id: number): Promise<ApiResponse> {
    const res = await fetch(`${this.baseUrl}/triage/sender-rules/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.status === 204) return { success: true };
    if (res.status === 404) return { success: false, error: 'Not found' };
    const data = await res.json().catch(() => ({}));
    return { success: false, error: (data as any).error || 'Request failed' };
  }

  async getAutoDeletePreview(): Promise<ApiResponse<{ count: number }>> {
    return this.request('/triage/auto-delete-preview');
  }

  async executeAutoDelete(): Promise<ApiResponse<{ archived: number }>> {
    return this.request('/triage/execute-auto-delete', { method: 'POST' });
  }

  async undoLastArchive(): Promise<ApiResponse<{ restored: number }>> {
    return this.request('/triage/undo-last-archive', { method: 'POST' });
  }

  // Unsubscribe endpoints
  async getUnsubscribeMethods(emailId: number): Promise<ApiResponse<any[]>> {
    return this.request(`/unsubscribe/${emailId}`);
  }

  async executeUnsubscribe(
    methodId: number,
    emailId: number
  ): Promise<ApiResponse> {
    return this.request('/unsubscribe/execute', {
      method: 'POST',
      body: JSON.stringify({ methodId, emailId }),
    });
  }

  // Stats endpoints
  async getDashboardStats(): Promise<ApiResponse<any>> {
    return this.request('/stats/overview');
  }

  async getActionLog(limit = 100): Promise<ApiResponse<any[]>> {
    return this.request(`/stats/actions?limit=${limit}`);
  }

  async getSenderStats(limit = 20): Promise<ApiResponse<any[]>> {
    return this.request(`/stats/senders?limit=${limit}`);
  }
}

export const api = new ApiClient();
