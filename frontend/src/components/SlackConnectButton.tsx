import { MessageSquare, Check } from "lucide-react";
import { slackApi } from "../services/api";

interface Props {
  connected: boolean;
  onStatusChange: (connected: boolean) => void;
}

export default function SlackConnectButton({
  connected,
  onStatusChange,
}: Props) {
  const handleConnect = () => {
    window.location.href = "/api/slack/connect";
  };

  const handleDisconnect = async () => {
    try {
      await slackApi.disconnect();
      onStatusChange(false);
    } catch {}
  };

  if (connected) {
    return (
      <button
        onClick={handleDisconnect}
        className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
      >
        <Check className="h-3.5 w-3.5" />
        Slack Connected
      </button>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors"
    >
      <MessageSquare className="h-3.5 w-3.5" />
      Connect Slack
    </button>
  );
}
