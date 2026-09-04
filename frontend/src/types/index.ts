export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  createdAt: string;
}

export interface Sender {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface EmailCampaign {
  id: string;
  userId: string;
  subject: string;
  body: string;
  startTime: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
  createdAt: string;
}

export interface Email {
  id: string;
  campaignId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt: string | null;
  status: "SCHEDULED" | "PROCESSING" | "SENT" | "FAILED";
  attempts: number;
  errorMessage: string | null;
  previewUrl: string | null;
  bullJobId: string | null;
  createdAt: string;
  campaign?: EmailCampaign;
  sender?: Sender;
}

export interface PaginatedResponse<T> {
  emails: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SearchResults {
  results: any[];
  total: number;
}

export interface SlackStatus {
  connected: boolean;
  connection: {
    teamId: string;
    teamName: string;
    createdAt: string;
  } | null;
}

export interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}
