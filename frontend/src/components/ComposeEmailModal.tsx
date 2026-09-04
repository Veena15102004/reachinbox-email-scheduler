import { useState, useEffect, useRef } from "react";
import { X, Upload } from "lucide-react";
import { senderApi, emailApi } from "../services/api";
import { parseEmailFile } from "../utils/parseEmails";
import { useToast } from "../context/ToastContext";
import type { Sender } from "../types";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ComposeEmailModal({ onClose, onSuccess }: Props) {
  const { addToast } = useToast();
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [startTime, setStartTime] = useState("");
  const [delay, setDelay] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [parsedCount, setParsedCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCreateSender, setShowCreateSender] = useState(false);
  const [newSenderEmail, setNewSenderEmail] = useState("");
  const [newSenderName, setNewSenderName] = useState("");
  const [creatingSender, setCreatingSender] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    senderApi.list().then((res) => {
      setSenders(res.data.senders);
      if (res.data.senders.length > 0) setSenderId(res.data.senders[0].id);
    });
  }, []);

  const handleCreateSender = async () => {
    if (!newSenderEmail.trim() || !newSenderName.trim()) {
      addToast("error", "Email and display name are required");
      return;
    }
    setCreatingSender(true);
    try {
      const res = await senderApi.create({
        email: newSenderEmail.trim(),
        displayName: newSenderName.trim(),
      });
      setSenders((prev) => [...prev, res.data.sender]);
      setSenderId(res.data.sender.id);
      setShowCreateSender(false);
      setNewSenderEmail("");
      setNewSenderName("");
      addToast("success", "Sender created successfully!");
    } catch (err: any) {
      addToast("error", err.response?.data?.error || "Failed to create sender");
    } finally {
      setCreatingSender(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const result = parseEmailFile(content);
      setRecipients(result.valid);
      setParsedCount(result.valid.length);
      setInvalidCount(result.invalid);
      setDuplicateCount(result.duplicates);
      if (result.valid.length === 0) {
        addToast("error", "No valid email addresses found in file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleRemoveRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((e) => e !== email));
    setParsedCount((c) => c - 1);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!senderId) errs.sender = "Sender is required";
    if (!subject.trim()) errs.subject = "Subject is required";
    if (!body.trim()) errs.body = "Body is required";
    if (!startTime) errs.startTime = "Start time is required";
    else if (new Date(startTime) <= new Date())
      errs.startTime = "Start time must be in the future";
    if (recipients.length === 0) errs.recipients = "At least one recipient required";
    if (delay < 2000) errs.delay = "Minimum delay is 2000ms";
    if (hourlyLimit < 1) errs.hourlyLimit = "Must be at least 1";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("senderId", senderId);
      formData.append("subject", subject);
      formData.append("body", body);
      formData.append("startTime", new Date(startTime).toISOString());
      formData.append("delayBetweenEmails", delay.toString());
      formData.append("hourlyLimit", hourlyLimit.toString());
      formData.append("recipients", JSON.stringify(recipients));

      await emailApi.schedule(formData);
      onSuccess();
    } catch (err: any) {
      addToast(
        "error",
        err.response?.data?.error || "Failed to schedule emails"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            New Email Campaign
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sender
            </label>
            <select
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              {senders.length === 0 && (
                <option value="">No senders available</option>
              )}
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName} &lt;{s.email}&gt;
                </option>
              ))}
            </select>
            {senders.length === 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-2">
                  Create a sender to start scheduling emails. A real Ethereal
                  test account is generated automatically.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreateSender(true)}
                  className="w-full py-2 text-sm font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg border border-brand-200 transition-colors"
                >
                  + Create Sender
                </button>
                {showCreateSender && (
                  <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                    <div>
                      <input
                        type="email"
                        value={newSenderEmail}
                        onChange={(e) => setNewSenderEmail(e.target.value)}
                        placeholder="Sender email (e.g. hello@company.com)"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={newSenderName}
                        onChange={(e) => setNewSenderName(e.target.value)}
                        placeholder="Display name (e.g. Acme Sales)"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCreateSender}
                        disabled={creatingSender}
                        className="flex-1 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50"
                      >
                        {creatingSender ? "Creating..." : "Create"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateSender(false)}
                        className="px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {errors.sender && (
              <p className="text-red-500 text-xs mt-1">{errors.sender}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            {errors.subject && (
              <p className="text-red-500 text-xs mt-1">{errors.subject}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Use {{email}} as placeholder for recipient email"
              rows={5}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
            />
            {errors.body && (
              <p className="text-red-500 text-xs mt-1">{errors.body}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recipients
            </label>
            <label
              htmlFor="recipients-file"
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-brand-300 hover:bg-brand-50 transition-colors cursor-pointer block"
            >
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-600">
                {parsedCount > 0
                  ? `${parsedCount} emails loaded`
                  : "Upload CSV or TXT file"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Or paste comma-separated emails in the body
              </p>
            </label>
            <input
              id="recipients-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.tsv"
              onChange={handleFileChange}
              className="sr-only"
            />
            {parsedCount > 0 && (
              <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                <span className="text-green-600">{parsedCount} valid</span>
                {invalidCount > 0 && (
                  <span className="text-red-500">{invalidCount} invalid</span>
                )}
                {duplicateCount > 0 && (
                  <span className="text-amber-500">
                    {duplicateCount} duplicates removed
                  </span>
                )}
              </div>
            )}
            {recipients.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {recipients.slice(0, 20).map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-600"
                  >
                    {email}
                    <button
                      onClick={() => handleRemoveRecipient(email)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {recipients.length > 20 && (
                  <span className="text-xs text-gray-400">
                    +{recipients.length - 20} more
                  </span>
                )}
              </div>
            )}
            {errors.recipients && (
              <p className="text-red-500 text-xs mt-1">{errors.recipients}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              {errors.startTime && (
                <p className="text-red-500 text-xs mt-1">{errors.startTime}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Delay (ms)
              </label>
              <input
                type="number"
                value={delay}
                onChange={(e) => setDelay(parseInt(e.target.value) || 0)}
                min={2000}
                step={1000}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              {errors.delay && (
                <p className="text-red-500 text-xs mt-1">{errors.delay}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hourly Limit
            </label>
            <input
              type="number"
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(parseInt(e.target.value) || 0)}
              min={1}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            {errors.hourlyLimit && (
              <p className="text-red-500 text-xs mt-1">{errors.hourlyLimit}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-colors disabled:opacity-50"
          >
            {submitting ? "Scheduling..." : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
