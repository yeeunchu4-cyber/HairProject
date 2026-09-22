import cv2
import mediapipe as mp
import numpy as np
from PIL import ImageFont, ImageDraw, Image

# -------------------------
# MediaPipe 설정
# -------------------------
mp_face_mesh = mp.solutions.face_mesh

face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.6,
    min_tracking_confidence=0.6
)

# -------------------------
# 기본 설정
# -------------------------
gender = "female"
font_path = "malgun.ttf"

# -------------------------
# 한글 출력 함수
# -------------------------
def draw_korean_text(img, text, pos, size=24, color=(0,0,0)):

    img_pil = Image.fromarray(img)
    draw = ImageDraw.Draw(img_pil)

    font = ImageFont.truetype(font_path, size)

    draw.text(pos, text, font=font, fill=color)

    return np.array(img_pil)

# -------------------------
# 거리 계산
# -------------------------
def dist(a, b):

    return np.linalg.norm(
        np.array(a) - np.array(b)
    )

# -------------------------
# 랜드마크 좌표 변환
# -------------------------
def pt(lm, i, w, h):

    return (
        int(lm[i].x * w),
        int(lm[i].y * h)
    )

# -------------------------
# 각도 계산
# -------------------------
def angle(a, b, c):

    ba = np.array(a) - np.array(b)
    bc = np.array(c) - np.array(b)

    cosine = np.dot(ba, bc) / (
        np.linalg.norm(ba) *
        np.linalg.norm(bc)
    )

    cosine = np.clip(cosine, -1.0, 1.0)

    return np.degrees(
        np.arccos(cosine)
    )

# -------------------------
# 얼굴형 분류
# -------------------------
def classify(lw, jc, fj, fc, ja):

    score = {
        "Round":0,
        "Oval":0,
        "Square":0,
        "Heart":0,
        "Long":0
    }

    # Round Face
    if lw < 1.23:
        score["Round"] += 3

    if jc < 0.86:
        score["Round"] += 2

    if ja > 131:
        score["Round"] += 3

    # Oval Face
    if 1.22 <= lw <= 1.36:
        score["Oval"] += 4

    if 0.82 <= jc <= 0.92:
        score["Oval"] += 2

    if 120 <= ja <= 132:
        score["Oval"] += 2

    # Square Face
    if jc >= 0.93:
        score["Square"] += 3

    if ja < 121:
        score["Square"] += 4

    # Heart Face
    if fj > 1.13:
        score["Heart"] += 3

    if jc < 0.82:
        score["Heart"] += 2

    # Long Face
    if lw > 1.42:
        score["Long"] += 5

    if lw > 1.48:
        score["Long"] += 3

    shape = max(score, key=score.get)

    return shape + " Face"

# -------------------------
# 헤어 추천
# -------------------------
def hair(shape, gender):

    hair_db = {

        "Oval Face":{

            "female":{
                "best":[
                    "Layeredcut",
                    "C-curlperm",
                    "Waveperm"
                ],
                "worst":[
                    "너무 긴 생머리"
                ]
            },

            "male":{
                "best":[
                    "Aspermcut",
                    "Leafcut",
                    "Shadowperm"
                ],
                "worst":[
                    "너무 짧은 스포츠컷"
                ]
            }
        },

        "Round Face":{

            "female":{
                "best":[
                    "Layeredcut",
                    "S-curlperm",
                    "Waveperm"
                ],
                "worst":[
                    "짧은 단발"
                ]
            },

            "male":{
                "best":[
                    "Aspermcut",
                    "Twoblockcut",
                    "Shadowperm"
                ],
                "worst":[
                    "다운펌만 한 스타일"
                ]
            }
        },

        "Square Face":{

            "female":{
                "best":[
                    "Waveperm",
                    "Layeredcut",
                    "Glamperm"
                ],
                "worst":[
                    "칼단발"
                ]
            },

            "male":{
                "best":[
                    "Leafcut",
                    "Shadowperm",
                    "Texture"
                ],
                "worst":[
                    "스포츠컷"
                ]
            }
        },

        "Heart Face":{

            "female":{
                "best":[
                    "C-curlperm",
                    "Waveperm",
                    "Layeredcut"
                ],
                "worst":[
                    "정수리 볼륨 스타일"
                ]
            },

            "male":{
                "best":[
                    "Leafcut",
                    "Aspermcut",
                    "Gailcut"
                ],
                "worst":[
                    "짧은 투블럭"
                ]
            }
        },

        "Long Face":{

            "female":{
                "best":[
                    "C-curlperm",
                    "Layeredcut",
                    "Wavyperm"
                ],
                "worst":[
                    "긴 생머리"
                ]
            },

            "male":{
                "best":[
                    "Shadowperm",
                    "Aspermcut",
                    "Leafcut"
                ],
                "worst":[
                    "올백 스타일"
                ]
            }
        }
    }

    return (
        hair_db[shape][gender]["best"],
        hair_db[shape][gender]["worst"]
    )

# -------------------------
# 얼굴 분석
# -------------------------
def analyze(lm, w, h):

    top = pt(lm, 10, w, h)
    chin = pt(lm, 152, w, h)

    left = pt(lm, 234, w, h)
    right = pt(lm, 454, w, h)

    cheekL = pt(lm, 93, w, h)
    cheekR = pt(lm, 323, w, h)

    jawL = pt(lm, 172, w, h)
    jawR = pt(lm, 397, w, h)

    foreL = pt(lm, 103, w, h)
    foreR = pt(lm, 332, w, h)

    # 비율 계산
    lw = dist(top, chin) / dist(left, right)

    jc = dist(jawL, jawR) / dist(cheekL, cheekR)

    fj = dist(foreL, foreR) / dist(jawL, jawR)

    fc = dist(foreL, foreR) / dist(cheekL, cheekR)

    ja = angle(jawL, chin, jawR)

    # 얼굴형 분석
    shape = classify(
        lw,
        jc,
        fj,
        fc,
        ja
    )

    return shape, ja, lw

# -------------------------
# 헤어 이미지 출력
# -------------------------
def draw_hair_images(frame, hair_list):

    start_x = 700
    y = 120

    for hair in hair_list:

        path_png = f"image/{hair}.png"
        path_jpg = f"image/{hair}.jpg"

        img = cv2.imread(path_png)

        if img is None:
            img = cv2.imread(path_jpg)

        if img is None:
            continue

        img = cv2.resize(img, (140, 170))

        frame[
            y:y+170,
            start_x:start_x+140
        ] = img

        frame = draw_korean_text(
            frame,
            hair,
            (start_x, y+180),
            20,
            (255,255,255)
        )

        start_x += 170

    return frame

# -------------------------
# 카메라 실행
# -------------------------
cap = cv2.VideoCapture(0)

while cap.isOpened():

    ret, frame = cap.read()

    if not ret:
        break

    frame = cv2.flip(frame, 1)

    rgb = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2RGB
    )

    result = face_mesh.process(rgb)

    if result.multi_face_landmarks:

        lm = result.multi_face_landmarks[0].landmark

        h, w, _ = frame.shape

        # 얼굴 분석
        shape, ja, lw = analyze(
            lm,
            w,
            h
        )

        # 헤어 추천
        best, worst = hair(
            shape,
            gender
        )

        # 얼굴 윤곽 표시
        for idx in [
            10,152,234,454,
            93,323,172,397
        ]:

            x = int(lm[idx].x * w)
            y = int(lm[idx].y * h)

            cv2.circle(
                frame,
                (x,y),
                3,
                (0,255,0),
                -1
            )

        # 결과 텍스트
        frame = draw_korean_text(
            frame,
            f"얼굴형 : {shape}",
            (30,40),
            32,
            (255,255,255)
        )

        frame = draw_korean_text(
            frame,
            f"Jaw Angle : {int(ja)}",
            (30,90),
            24,
            (255,255,255)
        )

        frame = draw_korean_text(
            frame,
            f"Face Ratio : {round(lw,2)}",
            (30,130),
            24,
            (255,255,255)
        )

        frame = draw_korean_text(
            frame,
            f"성별 : {gender}",
            (30,180),
            28,
            (255,255,255)
        )

        # 추천 스타일
        y_text = 250

        frame = draw_korean_text(
            frame,
            "[추천 스타일]",
            (30,y_text),
            30,
            (0,255,0)
        )

        y_text += 40

        for b in best:

            frame = draw_korean_text(
                frame,
                f"- {b}",
                (30,y_text),
                24,
                (0,255,0)
            )

            y_text += 35

        y_text += 20

        frame = draw_korean_text(
            frame,
            "[비추천 스타일]",
            (30,y_text),
            30,
            (255,80,80)
        )

        y_text += 40

        for wst in worst:

            frame = draw_korean_text(
                frame,
                f"- {wst}",
                (30,y_text),
                24,
                (255,80,80)
            )

            y_text += 35

        # 헤어 이미지 출력
        frame = draw_hair_images(
            frame,
            best
        )

    # 화면 출력
    cv2.imshow(
        "Hair Recommendation System",
        frame
    )

    key = cv2.waitKey(1) & 0xFF

    if key == 27:
        break

    elif key == ord('m'):
        gender = "male"

    elif key == ord('f'):
        gender = "female"

# 종료
cap.release()
cv2.destroyAllWindows()