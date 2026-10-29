"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Copy,
  AlertCircle,
  Clock,
  Layers,
  MapPin,
  Calendar,
  Send,
  ChevronRight,
  Upload,
  X,
} from "lucide-react";
import { T, useT } from "@/components/ui/T";
import { AiChip } from "@/components/ai/AiChip";
import { AttributeFields } from "@/components/attributes/AttributeFields";
import { getDhakaDateString } from "@/lib/dates";

interface Category {
  id: string;
  slug: string;
  attributeSchema: any;
  defaultUnits: string[];
}

const DHAKA_AREAS = [
  "Mirpur",
  "Dhanmondi",
  "Mohammadpur",
  "Uttara",
  "Gulshan",
  "Chawkbazar",
  "Motijheel",
  "Banani",
  "Tejgaon",
  "Badda",
  "OldDhaka",
];

export default function NewRequestPage() {
  const t = useT();
  const router = useRouter();

  // Mode: "AI_ENTRY" | "WIZARD" | "SUCCESS"
  const [mode, setMode] = useState<"AI_ENTRY" | "WIZARD" | "SUCCESS">("AI_ENTRY");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartedAtRef = useRef<number>(0);

  // AI Assistant text input
  const [aiText, setAiText] = useState("");
  const [aiInteractionId, setAiInteractionId] = useState<string | null>(null);
  // AI-filled values as first shown, to record which fields the buyer edited (§8.4)
  const [aiSnapshot, setAiSnapshot] = useState<Record<string, string> | null>(null);
  // Set when the buyer abandons an AI prefill for the manual form (outcome DISCARDED)
  const [discardedAiId, setDiscardedAiId] = useState<string | null>(null);
  // One idempotency key per wizard session so a double tap never creates two requests
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  );
  const [repeatOfRequestId, setRepeatOfRequestId] = useState<string | null>(null);
  // From a search card: "Request a quote" prefills the category; optionally only that supplier (§8.13)
  const [directSupplier, setDirectSupplier] = useState<{ id: string; name: string } | null>(null);
  const [onlyDirectSupplier, setOnlyDirectSupplier] = useState(true);
  const [aiPrefilledKeys, setAiPrefilledKeys] = useState<Set<string>>(new Set());
  const [uncertainFields, setUncertainFields] = useState<string[]>([]);
  const [questions, setQuestions] = useState<
    Array<{ field: string; question: string; options?: string[] }>
  >([]);

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [title, setTitle] = useState("");
  const [attributes, setAttributes] = useState<Record<string, any>>({});
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [neededByChip, setNeededByChip] = useState("tomorrow");
  const [customNeededByDate, setCustomNeededByDate] = useState("");
  const [deliveryArea, setDeliveryArea] = useState("Mirpur");
  const [preferredPaymentTerm, setPreferredPaymentTerm] = useState("CASH_ON_DELIVERY");
  const [priority, setPriority] = useState("BALANCED");
  const [budgetNote, setBudgetNote] = useState("");
  const [quoteWindowHours, setQuoteWindowHours] = useState(48);
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [createdRequest, setCreatedRequest] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data);
          setSelectedCategory((curr) => {
            if (curr) return curr;
            const def = data.find((c: any) => c.slug === "containers") || data[0];
            if (def && def.defaultUnits?.[0]) setUnit(def.defaultUnits[0]);
            if (def?.attributeSchema?.fields) {
              const defaults: Record<string, any> = {};
              for (const f of def.attributeSchema.fields) {
                if (f.required && f.type === "select" && f.options?.length) {
                  defaults[f.key] = f.options[0];
                }
              }
              setAttributes((prev) => ({ ...defaults, ...prev }));
            }
            return def;
          });
        }
      })
      .catch((err) => console.error("Categories fetch error:", err));
  }, []);

  useEffect(() => {
    if (categories.length === 0 || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("category");
    const supplierId = params.get("supplier");
    if (slug) {
      const cat = categories.find((c) => c.slug === slug);
      if (cat) {
        setSelectedCategory(cat);
        if (cat.defaultUnits?.[0]) setUnit(cat.defaultUnits[0]);
      }
    }
    if (supplierId) setDirectSupplier({ id: supplierId, name: params.get("supplierName") || "" });
  }, [categories]);

  // "Create a new request from this" (§8.9): /requests/new?repeatOf=<code> opens the
  // wizard prefilled from the earlier request; matching runs again on send.
  useEffect(() => {
    if (categories.length === 0 || typeof window === "undefined") return;
    const repeatCode = new URLSearchParams(window.location.search).get("repeatOf");
    if (!repeatCode || repeatOfRequestId) return;
    fetch(`/api/requests/${encodeURIComponent(repeatCode)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((prev) => {
        if (!prev || prev.viewerRole !== "BUYER") return;
        const cat = categories.find((c) => c.id === prev.categoryId);
        if (cat) setSelectedCategory(cat);
        setTitle(prev.title || "");
        setAttributes(prev.attributes || {});
        setQuantity(String(Number(prev.quantity)));
        setUnit(prev.unit || "pcs");
        setDeliveryArea(prev.deliveryArea || "");
        if (prev.preferredPaymentTerm) setPreferredPaymentTerm(prev.preferredPaymentTerm);
        if (prev.priority) setPriority(prev.priority);
        setRepeatOfRequestId(prev.id);
        setMode("WIZARD");
        setStep(1);
      })
      .catch(() => {});
  }, [categories, repeatOfRequestId]);

  const uploadRequestPhoto = async (file: File) => {
    try {
      setUploadingPhoto(true);
      setPhotoError(null);
      const ticketRes = await fetch("/api/files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "image/jpeg", sizeBytes: file.size, purpose: "request_image" }),
      });
      const ticket = await ticketRes.json();
      if (!ticketRes.ok) throw new Error(ticket.error || "Failed to initialize upload");

      const targetUrl = ticket.uploadUrl.startsWith("http")
        ? new URL(ticket.uploadUrl).pathname + new URL(ticket.uploadUrl).search
        : ticket.uploadUrl;

      const put = await fetch(targetUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
      if (!put.ok) {
        const errJson = await put.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to upload photo bytes");
      }
      setImageKeys((prev) => [...prev, ticket.key].slice(0, 5));
    } catch (err: any) {
      console.error("Photo upload error:", err);
      setPhotoError(err?.message || t("common.tryAgain"));
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Voice recording handler (§8.4, A2)
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Audio recording is not supported in this browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 },
      });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        if (audioBlob.size > 2 * 1024 * 1024) {
          setFallbackNotice(t("rfq.voiceError"));
          return;
        }

        // Send to transcription API
        const durationSeconds = (Date.now() - recordingStartedAtRef.current) / 1000;
        const formData = new FormData();
        formData.append("file", audioBlob, "recording");
        formData.append("durationSeconds", String(Math.round(durationSeconds * 10) / 10));
        try {
          const res = await fetch("/api/ai/transcribe", {
            method: "POST",
            body: formData,
          });
          const json = await res.json();
          if (json.text) {
            setAiText(json.text);
          } else {
            setFallbackNotice(json.error || t("rfq.voiceError"));
          }
        } catch (err) {
          setFallbackNotice(t("rfq.voiceError"));
        }
      };

      mediaRecorder.start();
      recordingStartedAtRef.current = Date.now();
      setIsRecording(true);

      // Auto stop after 60 seconds
      recordingTimerRef.current = setTimeout(() => {
        stopRecording();
      }, 60000);
    } catch (err) {
      console.error("Recording error:", err);
      alert("Microphone permission denied or recording failed.");
    }
  };

  // Reads the recorder's own state: the 60 s auto-stop timer runs with a stale `isRecording`
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    }
  };

  // AI Assistant Submission (§8.4, A3-A6)
  const handleAiSubmit = async () => {
    if (!aiText.trim()) return;
    setLoadingAi(true);
    setFallbackNotice(null);

    try {
      const res = await fetch("/api/ai/request-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: aiText.trim(),
          buyerBusinessArea: deliveryArea,
        }),
      });
      const json = await res.json();

      if (json.fallback || !json.data) {
        setFallbackNotice(json.prohibited && json.message ? json.message : t("rfq.aiFallback"));
        setMode("WIZARD");
        setStep(1);
        return;
      }

      // Prefill wizard with AI structured response (§8.4, A4)
      const data = json.data;
      setAiInteractionId(json.aiInteractionId || null);

      const prefilled = new Set<string>();
      if (data.title) {
        setTitle(data.title);
        prefilled.add("title");
      }
      if (data.quantity) {
        setQuantity(String(data.quantity));
        prefilled.add("quantity");
      }
      if (data.unit) {
        setUnit(data.unit);
        prefilled.add("unit");
      }
      if (data.deliveryArea) {
        setDeliveryArea(data.deliveryArea);
        prefilled.add("deliveryArea");
      }
      if (data.preferredPaymentTerm) {
        setPreferredPaymentTerm(data.preferredPaymentTerm);
        prefilled.add("preferredPaymentTerm");
      }
      if (data.priority) {
        setPriority(data.priority);
        prefilled.add("priority");
      }
      if (data.neededBy) {
        setNeededByChip(chipForDate(String(data.neededBy).slice(0, 10)));
        setCustomNeededByDate(String(data.neededBy).slice(0, 10));
        prefilled.add("neededBy");
      }
      if (data.attributes) {
        setAttributes(data.attributes);
        Object.keys(data.attributes).forEach((k) => prefilled.add(`attr_${k}`));
      }

      setAiPrefilledKeys(prefilled);
      setAiSnapshot(
        snapshotFields({
          title: data.title,
          quantity: data.quantity,
          unit: data.unit,
          deliveryArea: data.deliveryArea,
          preferredPaymentTerm: data.preferredPaymentTerm,
          priority: data.priority,
          neededBy: data.neededBy,
          categorySlug: data.categorySlug,
          attributes: data.attributes,
        })
      );
      setUncertainFields(data.uncertainFields || []);
      setQuestions(data.questions || []);

      if (data.categorySlug) {
        const cat = categories.find((c) => c.slug === data.categorySlug);
        if (cat) {
          setSelectedCategory(cat);
        }
      }

      setMode("WIZARD");
      setStep(1);
    } catch (err) {
      console.error("AI Request error:", err);
      setFallbackNotice(t("rfq.aiFallback"));
      setMode("WIZARD");
      setStep(1);
    } finally {
      setLoadingAi(false);
    }
  };

  // Skip AI -> manual wizard (§8.4, A1)
  const handleFillMyself = () => {
    setMode("WIZARD");
    setStep(1);
    if (aiInteractionId) setDiscardedAiId(aiInteractionId);
    setAiInteractionId(null);
    setAiSnapshot(null);
    setAiPrefilledKeys(new Set());
    setUncertainFields([]);
    setQuestions([]);
  };

  // Submit Request (§8.5, B2, B3)
  const handleSubmitRequest = async () => {
    if (!selectedCategory) {
      setFormErrors({ category: "Please select a category" });
      setStep(1);
      return;
    }
    if (!title.trim() || title.trim().length < 5) {
      setFormErrors({ title: "Title must be at least 5 characters" });
      setStep(1);
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      setFormErrors({ quantity: "Quantity must be greater than zero" });
      setStep(2);
      return;
    }

    setSubmitting(true);
    setFormErrors({});

    let neededByIso: string | null = null;
    if (neededByChip === "today") {
      neededByIso = new Date().toISOString();
    } else if (neededByChip === "tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      neededByIso = d.toISOString();
    } else if (neededByChip === "3_days") {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      neededByIso = d.toISOString();
    } else if (neededByChip === "1_week") {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      neededByIso = d.toISOString();
    } else if (customNeededByDate) {
      neededByIso = new Date(customNeededByDate).toISOString();
    }

    const finalSnapshot = snapshotFields({
      title: title.trim(),
      quantity,
      unit,
      deliveryArea,
      preferredPaymentTerm,
      priority,
      neededBy: neededByChip === "custom" ? customNeededByDate : neededByIso,
      categorySlug: selectedCategory.slug,
      attributes,
    });
    const editedFields = aiSnapshot
      ? Object.keys({ ...aiSnapshot, ...finalSnapshot }).filter((k) => aiSnapshot[k] !== finalSnapshot[k])
      : [];

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: selectedCategory.id,
          title: title.trim(),
          attributes,
          quantity: Number(quantity),
          unit,
          neededBy: neededByIso,
          deliveryArea,
          preferredPaymentTerm,
          priority,
          budgetNote,
          imageKeys,
          quoteWindowHours,
          originalNeedText: aiText.trim() || null,
          aiInteractionId: aiInteractionId || discardedAiId,
          aiOutcome: aiInteractionId ? (editedFields.length > 0 ? "EDITED" : "ACCEPTED_AS_IS") : discardedAiId ? "DISCARDED" : undefined,
          aiEditedFields: aiInteractionId ? editedFields : [],
          repeatOfRequestId,
          directSupplierId: directSupplier && onlyDirectSupplier ? directSupplier.id : undefined,
          idempotencyKey,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setFormErrors({ general: json.error || "Failed to create request" });
        return;
      }

      setCreatedRequest(json);
      setMode("SUCCESS");
    } catch (err: any) {
      setFormErrors({ general: err.message || "Failed to create request" });
    } finally {
      setSubmitting(false);
    }
  };

  const copyShareLink = () => {
    if (!createdRequest) return;
    const shareUrl = `${window.location.origin}/requests/${createdRequest.code}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  return (
    <div className="page space-y-4 pb-12">
      {/* 1. AI Entry Screen (§8.4, A1) */}
      {mode === "AI_ENTRY" && (
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Sparkles className="w-4 h-4" />
              </span>
              <h1 className="page-title">
                <T k="rfq.aiEntryTitle" />
              </h1>
            </div>
            <p className="text-xs text-gray-500">
              <T k="home.aiSubtitle" />
            </p>
          </div>

          <div className="relative">
            <textarea
              id="ai-need-text-input"
              rows={4}
              maxLength={1000}
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder={t("rfq.aiPlaceholder")}
              className="w-full text-sm p-4 rounded-2xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none transition-all"
            />

            {/* 🎤 Voice Recording Button (§8.4, A2) */}
            <div className="absolute right-3 bottom-3 flex items-center gap-2">
              <button
                type="button"
                id="voice-record-button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`p-2.5 rounded-full transition-all flex items-center gap-1.5 text-xs font-semibold ${
                  isRecording
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                title={isRecording ? t("rfq.voiceStop") : t("rfq.voiceSpeak")}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isRecording && <span><T k="rfq.voiceListening" /></span>}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{aiText.length} / {1000}</span>
            <button
              type="button"
              onClick={handleFillMyself}
              className="text-primary font-semibold hover:underline"
            >
              <T k="rfq.fillMyself" />
            </button>
          </div>

          <button
            type="button"
            id="continue-with-ai-btn"
            disabled={!aiText.trim() || loadingAi}
            onClick={handleAiSubmit}
            className="w-full py-3.5 bg-primary text-white text-sm font-bold rounded-2xl hover:bg-primary-hover disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
          >
            {loadingAi ? (
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-spin" />
                <T k="common.loading" />
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <T k="rfq.continueWithAi" />
              </span>
            )}
          </button>
        </div>
      )}

      {/* 2. Prefilled Wizard (§8.5, B1) */}
      {mode === "WIZARD" && (
        <div className="space-y-4">
          {/* Fallback Notice if triggered */}
          {fallbackNotice && (
            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex items-start gap-2.5 text-amber-800 text-xs">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{fallbackNotice}</span>
            </div>
          )}

          {/* Stepper Navigation */}
          <div className="flex items-center justify-between px-2 text-xs font-semibold text-gray-500">
            <span className={step === 1 ? "text-primary font-bold" : ""}>
              <T k="rfq.step1" />
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <span className={step === 2 ? "text-primary font-bold" : ""}>
              <T k="rfq.step2" />
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <span className={step === 3 ? "text-primary font-bold" : ""}>
              <T k="rfq.step3" />
            </span>
          </div>

          {/* Step 1: What */}
          {step === 1 && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  <T k="listing.category" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      id={`category-tile-${cat.slug}`}
                      onClick={() => {
                        setSelectedCategory(cat);
                        if (cat.defaultUnits?.[0]) setUnit(cat.defaultUnits[0]);
                        if (cat?.attributeSchema?.fields) {
                          const defaults: Record<string, any> = {};
                          for (const f of cat.attributeSchema.fields) {
                            if (f.required && f.type === "select" && f.options?.length) {
                              defaults[f.key] = f.options[0];
                            }
                          }
                          setAttributes((prev) => ({ ...defaults, ...prev }));
                        }
                      }}
                      className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-all ${
                        selectedCategory?.slug === cat.slug
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <T k={`category.${cat.slug}`} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Title input with AI Chip */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">
                    <T k="listing.itemTitle" />
                  </label>
                  {aiPrefilledKeys.has("title") && <AiChip />}
                </div>
                <input
                  type="text"
                  id="rfq-title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("listing.titlePlaceholder")}
                  className="w-full text-sm p-3 rounded-xl border border-gray-200 focus:border-primary outline-none"
                />
              </div>

              {/* Uncertain Fields Highlighting & Clarifying Questions (§8.4, A4) */}
              {questions.length > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                    <Sparkles className="w-3.5 h-3.5" />
                    <T k="rfq.uncertainHint" />
                  </div>
                  {questions.map((q) => (
                    <div key={q.field} className="space-y-2">
                      <p className="text-xs font-semibold text-gray-800">{q.question}</p>
                      {q.options && (
                        <div className="flex flex-wrap gap-1.5">
                          {q.options.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              id={`uncertain-option-${q.field}-${opt}`}
                              onClick={() => {
                                setAttributes({ ...attributes, [q.field]: opt });
                                setUncertainFields(uncertainFields.filter((f) => f !== q.field));
                              }}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                                attributes[q.field] === opt
                                  ? "bg-primary text-white border-primary"
                                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                              }`}
                            >
                              {t(`attr.${selectedCategory?.slug ?? ""}.${q.field}.opt.${opt}`)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Dynamic Attribute Fields (§6) */}
              {selectedCategory && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-gray-700">
                      <T k="listing.attributes" />
                    </h3>
                    {Array.from(aiPrefilledKeys).some((k) => k.startsWith("attr_")) && <AiChip />}
                  </div>
                  <AttributeFields
                    categorySlug={selectedCategory.slug}
                    schema={selectedCategory.attributeSchema}
                    values={attributes}
                    onChange={(vals) => setAttributes(vals)}
                  />
                </div>
              )}

              {/* Photos (≤ 5) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700">
                  <T k="rfq.photos" />
                </label>

                {/* Thumbnails preview */}
                {imageKeys.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {imageKeys.map((k, idx) => (
                      <div key={k} className="relative group w-16 h-16 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/files/download?key=${encodeURIComponent(k)}`}
                          alt={`Uploaded ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setImageKeys((prev) => prev.filter((item) => item !== k))}
                          className="absolute top-1 end-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80 transition"
                          title="Remove"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {imageKeys.length < 5 && (
                  <div>
                    <label className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold cursor-pointer hover:bg-gray-50 transition ${uploadingPhoto ? "opacity-50 pointer-events-none" : ""}`}>
                      <Upload className="w-4 h-4 text-gray-500" />
                      <span>{uploadingPhoto ? t("common.loading") : t("rfq.photos")}</span>
                      <input
                        type="file"
                        id="rfq-photo-input"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploadingPhoto}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadRequestPhoto(file);
                          e.target.value = "";
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                {photoError && (
                  <p className="text-xs text-red-500 font-semibold">{photoError}</p>
                )}
              </div>

              {formErrors.title && (
                <p className="text-xs text-red-500 font-semibold">{formErrors.title}</p>
              )}

              <button
                type="button"
                id="rfq-next-step-1"
                onClick={() => {
                  let cat = selectedCategory;
                  if (!cat && categories.length > 0) {
                    cat = categories[0];
                    setSelectedCategory(cat);
                    if (cat.defaultUnits?.[0]) setUnit(cat.defaultUnits[0]);
                  }
                  if (!title.trim()) {
                    setFormErrors((prev) => ({ ...prev, title: t("common.required") || "Please enter product title" }));
                    return;
                  }
                  if (cat?.attributeSchema?.fields) {
                    const newAttrs = { ...attributes };
                    let changed = false;
                    for (const f of cat.attributeSchema.fields) {
                      if (f.required && f.type === "select" && f.options?.length && !newAttrs[f.key]) {
                        newAttrs[f.key] = f.options[0];
                        changed = true;
                      }
                    }
                    if (changed) setAttributes(newAttrs);
                  }
                  setFormErrors((prev) => {
                    const copy = { ...prev };
                    delete copy.title;
                    return copy;
                  });
                  setStep(2);
                }}
                className="w-full py-3 bg-primary text-white text-sm font-bold rounded-2xl hover:bg-primary-hover transition-all flex items-center justify-center gap-2"
              >
                <span><T k="rfq.step2" /></span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 2: Quantity & When */}
          {step === 2 && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-5">
              {/* Quantity + Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-700">
                      <T k="rfq.quantity" />
                    </label>
                    {aiPrefilledKeys.has("quantity") && <AiChip />}
                  </div>
                  <input
                    type="number"
                    id="rfq-quantity-input"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="500"
                    className="w-full text-sm p-3 rounded-xl border border-gray-200 focus:border-primary outline-none"
                  />
                  {formErrors.quantity && (
                    <p className="text-xs text-red-500 font-semibold">{formErrors.quantity}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">
                    <T k="rfq.unit" />
                  </label>
                  <select
                    id="rfq-unit-select"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full text-sm p-3 rounded-xl border border-gray-200 focus:border-primary outline-none bg-white"
                  >
                    {selectedCategory?.defaultUnits?.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    )) || <option value="pcs"><T k="unit.pcs" /></option>}
                  </select>
                </div>
              </div>

              {/* Needed By Chips */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">
                    <T k="rfq.neededBy" />
                  </label>
                  {aiPrefilledKeys.has("neededBy") && <AiChip />}
                </div>
                <div className="flex flex-wrap gap-2">
                  {["today", "tomorrow", "3_days", "1_week", "custom"].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      id={`needed-by-chip-${chip}`}
                      onClick={() => setNeededByChip(chip)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        neededByChip === chip
                          ? "bg-primary text-white border-primary"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                      }`}
                    >
                      <T k={`rfq.chip.${chip}`} />
                    </button>
                  ))}
                </div>
                {neededByChip === "custom" && (
                  <input
                    type="date"
                    id="rfq-needed-by-date"
                    value={customNeededByDate}
                    min={getDhakaDateString()}
                    onChange={(e) => setCustomNeededByDate(e.target.value)}
                    className="w-full text-sm p-3 rounded-xl border border-gray-200 focus:border-primary outline-none"
                  />
                )}
              </div>

              {/* Delivery Area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">
                    <T k="rfq.deliveryArea" />
                  </label>
                  {aiPrefilledKeys.has("deliveryArea") && <AiChip />}
                </div>
                <select
                  id="rfq-delivery-area-select"
                  value={deliveryArea}
                  onChange={(e) => setDeliveryArea(e.target.value)}
                  className="w-full text-sm p-3 rounded-xl border border-gray-200 focus:border-primary outline-none bg-white"
                >
                  {DHAKA_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Term Chips */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700">
                  <T k="rfq.paymentTerm" />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {["CASH_ON_DELIVERY", "ADVANCE", "CREDIT_7", "CREDIT_15", "CREDIT_30", "OTHER"].map((pt) => (
                    <button
                      key={pt}
                      type="button"
                      id={`payment-term-chip-${pt}`}
                      onClick={() => setPreferredPaymentTerm(pt)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        preferredPaymentTerm === pt
                          ? "bg-primary text-white border-primary"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                      }`}
                    >
                      <T k={`payterm.${pt}`} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority Chips */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700">
                  <T k="rfq.priority" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {["PRICE", "SPEED", "PAYMENT_TERMS", "BALANCED"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      id={`priority-chip-${p}`}
                      onClick={() => setPriority(p)}
                      className={`p-2.5 rounded-xl text-xs font-semibold border text-center transition-all ${
                        priority === p
                          ? "bg-primary text-white border-primary"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                      }`}
                    >
                      <T k={`priority.${p}`} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Budget note */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">
                  <T k="rfq.budgetNote" />
                </label>
                <input
                  type="text"
                  id="rfq-budget-note-input"
                  maxLength={500}
                  value={budgetNote}
                  onChange={(e) => setBudgetNote(e.target.value)}
                  placeholder={t("rfq.budgetPlaceholder")}
                  className="w-full text-sm p-3 rounded-xl border border-gray-200 focus:border-primary outline-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="py-3 px-4 rounded-2xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  id="rfq-next-step-2"
                  onClick={() => {
                    if (!quantity || Number(quantity) <= 0) {
                      setFormErrors((prev) => ({ ...prev, quantity: "Please enter a valid quantity greater than zero" }));
                      return;
                    }
                    setFormErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.quantity;
                      return copy;
                    });
                    setStep(3);
                  }}
                  className="flex-1 py-3 bg-primary text-white text-sm font-bold rounded-2xl hover:bg-primary-hover transition-all flex items-center justify-center gap-2"
                >
                  <span><T k="rfq.step3" /></span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Quote Window & Review */}
          {step === 3 && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700">
                  <T k="rfq.quoteWindow" />
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[24, 48, 72, 168].map((hrs) => (
                    <button
                      key={hrs}
                      type="button"
                      id={`quote-window-${hrs}h`}
                      onClick={() => setQuoteWindowHours(hrs)}
                      className={`py-2 rounded-xl text-xs font-semibold border text-center transition-all ${
                        quoteWindowHours === hrs
                          ? "bg-primary text-white border-primary"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                      }`}
                    >
                      <T k={`rfq.window.${hrs}`} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Review Card */}
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2 text-xs">
                <div className="font-bold text-sm text-gray-900">{title}</div>
                <div className="text-gray-600">
                  <span>{quantity} {unit}</span> · <span>{deliveryArea}</span>
                </div>
                <div className="text-gray-500">
                  <T k="rfq.priority" />{": "}<span className="font-semibold text-gray-700">{t(`priority.${priority}`)}</span>
                </div>
                <div className="text-gray-500">
                  <T k="rfq.paymentTerm" />{": "}<span className="font-semibold text-gray-700">{t(`payterm.${preferredPaymentTerm}`)}</span>
                </div>
              </div>

              {directSupplier && (
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    id="rfq-only-direct-supplier"
                    checked={onlyDirectSupplier}
                    onChange={(e) => setOnlyDirectSupplier(e.target.checked)}
                  />
                  <span>{t("rfq.onlyThisSupplier", undefined, { name: directSupplier.name })}</span>
                </label>
              )}

              {formErrors.general && (
                <p className="text-xs text-red-500 font-semibold">{formErrors.general}</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="py-3 px-4 rounded-2xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  id="send-request-submit-btn"
                  onClick={handleSubmitRequest}
                  disabled={submitting}
                  className="flex-1 py-3.5 bg-primary text-white text-sm font-bold rounded-2xl hover:bg-primary-hover disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
                >
                  <Send className="w-4 h-4" />
                  <span>{submitting ? t("common.loading") : t("rfq.sendRequest")}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Success Screen (§8.5, B5) */}
      {mode === "SUCCESS" && createdRequest && (
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-gray-900">
              <T k="rfq.successTitle" />
            </h2>
            <p className="text-xs text-gray-500">
              <T k="rfq.successDesc" />
            </p>
          </div>

          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-1">
            <span className="text-[11px] uppercase font-bold text-gray-400"><T k="rfq.requestCode" /></span>
            <div id="created-request-code" className="text-base font-bold text-primary font-mono">
              {createdRequest.code}
            </div>
          </div>

          {/* Share Link without buyer contact info (§8.5, B5) */}
          <div className="space-y-2 text-left">
            <label className="text-xs font-bold text-gray-700">
              <T k="rfq.shareLink" />
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/requests/${createdRequest.code}`}
                className="w-full text-xs p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none"
              />
              <button
                type="button"
                id="copy-share-link-btn"
                onClick={copyShareLink}
                className="p-3 bg-gray-100 rounded-xl hover:bg-gray-200 text-gray-700"
                title={t("rfq.copyLink")}
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            {copiedLink && (
              <p className="text-xs text-emerald-600 font-semibold"><T k="rfq.linkCopied" /></p>
            )}
          </div>

          <Link
            href={`/requests/${createdRequest.code}`}
            id="view-request-details-btn"
            className="block w-full py-3.5 bg-primary text-white text-sm font-bold rounded-2xl hover:bg-primary-hover shadow-md shadow-primary/20"
          >
            <T k="public.viewListing" />
          </Link>
        </div>
      )}
    </div>
  );
}

/** Flattens wizard values to comparable strings (attributes as attr_<key>). */
function snapshotFields(values: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "attributes") {
      for (const [attrKey, attrValue] of Object.entries((value as Record<string, unknown>) || {})) {
        out[`attr_${attrKey}`] = JSON.stringify(attrValue ?? null);
      }
    } else if (value !== undefined && value !== null && value !== "") {
      out[key] = String(value);
    }
  }
  return out;
}

/** Maps an ISO date (YYYY-MM-DD) to the matching needed-by chip, else "custom". */
function chipForDate(iso: string): string {
  const day = (offset: number) => getDhakaDateString(new Date(Date.now() + offset * 86400000));
  if (iso === day(0)) return "today";
  if (iso === day(1)) return "tomorrow";
  if (iso === day(3)) return "3_days";
  if (iso === day(7)) return "1_week";
  return "custom";
}
