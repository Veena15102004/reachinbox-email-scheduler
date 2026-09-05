import { useState, useEffect } from "react";
import {
  Mail,
  ExternalLink,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { emailApi } from "../services/api";
import type { Email } from "../types";

interface EmailTableProps {
  type: "scheduled" | "sent";
}

export default function EmailTable({ type }: EmailTableProps) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [type]);

  useEffect(() => {
    const fetchEmails = async () => {
      setLoading(true);
      setError(null);
      try {
        const apiCall =
          type === "scheduled" ? emailApi.getScheduled : emailApi.getSent;
        const res = await apiCall(page, 15);
        setEmails(res.data.emails);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      } catch (err: any) {
        setError(err.response?.data?.error || "Failed to load emails");
      } finally {
        setLoading(false);
      }
    };
    fetchEmails();
  }, [type, page]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "SENT":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "FAILED":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "PROCESSING":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      SCHEDULED: "bg-amber-50 text-amber-700 border-amber-200",
      PROCESSING: "bg-blue-50 text-blue-700 border-blue-200",
      SENT: "bg-green-50 text-green-700 border-green-200",
      FAILED: "bg-red-50 text-red-700 border-red-200",
    };
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || ""}`}
      >
        {statusIcon(status)}
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse flex gap-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/6"></div>
            <div className="h-4 bg-gray-200 rounded w-1/6"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-12 text-center">
        <AlertCircle className="h-12 w-12 text-red-300 mx-auto mb-4" />
        <p className="text-red-600 font-medium">{error}</p>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="p-12 text-center">
        <Mail className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">No {type} emails</p>
        <p className="text-gray-400 text-sm mt-1">
          {type === "scheduled"
            ? "Create a new campaign to get started"
            : "Sent emails will appear here"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Recipient
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Subject
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {type === "scheduled" ? "Scheduled" : "Sent"}
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Status
              </th>
              {type === "sent" && (
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Preview
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {emails.map((email) => (
              <tr
                key={email.id}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4 text-sm text-gray-900">
                  {email.recipient}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-xs">
                  {email.subject}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(
                    type === "scheduled"
                      ? email.scheduledAt
                      : email.sentAt || email.createdAt
                  ).toLocaleString()}
                </td>
                <td className="px-6 py-4">{statusBadge(email.status)}</td>
                {type === "sent" && (
                  <td className="px-6 py-4">
                    {email.previewUrl &&
                    email.sentAt &&
                    Date.now() - new Date(email.sentAt).getTime() < 48 * 60 * 60 * 1000 ? (
                      <a
                        href={email.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Preview
                      </a>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * 15 + 1}-{Math.min(page * 15, total)} of{" "}
            {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
