import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Classroom Passcode Configuration (Unlimited questions for authorized users)
interface ClassroomConfig {
  accessCode: string;
  teacherPin: string;
  requireCode: boolean;
}

const config: ClassroomConfig = {
  accessCode: process.env.CLASSROOM_PASSCODE || "HOCVUI2026",
  teacherPin: process.env.TEACHER_PIN || "giaovien123",
  requireCode: true,
};

// 0. Verify access code
app.post("/api/study/verify-code", (req, res) => {
  const { accessCode } = req.body;

  if (config.requireCode && accessCode !== config.accessCode) {
    return res.status(403).json({ 
      valid: false, 
      error: "Mã truy cập lớp học không chính xác. Vui lòng liên hệ giáo viên!" 
    });
  }

  res.json({ 
    valid: true, 
    requireCode: config.requireCode 
  });
});

// Check passcode requirement status
app.get("/api/study/status", (req, res) => {
  res.json({
    requireCode: config.requireCode
  });
});

// Teacher Admin endpoints
app.post("/api/admin/config", (req, res) => {
  const { teacherPin, newAccessCode, requireCode } = req.body;
  if (teacherPin !== config.teacherPin) {
    return res.status(401).json({ error: "Mã PIN giáo viên không đúng!" });
  }

  if (newAccessCode && typeof newAccessCode === "string") {
    config.accessCode = newAccessCode.trim();
  }
  if (typeof requireCode === "boolean") {
    config.requireCode = requireCode;
  }

  res.json({
    success: true,
    accessCode: config.accessCode,
    requireCode: config.requireCode,
  });
});

app.post("/api/admin/login", (req, res) => {
  const { teacherPin } = req.body;
  if (teacherPin !== config.teacherPin) {
    return res.status(401).json({ error: "Mã PIN giáo viên không đúng!" });
  }
  res.json({
    success: true,
    accessCode: config.accessCode,
    requireCode: config.requireCode,
  });
});

// 1. Generate Interactive Side Challenge
app.post("/api/study/challenge", async (req, res) => {
  try {
    const { studentPrompt, subject, grade, accessCode } = req.body;

    // Validate access code
    if (config.requireCode && accessCode !== config.accessCode) {
      return res.status(403).json({ 
        error: "Mã truy cập lớp học không đúng. Hãy nhập mã do giáo viên cung cấp để sử dụng bot!" 
      });
    }

    if (!studentPrompt) {
      return res.status(400).json({ error: "Vui lòng nhập câu hỏi hoặc chủ đề." });
    }

    const systemInstruction = `Bạn là một trợ lý giáo dục thông minh (StudyBot AI) thân thiện, nghiêm khắc và tâm huyết.
Quy tắc cốt lõi: Học sinh muốn nhận đáp án từ AI phải vượt qua 1 câu hỏi tương tác phụ (side-question) do bạn tạo ra dựa trên chủ đề/câu hỏi mà học sinh đưa ra, nhằm chứng minh học sinh đã đọc đề và có tư duy ban đầu.

Hãy phân tích câu hỏi của học sinh: "${studentPrompt}" (Môn: ${subject || 'Tổng hợp'}, Lớp: ${grade || 'Chung'}).
Hãy tạo ra:
1. Một câu hỏi tương tác phụ (ngắn gọn, tập trung vào bản chất/khái niệm cốt lõi của đề bài học sinh đưa ra để kiểm tra xem học sinh có thực sự đọc đề không).
2. Hình thức câu hỏi: Trắc nghiệm (4 lựa chọn A, B, C, D).
3. Đáp án đúng của câu hỏi phụ này.
4. Lời giải thích ngắn gọn tại sao câu hỏi phụ này lại quan trọng với đề bài.

Trả về kết quả chuẩn JSON format:
{
  "challengeQuestion": "Nội dung câu hỏi phụ...",
  "type": "multiple_choice",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correctAnswer": "Đáp án đúng chính xác (ví dụ: A. ...)",
  "hint": "Gợi ý nhẹ nhàng nếu học sinh chưa biết"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `Tạo câu hỏi phụ cho chủ đề: ${studentPrompt}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            challengeQuestion: { type: Type.STRING },
            type: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            correctAnswer: { type: Type.STRING },
            hint: { type: Type.STRING }
          },
          required: ["challengeQuestion", "type", "correctAnswer", "hint"]
        }
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Không nhận được phản hồi từ AI.");
    }

    const data = JSON.parse(responseText.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Error generating challenge:", error);
    res.status(500).json({ error: error.message || "Lỗi khi tạo câu hỏi phụ từ AI." });
  }
});

// 2. Verify Student's Answer & Unlock Full Answer if Correct
app.post("/api/study/verify", async (req, res) => {
  try {
    const { studentAnswer, challenge, studentPrompt, subject, accessCode } = req.body;

    if (config.requireCode && accessCode !== config.accessCode) {
      return res.status(403).json({ error: "Mã truy cập lớp học không hợp lệ." });
    }

    if (!studentAnswer || !challenge || !studentPrompt) {
      return res.status(400).json({ error: "Thiếu thông tin xác thực." });
    }

    const evaluationPrompt = `Học sinh vừa trả lời câu hỏi phụ.
Câu hỏi phụ: "${challenge.challengeQuestion}"
Đáp án đúng của câu hỏi phụ: "${challenge.correctAnswer}"
Câu trả lời của học sinh: "${studentAnswer}"

Hãy đánh giá xem câu trả lời của học sinh có chính xác (hoặc chấp nhận được / đúng bản chất) so với đáp án không.
Nếu đúng (isCorrect = true):
- Cung cấp lời giải chi tiết, từng bước rõ ràng, dễ hiểu cho câu hỏi gốc của học sinh: "${studentPrompt}" (Môn: ${subject || 'Tổng hợp'}).

Nếu sai hoặc chưa đạt (isCorrect = false):
- Cung cấp phản hồi khích lệ, chỉ ra điểm chưa chính xác và gợi ý để học sinh suy nghĩ lại (KHÔNG đưa ra đáp án đầy đủ của câu hỏi gốc vội).

Trả về định dạng JSON chuẩn:
{
  "isCorrect": boolean,
  "feedback": "Nhận xét câu trả lời phụ và lời giải chi tiết (nếu đúng) hoặc gợi ý sửa đổi (nếu sai)..."
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: evaluationPrompt,
      config: {
        systemInstruction: "Bạn là StudyBot AI - người thầy tận tâm giúp học sinh tự tư duy.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCorrect: { type: Type.BOOLEAN },
            feedback: { type: Type.STRING }
          },
          required: ["isCorrect", "feedback"]
        }
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Không nhận được phản hồi đánh giá từ AI.");
    }

    const result = JSON.parse(responseText.trim());
    res.json(result);
  } catch (error: any) {
    console.error("Error verifying answer:", error);
    res.status(500).json({ error: error.message || "Lỗi khi xác thực câu trả lời." });
  }
});

// Static file serving or Vite middleware fallback
const staticPath = path.resolve(__dirname, "dist");
if (fs.existsSync(staticPath)) {
  app.use(express.static(staticPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.resolve(staticPath, "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
