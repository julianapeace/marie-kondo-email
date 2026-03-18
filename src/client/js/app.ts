import { api } from './api-client';

// Main App Class
class MarieKondoEmailApp {
  private currentView = 'dashboard';
  private selectedTriageIds: Set<number> = new Set();
  private undoArchiveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private undoBannerEl: HTMLElement | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    this.setupEventListeners();
    await this.checkAuthStatus();
  }

  private setupEventListeners() {
    // Login button
    const loginBtn = document.getElementById('login-btn');
    loginBtn?.addEventListener('click', () => this.handleLogin());

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn?.addEventListener('click', () => this.handleLogout());

    // Navigation
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const view = target.dataset.view;
        if (view) this.switchView(view);
      });
    });

    // Scan button
    const scanBtn = document.getElementById('scan-btn');
    scanBtn?.addEventListener('click', () => this.handleScan());

    // Bulk approve button
    const bulkApproveBtn = document.getElementById('bulk-approve-btn');
    bulkApproveBtn?.addEventListener('click', () => this.handleBulkApprove());

    // Delete all auto-delete button
    const executeAutoDeleteBtn = document.getElementById('execute-auto-delete-btn');
    executeAutoDeleteBtn?.addEventListener('click', () => this.handleExecuteAutoDelete());

    // Sender rules
    document.getElementById('sender-rule-add-btn')?.addEventListener('click', () => this.handleAddSenderRule());
    document.getElementById('sender-rules-list')?.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-delete-rule-id]');
      if (target) this.handleDeleteSenderRule(Number((target as HTMLElement).dataset.deleteRuleId));
    });

    // Confirm archive modal
    const confirmArchiveModal = document.getElementById('confirm-archive-modal');
    const confirmArchiveCancel = document.getElementById('confirm-archive-cancel');
    const confirmArchiveConfirm = document.getElementById('confirm-archive-confirm');
    const confirmArchiveOverlay = confirmArchiveModal?.querySelector('.modal-overlay');
    confirmArchiveCancel?.addEventListener('click', () => this.closeConfirmArchiveModal());
    confirmArchiveConfirm?.addEventListener('click', () => this.handleConfirmArchiveConfirm());
    confirmArchiveOverlay?.addEventListener('click', () => this.closeConfirmArchiveModal());

    // Check for auth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      this.showToast('Successfully logged in!', 'success');
      window.history.replaceState({}, '', '/');
    } else if (params.get('auth') === 'error') {
      this.showToast('Login failed. Please try again.', 'error');
      window.history.replaceState({}, '', '/');
    }
  }

  private async checkAuthStatus() {
    const response = await api.getAuthStatus();

    if (response.success && response.data?.authenticated) {
      this.showMainScreen(response.data.user);
      this.loadDashboard();
    } else {
      this.showLoginScreen();
    }
  }

  private async handleLogin() {
    const response = await api.getAuthUrl();

    if (response.success && response.data?.authUrl) {
      window.location.href = response.data.authUrl;
    } else {
      this.showToast('Failed to initiate login', 'error');
    }
  }

  private async handleLogout() {
    const response = await api.logout();

    if (response.success) {
      this.showLoginScreen();
      this.showToast('Logged out successfully', 'success');
    } else {
      this.showToast('Logout failed', 'error');
    }
  }

  private showLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    const mainScreen = document.getElementById('main-screen');
    const userInfo = document.getElementById('user-info');

    loginScreen?.classList.add('active');
    mainScreen?.classList.remove('active');
    if (userInfo) userInfo.style.display = 'none';
  }

  private showMainScreen(user: any) {
    const loginScreen = document.getElementById('login-screen');
    const mainScreen = document.getElementById('main-screen');
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar') as HTMLImageElement;

    loginScreen?.classList.remove('active');
    mainScreen?.classList.add('active');

    if (userInfo) userInfo.style.display = 'flex';
    if (userName) userName.textContent = user.name || user.email;
    if (userAvatar && user.picture) userAvatar.src = user.picture;
  }

  private switchView(view: string) {
    this.currentView = view;

    // Update navigation
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach((btn) => {
      btn.classList.remove('active');
      if ((btn as HTMLElement).dataset.view === view) {
        btn.classList.add('active');
      }
    });

    // Update views
    const views = document.querySelectorAll('.view');
    views.forEach((v) => v.classList.remove('active'));

    const currentView = document.getElementById(`${view}-view`);
    currentView?.classList.add('active');

    // Load view data
    switch (view) {
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'triage':
        this.loadSenderRules();
        this.loadTriageQueue();
        break;
      case 'emails':
        this.loadEmails();
        break;
      case 'senders':
        this.loadSenders();
        break;
    }
  }

  private async handleScan() {
    const scanBtn = document.getElementById('scan-btn') as HTMLButtonElement;
    const scanProgress = document.getElementById('scan-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    scanBtn.disabled = true;
    scanBtn.textContent = 'Scanning...';
    if (scanProgress) scanProgress.style.display = 'block';

    try {
      await api.scanEmails(undefined, 500, (progress) => {
        if (progress.status === 'running') {
          const percent = (progress.processed / progress.total) * 100;
          if (progressFill) progressFill.style.width = `${percent}%`;
          if (progressText) {
            progressText.textContent = `Processed ${progress.processed}/${progress.total} emails | ${progress.promotional} promotional | ${progress.withUnsubscribe} with unsubscribe`;
          }
        } else if (progress.status === 'done' || progress.status === 'completed') {
          this.showToast('Scan completed successfully!', 'success');
          this.loadDashboard();
          this.loadTriageQueue();
        } else if (progress.status === 'error') {
          this.showToast(`Scan failed: ${progress.error}`, 'error');
        }
      });
    } catch (error) {
      this.showToast('Scan failed', 'error');
      console.error('Scan error:', error);
    } finally {
      scanBtn.disabled = false;
      scanBtn.textContent = 'Scan Emails';
      if (scanProgress) scanProgress.style.display = 'none';
    }
  }

  private async loadDashboard() {
    const response = await api.getDashboardStats();

    if (response.success && response.data) {
      const stats = response.data;

      const setStatValue = (id: string, value: number) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value.toString();
      };

      setStatValue('stat-scanned', stats.totalScanned);
      setStatValue('stat-archived', stats.totalArchived);
      setStatValue('stat-unsubscribed', stats.totalUnsubscribed);
      setStatValue('stat-pending', stats.pendingTriage);

      // Top senders
      this.renderTopSenders(stats.topSenders || []);
    }
  }

  private renderTopSenders(senders: any[]) {
    const list = document.getElementById('top-senders-list');
    if (!list) return;

    if (senders.length === 0) {
      list.innerHTML = '<p class="loading">No senders yet. Scan emails first.</p>';
      return;
    }

    list.innerHTML = senders
      .slice(0, 5)
      .map(
        (sender) => `
      <div class="sender-item">
        <div>
          <div class="sender-name">${sender.name || sender.email}</div>
          <div class="sender-email">${sender.email}</div>
        </div>
        <div class="sender-count">${sender.count}</div>
      </div>
    `
      )
      .join('');
  }

  private async loadSenderRules() {
    const list = document.getElementById('sender-rules-list');
    if (!list) return;

    const response = await api.getSenderRules();
    if (!response.success || !Array.isArray(response.data)) {
      list.innerHTML = '<li class="loading">Failed to load rules.</li>';
      return;
    }

    const rules = response.data as { id: number; kind: string; value: string }[];
    const kindLabel = (k: string) => (k === 'allowlist' ? 'Allowlist' : 'Blocklist');
    if (rules.length === 0) {
      list.innerHTML = '<li class="sender-rules-empty">No rules yet. Add one below.</li>';
      return;
    }

    list.innerHTML = rules
      .map(
        (r) =>
          `<li class="sender-rule-row">
            <span class="sender-rule-kind-label">${kindLabel(r.kind)}</span>
            <span class="sender-rule-value">${this.escapeHtml(r.value)}</span>
            <button type="button" class="btn btn-danger btn-sm sender-rule-delete" data-delete-rule-id="${r.id}" title="Delete">Delete</button>
          </li>`
      )
      .join('');
  }

  private escapeHtml(s: string): string {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  private async handleAddSenderRule() {
    const valueInput = document.getElementById('sender-rule-value') as HTMLInputElement;
    const kindSelect = document.getElementById('sender-rule-kind') as HTMLSelectElement;
    const value = valueInput?.value?.trim() || '';
    if (!value) {
      this.showToast('Enter an email or @domain', 'info');
      return;
    }
    const kind = kindSelect?.value || 'allowlist';
    const response = await api.createSenderRule({ kind, value });
    if (response.success) {
      this.showToast('Rule added', 'success');
      valueInput.value = '';
      await this.loadSenderRules();
      this.loadTriageQueue();
    } else {
      this.showToast(response.error || 'Failed to add rule', 'error');
    }
  }

  private async handleDeleteSenderRule(id: number) {
    const response = await api.deleteSenderRule(id);
    if (response.success) {
      this.showToast('Rule removed', 'success');
      await this.loadSenderRules();
    } else {
      this.showToast(response.error || 'Failed to delete rule', 'error');
    }
  }

  private async loadTriageQueue() {
    const queue = document.getElementById('triage-queue');
    if (!queue) return;

    queue.innerHTML = '<p class="loading">Loading...</p>';

    const response = await api.getTriageQueue();

    if (!response.success || !Array.isArray(response.data)) {
      queue.innerHTML = `<p class="loading">${response.error || 'Failed to load triage queue.'}</p>`;
      return;
    }

    if (response.data.length === 0) {
      queue.innerHTML =
        '<p class="loading">No pending triage items. Scan emails to generate suggestions.</p>';
      return;
    }

    queue.innerHTML = response.data
        .map(
          (item: any) => `
        <div class="triage-item">
          <input type="checkbox" class="triage-checkbox" data-id="${item.id}">
          <div class="triage-info">
            <div class="triage-subject">${item.subject || '(No subject)'}</div>
            <div class="triage-from">${item.from_name || item.from_email}</div>
            <span class="triage-action ${item.action_type}">${this.formatActionType(
            item.action_type
          )}</span>
            <div class="triage-reason">${item.reason}</div>
          </div>
          <div class="triage-score">${item.confidence_score}</div>
          <div class="triage-actions">
            <button class="btn btn-success btn-sm" onclick="app.approveTriage(${
              item.id
            })">Approve</button>
            <button class="btn btn-secondary btn-sm" onclick="app.rejectTriage(${
              item.id
            })">Reject</button>
          </div>
        </div>
      `
        )
        .join('');

      // Add checkbox listeners
      const checkboxes = document.querySelectorAll('.triage-checkbox');
      checkboxes.forEach((cb) => {
        cb.addEventListener('change', (e) => {
          const target = e.target as HTMLInputElement;
          const id = parseInt(target.dataset.id || '0');
          if (target.checked) {
            this.selectedTriageIds.add(id);
          } else {
            this.selectedTriageIds.delete(id);
          }
        });
      });
  }

  private formatActionType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  async approveTriage(id: number) {
    const response = await api.approveTriage(id);

    if (response.success) {
      this.showToast('Triage item approved', 'success');
      this.loadTriageQueue();
      this.loadDashboard();
    } else {
      this.showToast(response.error || 'Failed to approve', 'error');
    }
  }

  async rejectTriage(id: number) {
    const response = await api.rejectTriage(id);

    if (response.success) {
      this.showToast('Triage item rejected', 'info');
      this.loadTriageQueue();
    } else {
      this.showToast(response.error || 'Failed to reject', 'error');
    }
  }

  private async handleBulkApprove() {
    if (this.selectedTriageIds.size === 0) {
      this.showToast('No items selected', 'info');
      return;
    }

    const ids = Array.from(this.selectedTriageIds);
    const response = await api.bulkApproveTriage(ids);

    if (response.success) {
      this.showToast(`Marked ${ids.length} items for deletion`, 'success');
      this.selectedTriageIds.clear();
      this.loadTriageQueue();
      this.loadDashboard();
    } else {
      this.showToast(response.error || 'Bulk approve failed', 'error');
    }
  }

  private async handleExecuteAutoDelete() {
    const btn = document.getElementById('execute-auto-delete-btn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Checking...';
    }
    try {
      const response = await api.getAutoDeletePreview();
      if (!response.success) {
        this.showToast(response.error || 'Failed to get preview', 'error');
        return;
      }
      const count = response.data?.count ?? 0;
      if (count === 0) {
        this.showToast('No emails labeled for auto-delete', 'info');
        return;
      }
      this.openConfirmArchiveModal(count);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Delete all auto-delete';
      }
    }
  }

  private openConfirmArchiveModal(count: number) {
    const modal = document.getElementById('confirm-archive-modal');
    const countEl = document.getElementById('confirm-archive-count');
    const btnCountEl = document.getElementById('confirm-archive-btn-count');
    if (countEl) countEl.textContent = count.toString();
    if (btnCountEl) btnCountEl.textContent = count.toString();
    modal?.classList.remove('hidden');
  }

  private closeConfirmArchiveModal() {
    document.getElementById('confirm-archive-modal')?.classList.add('hidden');
  }

  private dismissUndoBanner() {
    if (this.undoArchiveTimeoutId !== null) {
      clearTimeout(this.undoArchiveTimeoutId);
      this.undoArchiveTimeoutId = null;
    }
    this.undoBannerEl?.remove();
    this.undoBannerEl = null;
  }

  private showUndoBanner(archived: number) {
    this.dismissUndoBanner();
    const container = document.getElementById('toast-container');
    if (!container) return;

    const banner = document.createElement('div');
    banner.className = 'toast success toast-undo';
    banner.innerHTML = `Archived ${archived} email(s). <button type="button" class="toast-undo-btn">Undo</button>`;

    const undoBtn = banner.querySelector('.toast-undo-btn');
    undoBtn?.addEventListener('click', () => this.handleUndoArchive());

    container.appendChild(banner);
    this.undoBannerEl = banner;

    this.undoArchiveTimeoutId = setTimeout(() => {
      this.dismissUndoBanner();
    }, 60000);
  }

  private async handleUndoArchive() {
    this.dismissUndoBanner();
    const response = await api.undoLastArchive();
    if (response.success && response.data?.restored !== undefined) {
      this.showToast(`Restored ${response.data.restored} to inbox`, 'success');
      this.loadDashboard();
    } else {
      this.showToast(response.error || 'Undo failed', 'error');
    }
  }

  private async handleConfirmArchiveConfirm() {
    this.closeConfirmArchiveModal();
    const btn = document.getElementById('execute-auto-delete-btn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Archiving...';
    }
    try {
      const response = await api.executeAutoDelete();
      if (response.success && response.data?.archived !== undefined) {
        if (response.data.archived === 0) {
          this.showToast('No emails labeled for auto-delete', 'success');
        } else {
          this.showUndoBanner(response.data.archived);
        }
        this.loadDashboard();
      } else {
        this.showToast(response.error || 'Failed to execute auto-delete', 'error');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Delete all auto-delete';
      }
    }
  }

  private async loadEmails() {
    const list = document.getElementById('emails-list');
    if (!list) return;

    list.innerHTML = '<p class="loading">Loading...</p>';

    const response = await api.getEmails();

    if (response.success && response.data) {
      if (response.data.length === 0) {
        list.innerHTML = '<p class="loading">No emails yet. Scan to get started.</p>';
        return;
      }

      list.innerHTML = response.data
        .map(
          (email: any) => `
        <div class="email-item">
          <div>
            <div class="email-subject">${email.subject || '(No subject)'}</div>
            <div class="email-from">${email.from_name || email.from_email}</div>
            <div class="email-date">${new Date(email.date).toLocaleDateString()}</div>
          </div>
          <div>
            ${email.is_promotional ? '<span class="badge badge-promotional">Promotional</span>' : ''}
          </div>
        </div>
      `
        )
        .join('');
    }
  }

  private async loadSenders() {
    const list = document.getElementById('senders-list');
    if (!list) return;

    list.innerHTML = '<p class="loading">Loading...</p>';

    const response = await api.getSenderStats();

    if (response.success && response.data) {
      if (response.data.length === 0) {
        list.innerHTML = '<p class="loading">No senders yet.</p>';
        return;
      }

      list.innerHTML = response.data
        .map(
          (sender: any) => `
        <div class="sender-item">
          <div>
            <div class="sender-name">${sender.sender_name || sender.sender_email}</div>
            <div class="sender-email">${sender.sender_email}</div>
            <div style="font-size: 12px; color: #999; margin-top: 5px;">
              Total: ${sender.total_emails} | Promotional: ${sender.promotional_count} | Archived: ${sender.archived_count}
            </div>
          </div>
          <div class="sender-count">${sender.total_emails}</div>
        </div>
      `
        )
        .join('');
    }
  }

  private showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

// Initialize app when DOM is ready
let app: MarieKondoEmailApp;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app = new MarieKondoEmailApp();
    (window as any).app = app;
  });
} else {
  app = new MarieKondoEmailApp();
  (window as any).app = app;
}
