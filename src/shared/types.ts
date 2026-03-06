// Shared types used across server and client

export interface User {
  id: number;
  email: string;
  name?: string;
  picture?: string;
  created_at: string;
  updated_at: string;
}

export interface Email {
  id: number;
  gmail_id: string;
  thread_id: string;
  subject: string;
  from_email: string;
  from_name?: string;
  to_email: string;
  date: string;
  snippet: string;
  is_promotional: boolean;
  is_read: boolean;
  has_attachments: boolean;
  labels: string[];
  created_at: string;
}

export interface UnsubscribeMethod {
  id: number;
  email_id: number;
  method_type: 'one-click' | 'https' | 'mailto';
  url?: string;
  email_address?: string;
  confidence: number;
  status: 'detected' | 'pending' | 'completed' | 'failed';
  created_at: string;
  executed_at?: string;
}

export interface TriageItem {
  id: number;
  email_id: number;
  action_type: 'archive' | 'unsubscribe' | 'archive_and_unsubscribe' | 'review';
  confidence_score: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  created_at: string;
  updated_at: string;
  // Joined fields
  email?: Email;
  unsubscribe_method?: UnsubscribeMethod;
}

export interface ActionLog {
  id: number;
  user_id: number;
  action_type: string;
  target_type: string;
  target_id: string;
  status: 'success' | 'failed';
  error_message?: string;
  metadata?: string;
  created_at: string;
}

export interface SenderStats {
  id: number;
  sender_email: string;
  sender_name?: string;
  total_emails: number;
  promotional_count: number;
  archived_count: number;
  unsubscribed: boolean;
  last_email_date: string;
  created_at: string;
  updated_at: string;
}

export interface ScanProgress {
  total: number;
  processed: number;
  promotional: number;
  withUnsubscribe: number;
  currentBatch: number;
}

export interface DashboardStats {
  totalScanned: number;
  totalArchived: number;
  totalUnsubscribed: number;
  pendingTriage: number;
  topSenders: Array<{
    email: string;
    name?: string;
    count: number;
  }>;
  spaceSavedMB: number;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
  messageListVisibility?: string;
  labelListVisibility?: string;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
