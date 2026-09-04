import { useState } from "react";
import { Mail, LogOut, Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import EmailTable from "../components/EmailTable";
import ComposeEmailModal from "../components/ComposeEmailModal";
import SearchBar from "../components/SearchBar";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<"scheduled" | "sent">("scheduled");
  const [showCompose, setShowCompose] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleComposeSuccess = () => {
    setShowCompose(false);
    addToast("success", "Campaign scheduled successfully!");
    setRefreshKey((k) => k + 1);
    setActiveTab("scheduled");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-brand-100 p-2 rounded-lg">
                <Mail className="h-5 w-5 text-brand-600" />
              </div>
              <span className="font-bold text-lg text-gray-900">ReachInbox</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                {user?.avatar && (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-8 w-8 rounded-full"
                  />
                )}
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.name}
                  </p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Email Campaigns
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Manage your scheduled and sent emails
            </p>
          </div>
          <button
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors font-medium text-sm shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Campaign
          </button>
        </div>

        <SearchBar />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mt-6">
          <div className="border-b border-gray-200">
            <div className="flex gap-0">
              <button
                onClick={() => setActiveTab("scheduled")}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "scheduled"
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Scheduled Emails
              </button>
              <button
                onClick={() => setActiveTab("sent")}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "sent"
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Sent Emails
              </button>
            </div>
          </div>

          <EmailTable key={refreshKey} type={activeTab} />
        </div>
      </main>

      {showCompose && (
        <ComposeEmailModal
          onClose={() => setShowCompose(false)}
          onSuccess={handleComposeSuccess}
        />
      )}
    </div>
  );
}
