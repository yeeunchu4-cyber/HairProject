import cv2
import mediapipe as mp
import numpy as np
from PIL import ImageFont, ImageDraw, Image

# -------------------------
# 설정
# -------------------------
gender = None
font_path = "malgun.ttf"

# -------------------------
# MediaPipe
# -------------------------
mp_face_mesh = mp.solutions.face_mesh

face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=True,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.6
)

# -------------------------
# 한글 출력
# -------------------------
def draw_text(img, text, pos, size=24, color=(255,255,255)):

    img_pil = Image.fromarray(img)

    draw = ImageDraw.Draw(img_pil)

    font = ImageFont.truetype(font_path, size)

    draw.text(pos, text, font=font, fill=color)

    return np.array(img_pil)

# -------------------------
# 기본 함수
# -------------------------
def dist(a,b):

    return np.linalg.norm(
        np.array(a)-np.array(b)
    )

def pt(lm,i,w,h):

    return (
        int(lm[i].x*w),
        int(lm[i].y*h)
    )

def angle(a,b,c):

    ba=np.array(a)-np.array(b)
    bc=np.array(c)-np.array(b)

    cos=np.dot(ba,bc)/(
        np.linalg.norm(ba)*
        np.linalg.norm(bc)
    )

    return np.degrees(
        np.arccos(
            np.clip(cos,-1,1)
        )
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

    # -------------------------
    # Round
    # -------------------------
    if lw < 1.23:
        score["Round"] += 3

    if jc < 0.86:
        score["Round"] += 2

    if ja > 131:
        score["Round"] += 3

    # -------------------------
    # Oval
    # -------------------------
    if 1.22 <= lw <= 1.36:
        score["Oval"] += 4

    if 0.82 <= jc <= 0.92:
        score["Oval"] += 2

    if 120 <= ja <= 132:
        score["Oval"] += 2

    # -------------------------
    # Square
    # -------------------------
    if jc >= 0.93:
        score["Square"] += 3

    if ja < 121:
        score["Square"] += 4

    # -------------------------
    # Heart
    # -------------------------
    if fj > 1.13:
        score["Heart"] += 3

    if jc < 0.82:
        score["Heart"] += 2

    # -------------------------
    # Long
    # -------------------------
    if lw > 1.42:
        score["Long"] += 5

    if lw > 1.48:
        score["Long"] += 3

    # -------------------------
    # 최종 결과
    # -------------------------
    shape = max(score, key=score.get)

    return shape + " Face"

# -------------------------
# 헤어 추천 데이터
# -------------------------
def hair_detail(shape, gender):

    if gender is None:
        return ["성별 선택 필요"], []

    data = {

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
                    "스포츠컷"
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
                    "납작한 스타일"
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
                    "Texture",
                    "Shadowperm"
                ],
                "worst":[
                    "각진 스포츠컷"
                ]
            }
        },

        "Heart Face":{

            "female":{
                "best":[
                    "C-curlperm",
                    "Layeredcut",
                    "Waveperm"
                ],
                "worst":[
                    "정수리 볼륨"
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
                    "Wavyperm",
                    "Layeredcut"
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
        data[shape][gender]["best"],
        data[shape][gender]["worst"]
    )

# -------------------------
# 화면 크기 맞춤
# -------------------------
def fit_screen(img, max_w=1400, max_h=950):

    h, w = img.shape[:2]

    scale = min(
        max_w / w,
        max_h / h
    )

    return cv2.resize(
        img,
        (
            int(w*scale),
            int(h*scale)
        )
    )

# -------------------------
# 헤어 이미지 출력
# -------------------------
def draw_hair_images(display, hair_list):

    start_x = 700
    start_y = 120

    for hair in hair_list:

        path_png = f"image/{hair}.png"
        path_jpg = f"image/{hair}.jpg"

        hair_img = cv2.imread(path_png)

        if hair_img is None:
            hair_img = cv2.imread(path_jpg)

        if hair_img is None:
            continue

        hair_img = cv2.resize(
            hair_img,
            (170, 200)
        )

        display[
            start_y:start_y+200,
            start_x:start_x+170
        ] = hair_img

        display = draw_text(
            display,
            hair,
            (start_x, start_y+210),
            20,
            (255,255,255)
        )

        start_x += 190

    return display

# -------------------------
# 이미지 불러오기
# -------------------------
img = cv2.imread("face4.jpg")

if img is None:

    print("이미지 불러오기 실패")
    exit()

rgb = cv2.cvtColor(
    img,
    cv2.COLOR_BGR2RGB
)

res = face_mesh.process(rgb)

if not res.multi_face_landmarks:

    print("얼굴 인식 실패")
    exit()

# -------------------------
# 얼굴 분석
# -------------------------
lm = res.multi_face_landmarks[0].landmark

h,w,_ = img.shape

top=pt(lm,10,w,h)
chin=pt(lm,152,w,h)

left=pt(lm,234,w,h)
right=pt(lm,454,w,h)

cheekL=pt(lm,93,w,h)
cheekR=pt(lm,323,w,h)

jawL=pt(lm,172,w,h)
jawR=pt(lm,397,w,h)

foreL=pt(lm,103,w,h)
foreR=pt(lm,332,w,h)

# -------------------------
# 비율 계산
# -------------------------
lw = dist(top,chin) / dist(left,right)

jc = dist(jawL,jawR) / dist(cheekL,cheekR)

fj = dist(foreL,foreR) / dist(jawL,jawR)

fc = dist(foreL,foreR) / dist(cheekL,cheekR)

ja = angle(jawL,chin,jawR)

# -------------------------
# 얼굴형 결과
# -------------------------
shape = classify(
    lw,
    jc,
    fj,
    fc,
    ja
)

# -------------------------
# 랜드마크 표시
# -------------------------
landmark_ids = [
    10,152,234,454,
    93,323,172,397,
    103,332
]

for idx in landmark_ids:

    x = int(lm[idx].x * w)
    y = int(lm[idx].y * h)

    cv2.circle(
        img,
        (x,y),
        4,
        (0,255,0),
        -1
    )

# -------------------------
# UI
# -------------------------
while True:

    display = fit_screen(img.copy())

    h, w, _ = display.shape

    x = int(w*0.04)
    y = int(h*0.07)

    best, worst = hair_detail(
        shape,
        gender
    )

    # -------------------------
    # 결과 출력
    # -------------------------
    display = draw_text(
        display,
        f"얼굴형 : {shape}",
        (x,y),
        34,
        (255,255,255)
    )

    display = draw_text(
        display,
        f"Jaw Angle : {int(ja)}",
        (x,y+55),
        24,
        (255,255,255)
    )

    display = draw_text(
        display,
        f"Face Ratio : {round(lw,2)}",
        (x,y+95),
        24,
        (255,255,255)
    )

    g_text = (
        "선택 안됨"
        if gender is None
        else gender
    )

    display = draw_text(
        display,
        f"성별 : {g_text}",
        (x,y+145),
        28,
        (255,255,255)
    )

    # -------------------------
    # 추천 스타일
    # -------------------------
    y2 = y + 240

    display = draw_text(
        display,
        "[추천 스타일]",
        (x,y2),
        30,
        (0,255,0)
    )

    y2 += 45

    for b in best:

        display = draw_text(
            display,
            f"- {b}",
            (x,y2),
            24,
            (0,255,0)
        )

        y2 += 38

    # -------------------------
    # 비추천 스타일
    # -------------------------
    y2 += 20

    display = draw_text(
        display,
        "[비추천 스타일]",
        (x,y2),
        30,
        (255,100,100)
    )

    y2 += 45

    for wst in worst:

        display = draw_text(
            display,
            f"- {wst}",
            (x,y2),
            24,
            (255,100,100)
        )

        y2 += 38

    # -------------------------
    # 헤어 이미지 출력
    # -------------------------
    if gender is not None:

        display = draw_hair_images(
            display,
            best
        )

    # -------------------------
    # 하단 안내
    # -------------------------
    display = draw_text(
        display,
        "M : 남자 / F : 여자 / ESC : 종료",
        (x, h-45),
        20,
        (200,200,200)
    )

    cv2.imshow(
        "Final Hair Recommendation",
        display
    )

    key = cv2.waitKey(0)

    if key == 27:
        break

    elif key == ord('m'):
        gender = "male"

    elif key == ord('f'):
        gender = "female"

cv2.destroyAllWindows()