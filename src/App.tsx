/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Bot, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  BookOpen, 
  Award, 
  RotateCcw, 
  Sparkles, 
  Lock, 
  Unlock, 
  Check, 
  ChevronRight, 
  Lightbulb, 
  Flame, 
  GraduationCap,
  KeyRound,
  Sliders,
  X
} from "lucide-react";

interface Challenge {
  challengeQuestion: string;
  type: string;
  options?: string[];
  correctAnswer: string;
  hint: string;
}

interface HistoryItem {
  id: string;
  timestamp: string;
  subject: string;
  grade: string;
  prompt: string;
  challenge: Challenge;
  studentAnswer: string;
  solution: string;
  attempts: number;
}

const SUBJECTS = [
  "Toán học",
  "Ngữ văn",
  "Tiếng Anh",
  "Vật lý",
  "Hóa học",
  "Sinh học",
  "Lịch sử / Địa lý",
  "Khoa học máy tính",
  "Khác"
];

const GRADES = [
  "Lớp 6", "Lớp 7", "Lớp 8", "Lớp 9", 
  "Lớp 10", "Lớp 11", "Lớp 12", "Đại học / Khác"
];

export default function App() {
  const [activeTab, setActiveTab] = useState<"bot" | "history" | "stats" | "rules">("bot");

  // Passcode states
  const [accessCode, setAccessCode] = useState(() => {
    return localStorage.getItem("studybot_access_code") || "HOCVUI2026";
  });
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [tempCode, setTempCode] = useState(accessCode);

  // Teacher admin modal
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [teacherPin, setTeacherPin] = useState("");
  const [isTeacherAuthenticated, setIsTeacherAuthenticated] = useState(false);
  const [adminAccessCode, setAdminAccessCode] = useState("HOCVUI2026");
  const [adminRequireCode, setAdminRequireCode] = useState(true);
  const [teacherMsg, setTeacherMsg] = useState("");

  // Form state
  const [studentPrompt, setStudentPrompt] = useState("");
  const [subject, setSubject] = useState("Toán học");
  const [grade, setGrade] = useState("Lớp 10");

  // Bot flow states
  const [step, setStep] = useState<"idle" | "generating_challenge" | "waiting_for_challenge" | "verifying" | "unlocked">("idle");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [selectedOption, setSelectedOption] = useState("");
  const [shortAnswer, setShortAnswer] = useState("");
  const [verificationFeedback, setVerificationFeedback] = useState("");
  const [solution, setSolution] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  // History & stats
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem("studybot_history");
    return saved ? JSON.parse(saved) : [];
  });

  const [stats, setStats] = useState({
    totalSolved: 0,
    streak: 3,
    badgesEarned: ["Tư duy sắc bén", "Người đọc đề gương mẫu"]
  });

  useEffect(() => {
    localStorage.setItem("studybot_history", JSON.stringify(history));
    setStats(prev => ({
      ...prev,
      totalSolved: history.length
    }));
  }, [history]);

  // Save access code
  const handleSaveCode = () => {
    const cleaned = tempCode.trim().toUpperCase();
    setAccessCode(cleaned);
    localStorage.setItem("studybot_access_code", cleaned);
    setIsCodeModalOpen(false);
  };

  // Teacher login
  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeacherMsg("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mã PIN không đúng");

      setIsTeacherAuthenticated(true);
      setAdminAccessCode(data.accessCode);
      setAdminRequireCode(data.requireCode);
    } catch (err: any) {
      setTeacherMsg(err.message || "Lỗi đăng nhập giáo viên");
    }
  };

  // Teacher update config
  const handleTeacherUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeacherMsg("");
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherPin,
          newAccessCode: adminAccessCode,
          requireCode: adminRequireCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi cập nhật cấu hình");

      setAccessCode(data.accessCode);
      localStorage.setItem("studybot_access_code", data.accessCode);
      setTeacherMsg("Cập nhật thành công!");
    } catch (err: any) {
      setTeacherMsg(err.message || "Lỗi cập nhật cấu hình");
    }
  };

  // Step 1: Submit student prompt to generate challenge
  const handleGenerateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentPrompt.trim()) {
      setErrorMsg("Vui lòng nhập câu hỏi hoặc bài tập bạn cần trợ giúp.");
      return;
    }

    setErrorMsg("");
    setStep("generating_challenge");
    setAttempts(0);
    setSelectedOption("");
    setShortAnswer("");
    setVerificationFeedback("");

    try {
      const res = await fetch("/api/study/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          studentPrompt, 
          subject, 
          grade,
          accessCode 
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setIsCodeModalOpen(true);
        }
        throw new Error(data.error || "Lỗi tạo câu hỏi phụ");
      }

      setChallenge(data);
      setStep("waiting_for_challenge");
    } catch (err: any) {
      setErrorMsg(err.message || "Không thể kết nối với StudyBot AI.");
      setStep("idle");
    }
  };

  // Step 2: Verify student's answer to the challenge
  const handleVerifyAnswer = async () => {
    const answerToVerify = challenge?.type === "multiple_choice" ? selectedOption : shortAnswer;
    if (!answerToVerify.trim()) {
      setErrorMsg("Vui lòng chọn hoặc điền câu trả lời cho câu hỏi phụ.");
      return;
    }
    setErrorMsg("");
    setStep("verifying");
    setAttempts(prev => prev + 1);

    try {
      const res = await fetch("/api/study/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentAnswer: answerToVerify,
          challenge,
          studentPrompt,
          subject,
          accessCode
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi xác thực");

      setVerificationFeedback(data.feedback);

      if (data.isCorrect) {
        setSolution(data.feedback);
        setStep("unlocked");
        // Save to history
        const newItem: HistoryItem = {
          id: Date.now().toString(),
          timestamp: new Date().toLocaleString("vi-VN"),
          subject,
          grade,
          prompt: studentPrompt,
          challenge: challenge!,
          studentAnswer: answerToVerify,
          solution: data.feedback,
          attempts: attempts + 1
        };
        setHistory(prev => [newItem, ...prev]);
      } else {
        setStep("waiting_for_challenge");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Lỗi khi xác thực câu trả lời.");
      setStep("waiting_for_challenge");
    }
  };

  const resetAll = () => {
    setStudentPrompt("");
    setStep("idle");
    setChallenge(null);
    setSelectedOption("");
    setShortAnswer("");
    setVerificationFeedback("");
    setSolution("");
    setErrorMsg("");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Bar Contract (1 row, 3 zones, gap-8) */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark */}
        <div className="flex items-center gap-3 shrink-0 cursor-pointer" onClick={() => setActiveTab("bot")}>
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">StudyBot AI</h1>
            <p className="text-xs text-indigo-600 font-medium">Cổng Học Tập & Tư Duy Sáng Tạo</p>
          </div>
        </div>

        {/* Zone 2: 4-5 Nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button 
            onClick={() => setActiveTab("bot")} 
            className={`hover:text-indigo-600 transition-colors whitespace-nowrap shrink-0 py-1 ${activeTab === 'bot' ? 'text-indigo-600 font-semibold border-b-2 border-indigo-600' : ''}`}
          >
            Cổng Hỏi Đáp
          </button>
          <button 
            onClick={() => setActiveTab("history")} 
            className={`hover:text-indigo-600 transition-colors whitespace-nowrap shrink-0 py-1 ${activeTab === 'history' ? 'text-indigo-600 font-semibold border-b-2 border-indigo-600' : ''}`}
          >
            Lịch sử học tập
          </button>
          <button 
            onClick={() => setActiveTab("stats")} 
            className={`hover:text-indigo-600 transition-colors whitespace-nowrap shrink-0 py-1 ${activeTab === 'stats' ? 'text-indigo-600 font-semibold border-b-2 border-indigo-600' : ''}`}
          >
            Thống kê tư duy
          </button>
          <button 
            onClick={() => setActiveTab("rules")} 
            className={`hover:text-indigo-600 transition-colors whitespace-nowrap shrink-0 py-1 ${activeTab === 'rules' ? 'text-indigo-600 font-semibold border-b-2 border-indigo-600' : ''}`}
          >
            Quy tắc hoạt động
          </button>
        </nav>

        {/* Zone 3: Primary Action & Passcode Indicator */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Passcode modal button */}
          <button
            onClick={() => { setTempCode(accessCode); setIsCodeModalOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
            title="Đổi mã lớp học"
          >
            <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
            <span className="font-mono font-semibold">Mã: {accessCode}</span>
          </button>

          {/* Teacher settings button */}
          <button
            onClick={() => setIsTeacherModalOpen(true)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Quản lý giáo viên"
          >
            <Sliders className="w-4 h-4" />
          </button>

          <button 
            onClick={() => { setActiveTab("bot"); resetAll(); }}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Câu hỏi mới</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {activeTab === "bot" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Input Form & Rule Notice */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GraduationCap className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-lg font-bold text-slate-900">Đặt câu hỏi cho StudyBot</h2>
                  </div>
                  <p className="text-sm text-slate-500">
                    Nhập bài tập bạn cần giải đáp. Bot sẽ yêu cầu bạn vượt qua một câu hỏi kiểm tra nhanh để chứng minh đã đọc đề.
                  </p>
                </div>

                <form onSubmit={handleGenerateChallenge} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Môn học</label>
                    <select 
                      value={subject} 
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Khối lớp</label>
                    <select 
                      value={grade} 
                      onChange={(e) => setGrade(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nội dung câu hỏi / Bài tập</label>
                    <textarea 
                      rows={4}
                      value={studentPrompt}
                      onChange={(e) => setStudentPrompt(e.target.value)}
                      placeholder="Ví dụ: Giải phương trình bậc hai hoặc giải thích định luật Ôm..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>

                  {errorMsg && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={step === "generating_challenge"}
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {step === "generating_challenge" ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Bot đang tạo câu hỏi kiểm tra...</span>
                      </>
                    ) : (
                      <>
                        <span>Gửi câu hỏi & Thách thức tư duy</span>
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Security & Access Protection Notice */}
              <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-md relative overflow-hidden">
                <div className="relative z-10 space-y-3">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-indigo-300 text-xs font-medium">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Xác thực lớp học</span>
                  </div>
                  <h3 className="text-base font-bold text-white">Dành riêng cho học sinh có mã lớp</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Học sinh có mã truy cập do giáo viên cấp có thể tự do đặt câu hỏi, vượt qua thử thách tư duy và nhận hướng dẫn chi tiết mà không bị giới hạn số lượt hỏi.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Challenge Stage & Unlocked Answer */}
            <div className="lg:col-span-7 space-y-6">
              {step === "idle" && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center space-y-4">
                  <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto text-indigo-600">
                    <HelpCircle className="w-8 h-8" />
                  </div>
                  <div className="max-w-md mx-auto space-y-2">
                    <h3 className="text-lg font-bold text-slate-800">Sẵn sàng để học tập chủ động</h3>
                    <p className="text-sm text-slate-500">
                      Hãy nhập câu hỏi bên trái để bắt đầu. StudyBot sẽ chuẩn bị cho bạn một thử thách nhỏ thú vị trước khi mở khóa lời giải chi tiết.
                    </p>
                  </div>
                </div>
              )}

              {(step === "waiting_for_challenge" || step === "verifying") && challenge && (
                <div className="bg-white rounded-2xl border-2 border-indigo-500/30 shadow-lg shadow-indigo-50/50 p-6 space-y-6 relative overflow-hidden animate-fadeIn">
                  <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>Đang khóa đáp án</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Thử thách kiểm tra tư duy</h3>
                      <p className="text-xs text-slate-500">Trả lời đúng câu hỏi phụ này để mở khóa lời giải từ AI</p>
                    </div>
                  </div>

                  {verificationFeedback && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Chưa chính xác! Hãy thử lại:</p>
                        <p>{verificationFeedback}</p>
                      </div>
                    </div>
                  )}

                  <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-semibold text-indigo-950">
                      {challenge.challengeQuestion}
                    </p>

                    {challenge.type === "multiple_choice" && challenge.options && (
                      <div className="space-y-2 pt-2">
                        {challenge.options.map((opt, idx) => (
                          <label 
                            key={idx}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-all cursor-pointer ${
                              selectedOption === opt 
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                                : 'bg-white text-slate-800 border-slate-200 hover:border-indigo-300'
                            }`}
                          >
                            <input 
                              type="radio" 
                              name="challengeOption" 
                              value={opt} 
                              checked={selectedOption === opt}
                              onChange={() => setSelectedOption(opt)}
                              className="hidden"
                            />
                            <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs shrink-0 font-bold">
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {challenge.hint && (
                      <div className="text-xs text-indigo-700 flex items-center gap-1.5 pt-1">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Gợi ý: {challenge.hint}</span>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={handleVerifyAnswer}
                    disabled={step === "verifying"}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {step === "verifying" ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Đang kiểm tra câu trả lời...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Xác nhận & Mở khóa đáp án</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {step === "unlocked" && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Success Unlocked Banner */}
                  <div className="bg-emerald-600 text-white rounded-2xl p-6 shadow-lg shadow-emerald-100 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500 text-emerald-50 text-xs font-semibold">
                        <Unlock className="w-3 h-3" />
                        <span>Đã vượt qua thử thách thành công</span>
                      </div>
                      <h3 className="text-lg font-bold">Chúc mừng! Đáp án đã được mở khóa</h3>
                      <p className="text-xs text-emerald-100">Bạn đã chứng minh được sự chú ý và tư duy qua câu hỏi phụ.</p>
                    </div>
                    <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-8 h-8 text-white" />
                    </div>
                  </div>

                  {/* Solution Box */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-indigo-600" />
                        <h3 className="text-base font-bold text-slate-900">Lời giải chi tiết từ StudyBot AI</h3>
                      </div>
                      <button 
                        onClick={resetAll}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Hỏi câu hỏi khác</span>
                      </button>
                    </div>

                    <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 p-4 rounded-xl border border-slate-100">
                      {solution}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Lịch sử học tập đã giải</h2>
                <p className="text-xs text-slate-500">Danh sách các câu hỏi bạn đã vượt qua thử thách tư duy thành công.</p>
              </div>
              <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full">
                Tổng số: {history.length} bài
              </span>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-12 text-slate-400 space-y-3">
                <BookOpen className="w-12 h-12 mx-auto stroke-1" />
                <p className="text-sm">Chưa có lịch sử học tập nào. Hãy bắt đầu giải câu hỏi đầu tiên!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((item) => (
                  <div key={item.id} className="p-4 rounded-xl border border-slate-200 hover:border-indigo-300 transition-all space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-indigo-600">{item.subject}</span>
                        <span>·</span>
                        <span>{item.grade}</span>
                      </div>
                      <span>{item.timestamp}</span>
                    </div>

                    <p className="text-sm font-bold text-slate-900">{item.prompt}</p>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs space-y-1">
                      <p className="font-semibold text-slate-700">Thử thách phụ: {item.challenge.challengeQuestion}</p>
                      <p className="text-emerald-600 font-medium">Đáp án của bạn: {item.studentAnswer} (Số lần thử: {item.attempts})</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "stats" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bài đã vượt qua</p>
                <p className="text-3xl font-bold text-slate-900">{stats.totalSolved}</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-2">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Flame className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chuỗi ngày học tập</p>
                <p className="text-3xl font-bold text-slate-900">{stats.streak} ngày</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-2">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Huy hiệu đạt được</p>
                <p className="text-3xl font-bold text-slate-900">{stats.badgesEarned.length}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Huy hiệu tư duy của bạn</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {stats.badgesEarned.map((badge, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-4 rounded-xl border border-indigo-100 bg-indigo-50/50">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{badge}</h3>
                      <p className="text-xs text-slate-500">Mở khóa khi hoàn thành xuất sắc thử thách tư duy.</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "rules" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6 max-w-3xl mx-auto">
            <div className="space-y-2 border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-900">Quy tắc hoạt động của StudyBot AI</h2>
              <p className="text-sm text-slate-500">Hiểu rõ nguyên lý giáo dục và quản lý lớp học.</p>
            </div>

            <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 space-y-2">
                <h3 className="font-bold text-indigo-950 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>1. Nguyên tắc "Tư duy trước - Nhận đáp án sau"</span>
                </h3>
                <p className="text-xs text-indigo-900 leading-relaxed">
                  StudyBot được thiết lập theo yêu cầu: Khi học sinh đưa ra một câu hỏi hoặc bài tập, bot <strong>không bao giờ</strong> cung cấp lời giải hoặc đáp án ngay lập tức. Thay vào đó, bot phân tích đề bài và sinh ra <strong>1 câu hỏi tương tác phụ</strong> bám sát bản chất khái niệm.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>2. Chứng minh đã đọc đề</span>
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Học sinh phải trả lời đúng câu hỏi phụ này để chứng minh bản thân đã đọc, suy nghĩ và nắm bắt một phần cốt lõi của đề bài. Nếu trả lời sai, bot sẽ đưa ra gợi ý nhẹ nhàng và yêu cầu thử lại, giúp học sinh chủ động xây dựng kiến thức thay vì chép đáp án máy móc.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-600" />
                  <span>3. Quyền truy cập lớp học không giới hạn</span>
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Để bảo vệ tài khoản của bạn, chỉ học sinh có mã lớp hợp lệ mới được sử dụng bot. Khi đã nhập mã lớp, học sinh có thể đặt câu hỏi thoải mái mà không bị giới hạn số lượt.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal: Student Classroom Passcode */}
      {isCodeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Mã truy cập lớp học</h3>
              </div>
              <button onClick={() => setIsCodeModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Nhập mã lớp học do giáo viên cung cấp để đặt câu hỏi không giới hạn cho StudyBot AI.
            </p>
            <div className="space-y-2">
              <input 
                type="text" 
                value={tempCode}
                onChange={(e) => setTempCode(e.target.value.toUpperCase())}
                placeholder="Ví dụ: HOCVUI2026"
                className="w-full uppercase tracking-wider font-mono px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-slate-400">Mã lớp hiện tại: <span className="font-mono font-semibold text-slate-600">{accessCode}</span></p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button 
                onClick={() => setIsCodeModalOpen(false)} 
                className="w-1/2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Hủy
              </button>
              <button 
                onClick={handleSaveCode} 
                className="w-1/2 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
              >
                Lưu mã
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Teacher Admin Settings */}
      {isTeacherModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Bảng điều khiển giáo viên</h3>
              </div>
              <button onClick={() => setIsTeacherModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isTeacherAuthenticated ? (
              <form onSubmit={handleTeacherLogin} className="space-y-4">
                <p className="text-xs text-slate-500">
                  Nhập mã PIN giáo viên để tùy chỉnh mã lớp học cho học sinh.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mã PIN giáo viên</label>
                  <input 
                    type="password"
                    value={teacherPin}
                    onChange={(e) => setTeacherPin(e.target.value)}
                    placeholder="Nhập mã PIN (mặc định: giaovien123)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Mã PIN mặc định: <span className="font-mono text-slate-600">giaovien123</span></p>
                </div>
                {teacherMsg && <p className="text-xs text-red-600 font-medium">{teacherMsg}</p>}
                <button 
                  type="submit" 
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Xác nhận truy cập
                </button>
              </form>
            ) : (
              <form onSubmit={handleTeacherUpdate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mã lớp học (Classroom Passcode)</label>
                  <input 
                    type="text"
                    value={adminAccessCode}
                    onChange={(e) => setAdminAccessCode(e.target.value.toUpperCase())}
                    className="w-full uppercase font-mono px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Chỉ những ai có mã này mới được đặt câu hỏi cho bot.</p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input 
                    type="checkbox"
                    id="requireCodeToggle"
                    checked={adminRequireCode}
                    onChange={(e) => setAdminRequireCode(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <label htmlFor="requireCodeToggle" className="text-xs font-medium text-slate-700">
                    Bắt buộc nhập mã lớp học để sử dụng
                  </label>
                </div>

                {teacherMsg && (
                  <p className={`text-xs font-semibold ${teacherMsg.includes('thành công') ? 'text-emerald-600' : 'text-red-600'}`}>
                    {teacherMsg}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setIsTeacherModalOpen(false)}
                    className="w-1/2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Đóng
                  </button>
                  <button 
                    type="submit" 
                    className="w-1/2 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                  >
                    Lưu cài đặt
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500 mt-12">
        <p>© 2026 StudyBot AI · Cổng học tập thông minh thúc đẩy tư duy chủ động.</p>
      </footer>
    </div>
  );
}
