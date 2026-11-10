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

    const {
      imageBase64,
      mimeType,
      styleName,
      styleDescription,
      styleImageBase64,
      styleImageMimeType
    } = req.body || {};

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

      // 텍스트 설명만으로는 길이·컬 모양 같은 디테일이 모델 마음대로
      // 나와서(처음엔 C컬펌인데 너무 짧게 나왔다), hairDB의 실제 참고
      // 사진을 두 번째 이미지로 같이 넣어서 "이 사진의 헤어스타일과
      // 비슷하게"로 지시한다. 참고 사진이 없으면 기존처럼 텍스트만 쓴다.
      const requestParts = [];

      if (styleImageBase64) {
        requestParts.push({
          inlineData: { mimeType: styleImageMimeType || "image/jpeg", data: styleImageBase64 }
        });
        requestParts.push({
          text:
            `위 사진은 목표로 하는 헤어스타일 "${styleName}"의 참고 사진이다. ` +
            `길이, 컬/웨이브 모양, 전체적인 실루엣을 이 참고 사진과 최대한 비슷하게 맞춰줘.`
        });
      }

      requestParts.push({
        inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 }
      });

      requestParts.push({
        text:
          `위 사진은 합성 대상 인물 사진이다. 이 사람의 얼굴, 피부, 표정, 배경, 옷은 ` +
          `절대 바꾸지 말고, 머리 스타일만 "${styleName}"(${styleDescription || ""}) ` +
          `스타일로 자연스럽게 바꿔줘. 사진 전체가 사실적인 한 장의 인물 사진처럼 보여야 해.`
      });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [
          {
            role: "user",
            parts: requestParts
          }
        ],
        config: {
          responseModalities: [Modality.IMAGE]
        }
      });

      const responseParts = response?.candidates?.[0]?.content?.parts || [];
      const imagePart = responseParts.find((part) => part.inlineData);

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
