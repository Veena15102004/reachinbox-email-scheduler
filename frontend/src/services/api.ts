import axios from "axios";
import type {
  User,
  Sender,
  Email,
  EmailCampaign,
  PaginatedResponse,
  SearchResults,
  SlackStatus,
} from "../types";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  getMe: () => api.get<{ user: User }>("/auth/me"),
  logout: () => api.post("/auth/logout"),
};

export const senderApi = {
  list: () => api.get<{ senders: Sender[] }>("/senders"),
  create: (data: { email: string; displayName: string }) =>
    api.post<{ sender: Sender }>("/senders", data),
  delete: (id: string) => api.delete(`/senders/${id}`),
};

export const emailApi = {
  schedule: (data: FormData) =>
    api.post<{ campaign: EmailCampaign; emailsCreated: number }>("/emails/schedule", data, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  getScheduled: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<Email>>("/emails/scheduled", { params: { page, limit } }),
  getSent: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<Email>>("/emails/sent", { params: { page, limit } }),
  getById: (id: string) => api.get<{ email: Email }>(`/emails/${id}`),
  search: (q: string, page = 1, limit = 20) =>
    api.get<SearchResults>("/emails/search", { params: { q, page, limit } }),
};

export const slackApi = {
  getStatus: () => api.get<SlackStatus>("/slack/status"),
  disconnect: () => api.post("/slack/disconnect"),
};

export default api;
