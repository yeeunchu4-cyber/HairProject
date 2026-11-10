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

      // 참고 사진을 같이 넣으니 Gemini가 "어느 쪽 얼굴을 써야 하는지"
      // 혼동해서, 참고 사진 속 모델을 거의 그대로 돌려주는 사고가
      // 있었다(= 사용자 얼굴이 아예 사라짐). 역할을 아주 명시적으로
      // 분리해서 지시한다: 1) 사용자 사진을 먼저 주고 "이 얼굴이
      // 결과물의 얼굴"이라고 못박는다. 2) 참고 사진은 "헤어스타일
      // 모양만 베끼고, 이 사진 속 사람의 얼굴·정체성은 완전히
      // 무시하라"고 따로 못박는다.
      const requestParts = [];

      requestParts.push({
        inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 }
      });

      requestParts.push({
        text:
          `[인물 사진] 위 사진 속 사람이 결과물에 나와야 할 유일한 인물이다. ` +
          `이 사람의 얼굴 생김새, 피부, 표정, 배경, 옷은 그대로 유지해야 한다.`
      });

      if (styleImageBase64) {
        requestParts.push({
          inlineData: { mimeType: styleImageMimeType || "image/jpeg", data: styleImageBase64 }
        });
        requestParts.push({
          text:
            `[스타일 참고 사진] 위 사진은 "${styleName}" 헤어스타일이 어떤 모양인지 ` +
            `보여주기 위한 참고용일 뿐이다. 이 사진 속 사람의 얼굴, 피부, 정체성은 ` +
            `완전히 무시해라 — 절대로 이 사진 속 인물을 결과물에 사용하지 마라. ` +
            `오직 머리카락의 길이, 컬/웨이브 모양, 전체 실루엣만 참고해라.`
        });
      }

      requestParts.push({
        text:
          `이제 [인물 사진] 속 그 사람의 얼굴을 그대로 유지한 채, 머리 스타일만 ` +
          `"${styleName}"(${styleDescription || ""}) 스타일로 바꾼 사진 한 장을 만들어줘. ` +
          `결과물의 얼굴은 반드시 [인물 사진] 속 얼굴과 동일한 사람이어야 하고, ` +
          `[스타일 참고 사진] 속 사람으로 바뀌면 안 된다. 원래 머리와 비슷한 수준으로 ` +
          `애매하게 남겨두지 말고, 길이·질감·전체 형태가 눈에 띄게 달라져야 해. ` +
          `사진 전체가 사실적인 한 장의 인물 사진처럼 보여야 해.`
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
