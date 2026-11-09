const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { GoogleGenAI, Modality } = require("@google/genai");

admin.initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// 로그인한 사용자만 호출할 수 있게 해서, 외부에서 무단으로 이 엔드포인트를
// 두드려 무료 할당량(하루 500장)을 소진시키는 걸 막는다.
async function verifyUser(req) {
  const authHeader = req.get("Authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return null;
  }
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (error) {
    logger.warn("ID token verification failed", error);
    return null;
  }
}

// 업로드 사진 용량을 과도하게 큰 요청으로부터 보호 (비용/악용 방지).
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

exports.synthesizeHairstyle = onRequest(
  {
    cors: [
      "https://yeeunchu4-cyber.github.io",
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/
    ],
    secrets: [GEMINI_API_KEY],
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 60
  },
  async (req, res) => {

    if (req.method !== "POST") {
      res.status(405).json({ error: "POST 요청만 허용됩니다." });
      return;
    }

    const user = await verifyUser(req);
    if (!user) {
      res.status(401).json({ error: "로그인이 필요합니다." });
      return;
    }

    const { imageBase64, mimeType, styleName, styleDescription } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== "string") {
      res.status(400).json({ error: "imageBase64가 필요합니다." });
      return;
    }

    if (imageBase64.length > MAX_IMAGE_BYTES * 1.4) { // base64는 원본보다 약 1.37배 커짐
      res.status(400).json({ error: "이미지 용량이 너무 큽니다." });
      return;
    }

    if (!styleName) {
      res.status(400).json({ error: "styleName이 필요합니다." });
      return;
    }

    try {

      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });

      const prompt =
        `이 사람의 사진에서 얼굴, 피부, 표정, 배경, 옷은 절대 바꾸지 말고, ` +
        `머리 스타일만 "${styleName}"(${styleDescription || ""}) 스타일로 자연스럽게 바꿔줘. ` +
        `사진 전체가 사실적인 한 장의 인물 사진처럼 보여야 해.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
              { text: prompt }
            ]
          }
        ],
        config: {
          responseModalities: [Modality.IMAGE]
        }
      });

      const parts = response?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((part) => part.inlineData);

      if (!imagePart) {
        logger.error("Gemini 응답에 이미지가 없음", JSON.stringify(response));
        res.status(502).json({ error: "이미지 생성에 실패했습니다. 다시 시도해주세요." });
        return;
      }

      res.status(200).json({
        imageBase64: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType || "image/png"
      });

    } catch (error) {
      logger.error("synthesizeHairstyle 오류", error);
      res.status(500).json({ error: "서버 오류로 합성에 실패했습니다." });
    }

  }
);
