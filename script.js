const firebaseConfig = {
  apiKey: "AIzaSyCAnXZv3pFlRbtT_adNh4FUwBDzm6dmOks",
  authDomain: "hairstylefinder.firebaseapp.com",
  projectId: "hairstylefinder",
  storageBucket: "hairstylefinder.firebasestorage.app",
  messagingSenderId: "173329146710",
  appId: "1:173329146710:web:42578a64fc95a6c0d86cf7"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentImage = null;
let faceLandmarks = null;
let gender = "female";
let activeCamera = null;
let lastRecommend = [];
let authMode = "login";

let gbModel = null;
const gbModelPromise = fetch("gb_model.json")
  .then(r => r.json())
  .then(m => { gbModel = m; return m; })
  .catch(err => { console.error("GB 모델 로드 실패:", err); });

function evalGBTree(tree, x){
  let node = 0;
  while(tree[node][0] !== -2){
    const feat = tree[node][0];
    const thr = tree[node][1];
    node = x[feat] <= thr ? tree[node][2] : tree[node][3];
  }
  return tree[node][4];
}

/* ===== 로그인 ===== */

function showPage(pageId){
  document.getElementById("mainPage").classList.remove("active");
  document.getElementById("analyzePage").classList.remove("active");

  document.getElementById(pageId).classList.add("active");
}

function openAuthModal(mode){
  authMode = mode === "signup" ? "signup" : "login";

  document.getElementById("authModalTitle").textContent =
    authMode === "signup"
      ? "회원가입"
      : "Hair Style Finder에 오신 것을 환영합니다";

  document.getElementById("authSubmitBtn").textContent =
    authMode === "signup" ? "가입하기" : "로그인";

  document.getElementById("authModalOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeAuthModal(){
  document.getElementById("authModalOverlay").classList.remove("open");
  document.body.style.overflow = "";
}

function handleOverlayClick(event){
  if(event.target === event.currentTarget){
    closeAuthModal();
  }
}

function showLogin(){
  openAuthModal("login");
}

function showSignup(){
  openAuthModal("signup");
}

function togglePasswordVisibility(){
  const pwInput = document.getElementById("authPassword");
  const toggleBtn = document.getElementById("pwToggleBtn");
  const show = pwInput.type === "password";

  pwInput.type = show ? "text" : "password";
  toggleBtn.textContent = show ? "🙈" : "👁";
}

async function login(){
  const id = document.getElementById("authEmail").value.trim();
  const pw = document.getElementById("authPassword").value.trim();

  if(id === "" || pw === ""){
    alert("이메일과 비밀번호를 입력해주세요.");
    return;
  }

  try{
    if(authMode === "signup"){
      await auth.createUserWithEmailAndPassword(id, pw);
      alert("가입이 완료되었습니다!");
    } else {
      await auth.signInWithEmailAndPassword(id, pw);
    }

    localStorage.setItem("login","true");
    localStorage.setItem("userId", id);

    closeAuthModal();

    location.hash = "analyze";
    showPage("analyzePage");

  } catch(error){
    if(error.code === "auth/email-already-in-use"){
      alert("이미 가입된 이메일입니다. 로그인해주세요.");
    } else if(error.code === "auth/weak-password"){
      alert("비밀번호는 6자 이상이어야 합니다.");
    } else if(error.code === "auth/invalid-credential" || error.code === "auth/wrong-password"){
      alert("이메일 또는 비밀번호가 올바르지 않습니다.");
    } else if(error.code === "auth/invalid-email"){
      alert("올바른 이메일 형식이 아닙니다.");
    } else {
      alert("오류가 발생했습니다: " + error.message);
    }
  }
}

function initGoogleLogin(){
  google.accounts.id.initialize({
    client_id: "173329146710-ub3mf93qrt7f8k02tr80ptr9p6rnhf0u.apps.googleusercontent.com",
    callback: handleGoogleCredential
  });

  google.accounts.id.renderButton(
    document.getElementById("googleLoginBtn"),
    { theme: "outline", size: "large", width: 280 }
  );
}

function handleGoogleCredential(response){
  const payload = JSON.parse(atob(response.credential.split(".")[1]));

  localStorage.setItem("login", "true");
  localStorage.setItem("userId", payload.email);
  localStorage.setItem("userName", payload.name);

  alert(payload.name + "님, 환영합니다!");

  closeAuthModal();

  location.hash = "analyze";
  showPage("analyzePage");
}

window.addEventListener("load", initGoogleLogin);

function logout(){
  auth.signOut().catch(err => console.error("로그아웃 오류:", err));

  localStorage.removeItem("login");
  localStorage.removeItem("userId");

  history.pushState({page:"main"}, "", "#main");
  showPage("mainPage");
}


/* ===== 얼굴형 ===== */

const shapeImages = {

  "Oval Face":"images/oval_shape.png",

  "Round Face":"images/round_shape.png",

  "Heart Face":"images/heart_shape.png",

  "Long Face":"images/long_shape.png",

  "Square Face":"images/square_shape.png"

};

const shapeKorean = {

  "Oval Face":"타원형",

  "Round Face":"둥근형",

  "Heart Face":"하트형",

  "Long Face":"긴 얼굴형",

  "Square Face":"각진형"

};

const skinToneDB = {

  warm:{
    name:"웜톤",
    recommend:[
      "초코 브라운",
      "카라멜 브라운",
      "골드 브라운"
    ],
    avoid:[
      "애쉬 그레이",
      "실버",
      "플래티넘"
    ]
  },

  cool:{
    name:"쿨톤",
    recommend:[
      "애쉬 브라운",
      "애쉬 그레이",
      "블루 블랙"
    ],
    avoid:[
      "오렌지 브라운",
      "골드 브라운",
      "레드 브라운"
    ]
  },

  neutral:{
    name:"뉴트럴톤",
    recommend:[
      "내추럴 블랙",
      "다크 브라운",
      "모카 브라운"
    ],
    avoid:[
      "비비드 레드",
      "브라이트 오렌지",
      "플래티넘"
    ]
  }

};

/* -----------------------------------------------------
   [피부톤 4계절 확장] 기존 웜/쿨/뉴트럴 판정은 그대로 두고,
   웜·쿨 톤에 한해 이미 계산해둔 ITA(밝기) 값으로 한 단계 더
   세분화한다 — 한국 퍼스널컬러 업계에서 통용되는 봄웜/여름쿨/
   가을웜/겨울쿨 분류. 뉴트럴톤은 4계절 어느 쪽에도 속하지 않는
   경계 영역이라 기존과 동일하게 세부 계절 없이 유지한다.
   ITA >= 28("중간" 밝기 이상)을 밝은 쪽(봄/여름), 미만을
   깊은 쪽(가을/겨울)으로 나눈다 — itaToBrightness()의 "중간"
   경계값을 그대로 재사용한 것.
   ----------------------------------------------------- */
const SEASON_ITA_THRESHOLD = 28;

const seasonDB = {

  springWarm:{
    name:"봄웜",
    recommend:[
      "캐러멜 브라운",
      "허니 브라운",
      "오렌지 브라운"
    ],
    avoid:[
      "애쉬 그레이",
      "버건디",
      "플래티넘"
    ]
  },

  autumnWarm:{
    name:"가을웜",
    recommend:[
      "초코 브라운",
      "카키 브라운",
      "다크 카라멜"
    ],
    avoid:[
      "애쉬 그레이",
      "실버",
      "플래티넘"
    ]
  },

  summerCool:{
    name:"여름쿨",
    recommend:[
      "로즈 브라운",
      "라벤더 애쉬",
      "애쉬 브라운"
    ],
    avoid:[
      "오렌지 브라운",
      "골드 브라운",
      "레드 브라운"
    ]
  },

  winterCool:{
    name:"겨울쿨",
    recommend:[
      "블루 블랙",
      "다크 애쉬",
      "버건디 브라운"
    ],
    avoid:[
      "오렌지 브라운",
      "골드 브라운",
      "베이지 브라운"
    ]
  }

};

function getSeason(tone, ita){

  if(tone === "warm"){
    return ita >= SEASON_ITA_THRESHOLD ? "springWarm" : "autumnWarm";
  }

  if(tone === "cool"){
    return ita >= SEASON_ITA_THRESHOLD ? "summerCool" : "winterCool";
  }

  return null;
}

/* ===== 피부톤 분석 =====

   [개선] 기존에는 사진 전체(배경·옷·머리카락 포함) 픽셀을 평균 내서
   R값과 B값만 단순 비교했기 때문에, 배경이나 옷 색에 따라 결과가
   크게 흔들리는 문제가 있었습니다.

   개선된 방식:
   1) 얼굴형 분석에 쓰는 랜드마크를 그대로 활용해 이마·양쪽 볼
      영역의 픽셀만 골라서 샘플링 (배경/머리카락/옷 배제)
   2) 그 픽셀들을 HSV로 변환해 Hue·Saturation 기준으로
      Warm/Cool/Neutral 3단계 분류 (기존엔 Neutral이 코드상 존재하지 않았음)
   3) CIELAB 변환 + ITA(Individual Typology Angle) 공식으로
      피부 밝기(명도)까지 함께 계산 — 추후 퍼스널컬러 4계절
      확장의 기반이 되는 값
   ----------------------------------------------------------- */

function rgbToHsv(r, g, b){

  r /= 255; g /= 255; b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;

  if(d !== 0){

    if(max === r) h = ((g - b) / d) % 6;
    else if(max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;

    h *= 60;
    if(h < 0) h += 360;

  }

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  return { h, s, v };
}

function rgbToLab(r, g, b){

  // sRGB -> linear RGB
  function toLinear(c){
    c /= 255;
    return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  }

  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);

  // linear RGB -> XYZ (sRGB, D65)
  const x = rl * 0.4124 + gl * 0.3576 + bl * 0.1805;
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  const z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505;

  // XYZ -> Lab (D65 white point)
  const xn = x / 0.95047;
  const yn = y / 1.00000;
  const zn = z / 1.08883;

  function f(t){
    return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
  }

  const fx = f(xn), fy = f(yn), fz = f(zn);

  const L = (116 * fy) - 16;
  const a = 500 * (fx - fy);
  const bLab = 200 * (fy - fz);

  return { L, a, b: bLab };
}

function calcITA(L, bLab){
  return Math.atan((L - 50) / bLab) * (180 / Math.PI);
}

function itaToBrightness(ita){

  if(ita > 55) return "매우 밝음";
  if(ita > 41) return "밝음";
  if(ita > 28) return "중간";
  if(ita > 10) return "어두운 편";
  if(ita > -30) return "갈색";
  return "어두움";
}

function samplePatch(imgData, canvas, cx, cy, radius){

  let r = 0, g = 0, b = 0, count = 0;

  const w = canvas.width;
  const h = canvas.height;

  for(let dy = -radius; dy <= radius; dy++){
    for(let dx = -radius; dx <= radius; dx++){

      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);

      if(px < 0 || py < 0 || px >= w || py >= h) continue;

      const idx = (py * w + px) * 4;

      r += imgData.data[idx];
      g += imgData.data[idx + 1];
      b += imgData.data[idx + 2];

      count++;

    }
  }

  if(count === 0) return null;

  return { r: r / count, g: g / count, b: b / count };
}

function detectSkinTone(){

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // 얼굴형 분석 때와 동일한 방식으로 픽셀 좌표 변환
  // (회전 정렬은 하지 않음 — 실제 이미지 픽셀 위치를 그대로 읽어야 하므로)
  const lm = toPixelLandmarks(faceLandmarks, canvas);

  // 이마 중앙(151) + 양쪽 볼(50, 280) — 눈/입술/머리카락 경계를 피한
  // 안전한 피부 영역 포인트
  const samplePoints = [
    lm[151], // 이마 중앙 (눈썹 사이 위쪽)
    lm[50],  // 왼쪽 볼
    lm[280], // 오른쪽 볼
    lm[108], // 왼쪽 이마
    lm[337], // 오른쪽 이마
  ];

  const patchRadius = Math.max(3, Math.round(canvas.width * 0.01));

  let r = 0, g = 0, b = 0, n = 0;

  samplePoints.forEach(function(p){

    const patch = samplePatch(imgData, canvas, p.x, p.y, patchRadius);

    if(patch){
      r += patch.r;
      g += patch.g;
      b += patch.b;
      n++;
    }

  });

  if(n === 0){
    // 랜드마크 기반 샘플링이 실패하면(드묾) 기존 방식으로 대체
    return { tone:"neutral", ita:0 };
  }

  r /= n; g /= n; b /= n;

  const hsv = rgbToHsv(r, g, b);
  const lab = rgbToLab(r, g, b);
  const ita = calcITA(lab.L, lab.b);

  // 참고용 로그 (콘솔에서 실제 값 확인 가능)
  console.log(
    "[피부톤] RGB:", Math.round(r), Math.round(g), Math.round(b),
    "| Lab b*(황색축):", lab.b.toFixed(1),
    "| ITA:", ita.toFixed(1), "(" + itaToBrightness(ita) + ")"
  );

  /* 웜/쿨 판단은 HSV Hue가 아니라 LAB의 b*(황색-청색 축) 값을 씁니다.
     피부색은 원래 파란 계열 Hue가 나올 수 없어서(항상 붉은-주황
     계열), Hue 임계값 비교는 애초에 잘 맞지 않는 방법이었습니다.
     b*가 높을수록 황색(웜), 낮을수록 상대적으로 붉은/핑크(쿨) 기운이
     강하다는 게 피부색 과학에서 쓰는 실제 기준입니다. */
  if(lab.b > 21){
    return { tone:"warm", ita };
  }

  if(lab.b < 15){
    return { tone:"cool", ita };
  }

  return { tone:"neutral", ita };
}

/* ===== 성별 ===== */

function setGender(g){

  gender = g;

  document
  .getElementById("maleBtn")
  .classList
  .remove("active");

  document
  .getElementById("femaleBtn")
  .classList
  .remove("active");

  if(g==="male"){
    document
    .getElementById("maleBtn")
    .classList
    .add("active");
  }
  else{
    document
    .getElementById("femaleBtn")
    .classList
    .add("active");
  }
}

/* ===== MediaPipe ===== */

const faceMesh = new FaceMesh({
  locateFile:(file)=>{
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
  }
});

faceMesh.setOptions({

  maxNumFaces:1,

  refineLandmarks:true,

  minDetectionConfidence:0.5,

  minTrackingConfidence:0.5

});

faceMesh.onResults(onResults);

function onResults(results){

  if(
    results.multiFaceLandmarks &&
    results.multiFaceLandmarks.length > 0
  ){

    faceLandmarks =
    results.multiFaceLandmarks[0];

  }
  else{

    faceLandmarks = null;

  }
}

async function startCamera(){

  if(activeCamera){
    activeCamera.stop();
    activeCamera = null;
  }

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    alert("이 브라우저에서는 카메라를 사용할 수 없습니다.");
    return;
  }

  let stream;

  try{

    // 모바일에서 얼굴 인식을 위해 후면이 아닌 전면 카메라를 우선 사용
    // (ideal이라 전면 카메라가 없는 데스크톱 웹캠에서도 그대로 동작함)
    stream =
    await navigator.mediaDevices.getUserMedia({
      video:{
        facingMode:{ ideal:"user" }
      }
    });

  }
  catch(error){

    console.error(error);

    if(error.name === "NotAllowedError"){
      alert("카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요.");
    }
    else if(error.name === "NotFoundError"){
      alert("사용 가능한 카메라를 찾을 수 없습니다.");
    }
    else{
      alert("카메라를 시작할 수 없습니다.");
    }

    return;

  }

  const video =
  document.getElementById("camera");

  const preview =
  document.getElementById("preview");

  video.srcObject = stream;
  video.style.display = "block";
  preview.style.display = "none";

  const camera = new Camera(video,{

    onFrame: async ()=>{

      await faceMesh.send({
        image:video
      });

    },

    width:640,
    height:480

  });

  camera.start();

  activeCamera = camera;
}

async function capturePhoto(){

  const video =
  document.getElementById("camera");

  const canvas =
  document.getElementById("canvas");

  const preview =
  document.getElementById("preview");

  const ctx =
  canvas.getContext("2d");

  canvas.width =
  video.videoWidth;

  canvas.height =
  video.videoHeight;

  // #camera는 CSS로 좌우반전(scaleX(-1))되어 거울처럼 보이므로,
  // 캔버스에 한 번 더 반전을 걸어 실제 저장/분석되는 사진은
  // 좌우반전 없는 정상 방향으로 남도록 처리
  ctx.save();

  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);

  ctx.drawImage(
    video,
    0,
    0
  );

  ctx.restore();

  /* 촬영 즉시 웹캠 루프를 멈춘다. 계속 켜둔 채로 두면 백그라운드의
     onFrame이 (좌우반전되지 않은) 원본 비디오 프레임을 계속
     faceMesh로 보내서, 아래에서 다시 계산하는 "정방향 보정 사진
     기준" 랜드마크를 뒤이어 덮어써버리는 문제가 있었다. 그 결과
     분석 상세의 측정선 오버레이가 실제 사진과 어긋나 보였음. */
  if(activeCamera){
    activeCamera.stop();
    activeCamera = null;
  }

  if(video.srcObject){
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }

  currentImage =
  canvas.toDataURL("image/png");

  preview.src =
  currentImage;

  preview.style.display = "block";
  video.style.display = "none";

  faceLandmarks = null;

  /* preview.src를 막 바꾼 직후라 이미지가 디코딩되기 전일 수 있다.
     로드가 끝나기 전에 faceMesh.send(preview)를 호출하면 이전
     프레임이나 빈 이미지를 기준으로 랜드마크를 계산해버려서,
     실제 저장된 사진과 좌표가 어긋나는 원인이 될 수 있으므로
     완전히 로드될 때까지 기다린다. */
  if(!(preview.complete && preview.naturalWidth > 0)){
    await new Promise((resolve)=>{
      preview.onload = resolve;
    });
  }

  await faceMesh.send({
    image:preview
  });
}

async function uploadImage(event){

  const file =
  event.target.files[0];

  if(!file) return;

  faceLandmarks = null;
  currentImage = null;

  const img =
  new Image();

  img.src =
  URL.createObjectURL(file);

  img.onload = async ()=>{

    const canvas =
    document.getElementById("canvas");

    const ctx =
    canvas.getContext("2d");

    canvas.width =
    img.naturalWidth;

    canvas.height =
    img.naturalHeight;

    ctx.drawImage(
      img,
      0,
      0,
      canvas.width,
      canvas.height
    );

    currentImage =
    canvas.toDataURL("image/png");

    const preview =
    document.getElementById("preview");

    preview.src =
    currentImage;

    preview.style.display = "block";

    document
    .getElementById("camera")
    .style
    .display = "none";

    try{

      await faceMesh.send({
        image:img
      });

    }
    catch(error){

      console.error(error);

      alert(
        "얼굴 분석 중 오류가 발생했습니다."
      );

    }
  };
}

function dist(a,b){

  return Math.sqrt(
    Math.pow(a.x-b.x,2) +
    Math.pow(a.y-b.y,2)
  );
}

function angle(a,b,c){

  const ba = {
    x:a.x-b.x,
    y:a.y-b.y
  };

  const bc = {
    x:c.x-b.x,
    y:c.y-b.y
  };

  const dot =
  ba.x*bc.x + ba.y*bc.y;

  const mag1 =
  Math.sqrt(
    ba.x*ba.x + ba.y*ba.y
  );

  const mag2 =
  Math.sqrt(
    bc.x*bc.x + bc.y*bc.y
  );

  const cos =
  dot / (mag1*mag2);

  return Math.acos(
    Math.min(
      Math.max(cos,-1),
      1
    )
  ) * 180 / Math.PI;
}

function clamp(value,min,max){

  return Math.max(
    min,
    Math.min(max,value)
  );
}

/* -----------------------------------------------------
   [1단계 추가] 정규화 좌표(0~1) → 실제 픽셀 좌표로 변환
   MediaPipe 랜드마크는 x는 이미지 가로폭, y는 이미지 세로폭
   기준으로 각각 다르게 정규화되어 있어서, 이미지가 정사각형이
   아니면 dist()/angle() 계산이 비율만큼 왜곡됩니다.
   ----------------------------------------------------- */
function toPixelLandmarks(landmarksRaw, canvas){

  const w = canvas.width;
  const h = canvas.height;

  return landmarksRaw.map(function(lm){
    return {
      x: lm.x * w,
      y: lm.y * h
    };
  });
}

/* -----------------------------------------------------
   [1단계 추가] 얼굴 회전(roll) 보정
   두 눈 바깥쪽 끝점(33, 263)을 기준으로 얼굴이 기울어진
   각도를 구하고, 그 각도만큼 모든 랜드마크를 반대로 회전시켜
   "수평으로 정렬된" 좌표로 만듭니다. 사진 속 고개가 살짝
   기울어져 있어도 측정값이 흔들리지 않게 하기 위한 단계입니다.
   ----------------------------------------------------- */
function alignLandmarks(pixelLandmarks){

  const rightEye = pixelLandmarks[33];
  const leftEye  = pixelLandmarks[263];

  const rollAngle = Math.atan2(
    leftEye.y - rightEye.y,
    leftEye.x - rightEye.x
  );

  const cx = (rightEye.x + leftEye.x) / 2;
  const cy = (rightEye.y + leftEye.y) / 2;

  const cos = Math.cos(-rollAngle);
  const sin = Math.sin(-rollAngle);

  return pixelLandmarks.map(function(p){

    const dx = p.x - cx;
    const dy = p.y - cy;

    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  });
}

/* -----------------------------------------------------
   [1단계 추가] 위 두 단계를 한번에 처리하는 헬퍼 함수
   ----------------------------------------------------- */
function getAlignedLandmarks(landmarksRaw){

  const canvas = document.getElementById("canvas");

  const pixelLandmarks = toPixelLandmarks(landmarksRaw, canvas);
  const aligned = alignLandmarks(pixelLandmarks);

  return aligned;
}

/* -----------------------------------------------------
   [분석 상세 - 시각화] 실제 업로드 사진 위에 판별 근거로 쓰인
   측정선(세로/가로, 턱/광대, 이마/턱, 턱 각도)을 그려서 보여준다.
   landmarksRaw는 MediaPipe 원본(0~1 정규화, 회전 보정 전) 좌표를
   그대로 쓴다 — 캔버스에 표시되는 원본 사진과 좌표계가 그대로
   맞아야 하므로, 분류 계산에 쓰인 회전 보정 좌표(lm)와는 별개다.
   ----------------------------------------------------- */
function drawMeasurementOverlay(landmarksRaw, values){

  const canvas =
  document.getElementById("measureCanvas");

  if(!canvas || !currentImage) return;

  const ctx = canvas.getContext("2d");

  const img = new Image();

  img.onload = ()=>{

    const size = 320;

    canvas.width = size;
    canvas.height = size;

    const scale =
    Math.min(size / img.naturalWidth, size / img.naturalHeight);

    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const offX = (size - drawW) / 2;
    const offY = (size - drawH) / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, offX, offY, drawW, drawH);

    const pt = (i)=>({
      x: offX + landmarksRaw[i].x * drawW,
      y: offY + landmarksRaw[i].y * drawH
    });

    function line(a, b, color){
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      [a, b].forEach(p=>{
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    line(pt(10), pt(152), "#ef4444");   // 세로(이마-턱)
    line(pt(234), pt(454), "#ef4444");  // 가로(좌-우)
    line(pt(172), pt(397), "#3b82f6");  // 턱선
    line(pt(93), pt(323), "#3b82f6");   // 광대
    line(pt(103), pt(332), "#22c55e");  // 이마
    line(pt(172), pt(152), "#f59e0b");  // 턱 각도(왼쪽 변)
    line(pt(397), pt(152), "#f59e0b");  // 턱 각도(오른쪽 변)

    ctx.font = "bold 13px 'Malgun Gothic', sans-serif";
    ctx.fillStyle = "#111827";
    ctx.fillRect(6, 6, 128, 78);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(6, 6, 128, 78);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#111827";
    ctx.fillText(`세로/가로 ${values.lw.toFixed(2)}`, 12, 22);
    ctx.fillText(`턱/광대 ${values.jc.toFixed(2)}`, 12, 40);
    ctx.fillText(`이마/턱 ${values.fj.toFixed(2)}`, 12, 58);
    ctx.fillText(`턱 각도 ${values.ja.toFixed(0)}°`, 12, 76);
  };

  img.src = currentImage;

  canvas.style.display = "block";

  const legend =
  document.getElementById("measureLegend");

  if(legend) legend.style.display = "flex";
}

function linearScore(
  value,
  target,
  tolerance,
  maxScore
){

  const diff =
  Math.abs(value-target);

  if(diff >= tolerance) return 0;

  return Math.round(
    (1 - diff / tolerance) * maxScore
  );
}

function classifyDetailed(lw, jc, fj, fc, ja, twCw, chinTaper, jawSquareness, widthUniformity, chinAngle){

  const model = gbModel;
  const rawInput = [lw, jc, fj, fc, ja, twCw, chinTaper, jawSquareness, widthUniformity, chinAngle];
  const z = rawInput.map(function(v,i){ return (v - model.mean[i]) / model.scale[i]; });

  const nClasses = model.classes.length;
  const raw = model.init.slice();

  for(let s=0; s<model.trees.length; s++){
    const stage = model.trees[s];
    for(let c=0; c<nClasses; c++){
      raw[c] += model.learning_rate * evalGBTree(stage[c], z);
    }
  }

  const maxRaw = Math.max.apply(null, raw);
  const expScores = raw.map(function(v){ return Math.exp(v - maxRaw); });
  const sumExp = expScores.reduce(function(a,b){ return a+b; }, 0);

  const result = model.classes.map(function(cls, c){
    return {
      shape: cls,
      raw: Math.round((expScores[c]/sumExp)*100),
      percent: Math.round((expScores[c]/sumExp)*100)
    };
  }).sort(function(a,b){ return b.percent - a.percent; });

  return {
    shape: result[0].shape,
    subShape: result[1].shape,
    scores: result,
    values: {lw:lw,jc:jc,fj:fj,fc:fc,ja:ja}
  };
}

function getAnalysisReason(analysis){

  const shape =
  analysis.shape;

  const values =
  analysis.values;

  const lw =
  values.lw.toFixed(2);

  const jc =
  values.jc.toFixed(2);

  const fj =
  values.fj.toFixed(2);

  const fc =
  values.fc.toFixed(2);

  const ja =
  values.ja.toFixed(1);

  if(shape === "Oval Face"){

    return `얼굴 세로·가로 비율이 ${lw}이고 턱/광대 비율 ${jc}, 턱 각도 ${ja}도가 안정적으로 측정되어 전체적으로 균형 잡힌 Oval Face로 판단했습니다.`;

  }

  if(shape === "Round Face"){

    return `얼굴 세로·가로 비율이 ${lw}로 비교적 짧고 턱선이 부드럽게 측정되어 Round Face 특징이 강하게 나타났습니다.`;

  }

  if(shape === "Heart Face"){

    return `이마/턱 비율 ${fj}, 이마/광대 비율 ${fc}를 기준으로 이마가 넓고 턱선이 좁은 Heart Face 특징이 나타났습니다.`;

  }

  if(shape === "Long Face"){

    return `얼굴 세로·가로 비율이 ${lw}로 높게 측정되어 얼굴이 세로로 긴 Long Face 특징이 나타났습니다.`;

  }

  return `턱/광대 비율 ${jc}와 턱 각도 ${ja}도를 기준으로 턱선이 비교적 또렷한 Square Face 특징이 나타났습니다.`;
}

/* -----------------------------------------------------
   얼굴형별 추천 근거 원칙 (학술 문헌 기반)
   출처: Pasupa, K., Sunhem, W., & Loo, C. K. (2019).
   A Hybrid Approach to Building Face Shape Classifier for
   Hairstyle Recommender System. Expert Systems With
   Applications, 120, 14-32.
   아래 principle은 논문 본문 Algorithm 1(IsItSuitable)에 실제
   명시된 길이(length)·스타일(style)·앞머리(bang)·레이어드(layered)
   조합별 추천/비추천 판정 규칙을 그대로 옮긴 것이다. 이 알고리즘
   자체는 Derrick(2017), Hong(2013)의 미용 전문가 가이드라인을
   인코딩한 것이라고 논문이 명시하고 있다.
   confidence: "high" = Algorithm 1에서 해당 얼굴형의 추천/비추천
               조건이 명시적으로 정의되어 있음
   ----------------------------------------------------- */
const faceShapePrinciples = {

  "Oval Face":{
    principle:"대부분의 헤어스타일이 무난하게 잘 어울리는 균형 잡힌 얼굴형이에요. 다만 아주 짧은 픽시컷처럼 극단적인 스타일은 피하는 게 좋아요.",
    source:"Pasupa, Sunhem & Loo (2019), Expert Systems With Applications — Algorithm 1",
    confidence:"high"
  },

  "Round Face":{
    principle:"층을 낸 레이어드컷이나 옆으로 넘긴 앞머리처럼 세로로 시선을 끄는 스타일이 둥근 느낌을 줄여줘요. 반대로 일자로 딱 자른 뱅은 얼굴을 더 둥글어 보이게 할 수 있어요.",
    source:"Pasupa, Sunhem & Loo (2019), Expert Systems With Applications — Algorithm 1",
    confidence:"high"
  },

  "Square Face":{
    principle:"웨이브 펌이나 옆으로 넘긴 앞머리가 각진 턱선을 부드럽게 감싸줘요. 반대로 일자로 자른 뱅이나 짧은 커트는 턱선을 더 각지게 보이게 할 수 있어요.",
    source:"Pasupa, Sunhem & Loo (2019), Expert Systems With Applications — Algorithm 1",
    confidence:"high"
  },

  "Heart Face":{
    principle:"웨이브 펌이나 옆으로 넘긴 앞머리가 넓은 이마와 좁은 턱의 균형을 맞춰줘요. 반대로 정중앙에 일자로 내린 앞머리는 이마를 더 넓어 보이게 할 수 있어요.",
    source:"Pasupa, Sunhem & Loo (2019), Expert Systems With Applications — Algorithm 1",
    confidence:"high"
  },

  "Long Face":{
    principle:"앞머리가 있거나 웨이브를 준 스타일이 세로로 긴 느낌을 줄여줘요. 반대로 앞머리 없이 길게 늘어뜨린 생머리는 얼굴을 더 길어 보이게 할 수 있어요.",
    source:"Pasupa, Sunhem & Loo (2019), Expert Systems With Applications — Algorithm 1",
    confidence:"high"
  }

};

const hairDB = [
{
  name:"레이어드컷",
  image:"images/Layeredcut.jpg",
  gender:"female",
  primaryFaceShape:"Oval Face",
  type:"long",
  style:"soft",
  reason:"Oval Face는 전체적인 얼굴 비율이 균형 잡혀 있어 레이어드컷이 얼굴선을 자연스럽게 살려줍니다.",
  point:"얼굴 옆 라인을 부드럽게 감싸 자연스럽고 여성스러운 분위기를 연출할 수 있습니다.",
  tags:["Oval 추천","얼굴선 보완","자연스러움"]
},
{
  name:"C컬펌",
  image:"images/C-curlperm.jpg",
  gender:"female",
  primaryFaceShape:"Oval Face",
  type:"medium",
  style:"soft",
  reason:"Oval Face는 턱선과 얼굴 비율이 안정적이기 때문에 C컬펌처럼 단정한 스타일이 잘 어울립니다.",
  point:"끝부분의 C컬이 턱선을 자연스럽게 감싸 깔끔하고 부드러운 인상을 줍니다.",
  tags:["Oval 추천","단정함","중간 기장"]
},
{
  name:"웨이브펌",
  image:"images/Waveperm.jpg",
  gender:"female",
  primaryFaceShape:"Oval Face",
  type:"long",
  style:"casual",
  reason:"Oval Face는 다양한 스타일을 소화하기 쉬워 자연스러운 웨이브펌도 잘 어울립니다.",
  point:"웨이브가 얼굴 주변에 입체감을 만들어 부드럽고 자연스러운 분위기를 줍니다.",
  tags:["Oval 추천","입체감","캐주얼"]
},
{
  name:"S컬펌",
  image:"images/S-curlperm.jpg",
  gender:"female",
  primaryFaceShape:"Round Face",
  type:"long",
  style:"soft",
  reason:"Round Face는 얼굴 양옆에 세로 흐름을 만들어주는 S컬펌이 둥근 인상을 완화해줍니다.",
  point:"S컬의 흐름이 얼굴 옆선을 길어 보이게 하여 부드럽고 갸름한 느낌을 줄 수 있습니다.",
  tags:["Round 추천","세로 라인","볼륨감"]
},
{
  name:"히피펌",
  image:"images/Hippieperm.jpg",
  gender:"female",
  primaryFaceShape:"Round Face",
  type:"long",
  style:"casual",
  reason:"Round Face는 위아래 볼륨과 움직임이 있는 스타일이 얼굴의 둥근 느낌을 분산시켜줍니다.",
  point:"풍성한 컬이 개성 있는 분위기를 만들고 얼굴형의 단조로움을 줄여줍니다.",
  tags:["Round 추천","개성","볼륨"]
},
{
  name:"글램펌",
  image:"images/Glamperm.png",
  gender:"female",
  primaryFaceShape:"Heart Face",
  type:"long",
  style:"soft",
  reason:"Heart Face는 이마가 넓고 턱선이 좁아 보일 수 있어 아래쪽 볼륨이 있는 글램펌이 균형을 맞춰줍니다.",
  point:"턱 주변에 볼륨감을 더해 얼굴 아래쪽이 너무 좁아 보이지 않도록 보완합니다.",
  tags:["Heart 추천","아래 볼륨","여성스러움"]
},
{
  name:"히메컷",
  image:"images/Himecut.jpg",
  gender:"female",
  primaryFaceShape:"Square Face",
  type:"long",
  style:"clean",
  reason:"Square Face는 각진 턱선을 부드럽게 가려주는 옆 라인 스타일이 잘 어울립니다.",
  point:"옆머리 라인이 턱선을 감싸 각진 느낌을 완화해줍니다.",
  tags:["Square 추천","턱선 보완","깔끔"]
},
{
  name:"미디엄 C컬펌",
  image:"images/C-curlperm.jpg",
  gender:"female",
  primaryFaceShape:"Long Face",
  type:"medium",
  style:"soft",
  reason:"Long Face는 너무 긴 생머리보다 중간 기장의 C컬펌이 얼굴 길이를 시각적으로 완화해줍니다.",
  point:"턱 주변에 볼륨을 만들어 얼굴이 지나치게 길어 보이는 느낌을 줄입니다.",
  tags:["Long 추천","중간 기장","길이 보완"]
},
{
  name:"애즈펌",
  image:"images/Aspermcut.png",
  gender:"male",
  primaryFaceShape:"Oval Face",
  type:"medium",
  style:"soft",
  reason:"Oval Face는 얼굴 비율이 균형 잡혀 있어 자연스러운 앞머리 흐름의 애즈펌이 잘 어울립니다.",
  point:"부드럽고 깔끔한 인상을 줄 수 있어 부담 없이 적용하기 좋은 남성 스타일입니다.",
  tags:["Oval 추천","부드러움","남성 스타일"]
},
{
  name:"리프컷",
  image:"images/Leafcut.png",
  gender:"male",
  primaryFaceShape:"Oval Face",
  type:"medium",
  style:"casual",
  reason:"Oval Face는 다양한 스타일을 소화하기 쉬워 얼굴 옆선을 자연스럽게 감싸는 리프컷도 잘 어울립니다.",
  point:"트렌디하면서도 얼굴선을 부드럽게 보완할 수 있습니다.",
  tags:["Oval 추천","트렌디","얼굴선 보완"]
},
{
  name:"시스루뱅",
  image:"images/Seethroughbang.png",
  gender:"male",
  primaryFaceShape:"Oval Face",
  type:"medium",
  style:"soft",
  reason:"Oval Face는 이마와 턱선의 비율이 안정적이어서 가벼운 앞머리 스타일이 자연스럽게 어울립니다.",
  point:"답답하지 않은 앞머리로 부드럽고 깔끔한 이미지를 만들 수 있습니다.",
  tags:["Oval 추천","앞머리","부드러움"]
},
{
  name:"쉐도우펌",
  image:"images/Shadowperm.png",
  gender:"male",
  primaryFaceShape:"Round Face",
  type:"medium",
  style:"casual",
  reason:"Round Face는 볼륨감 있는 쉐도우펌이 얼굴의 밋밋한 느낌을 줄이고 입체감을 만들어줍니다.",
  point:"윗부분 볼륨으로 얼굴이 조금 더 길어 보이는 효과를 줄 수 있습니다.",
  tags:["Round 추천","볼륨","입체감"]
},
{
  name:"투블럭컷",
  image:"images/Twoblockcut.png",
  gender:"male",
  primaryFaceShape:"Round Face",
  type:"short",
  style:"clean",
  reason:"Round Face는 옆머리를 정리한 투블럭컷으로 얼굴 옆 라인을 깔끔하게 잡아줄 수 있습니다.",
  point:"둥근 인상을 줄이고 단정한 이미지를 만들 수 있습니다.",
  tags:["Round 추천","깔끔","옆라인 정리"]
},
{
  name:"가일컷",
  image:"images/Gailcut.png",
  gender:"male",
  primaryFaceShape:"Heart Face",
  type:"short",
  style:"clean",
  reason:"Heart Face는 이마가 넓어 보일 수 있어 가일컷처럼 앞머리 방향을 잡아주는 스타일이 잘 어울립니다.",
  point:"이마 라인을 자연스럽게 보완하면서 세련된 인상을 줍니다.",
  tags:["Heart 추천","세련됨","이마 보완"]
},
{
  name:"드롭컷",
  image:"images/Dropcut.png",
  gender:"male",
  primaryFaceShape:"Long Face",
  type:"short",
  style:"clean",
  reason:"Long Face는 얼굴이 길어 보일 수 있어 앞머리와 옆라인을 안정적으로 잡아주는 드롭컷이 잘 어울립니다.",
  point:"윗머리 높이를 과하게 만들지 않아 얼굴 길이를 시각적으로 완화합니다.",
  tags:["Long 추천","짧은 머리","길이 보완"]
},
{
  name:"텍스처컷",
  image:"images/Texture.png",
  gender:"male",
  primaryFaceShape:"Long Face",
  type:"short",
  style:"casual",
  reason:"Long Face는 자연스러운 질감과 움직임이 있는 텍스처컷으로 시선을 분산시킬 수 있습니다.",
  point:"머리의 질감과 볼륨을 적절히 살려 얼굴 길이를 보완합니다.",
  tags:["Long 추천","질감","캐주얼"]
},
{
  name:"크롭컷",
  image:"images/Cropcut.png",
  gender:"male",
  primaryFaceShape:"Square Face",
  type:"short",
  style:"clean",
  reason:"Square Face는 각진 턱선이 강해 보일 수 있어 깔끔한 크롭컷으로 전체 인상을 정리할 수 있습니다.",
  point:"강한 턱선을 남성적으로 살리면서 단정한 이미지를 줍니다.",
  note:"참고: 여성 스타일링 원칙은 각진 턱선을 '완화'하는 방향이지만, 남성 그루밍에서는 뚜렷한 턱선을 매력 포인트로 '강조'하는 것이 일반적인 관례입니다. 이 항목은 그 관례를 따른 것으로, 원 문헌의 여성 기준 원칙과는 방향이 반대입니다.",
  tags:["Square 추천","깔끔","남성적"]
},
{
  name:"페이드컷",
  image:"images/Fadecut.png",
  gender:"male",
  primaryFaceShape:"Square Face",
  type:"short",
  style:"clean",
  reason:"Square Face는 옆머리를 정리하는 페이드컷으로 얼굴 윤곽을 깔끔하게 정돈할 수 있습니다.",
  point:"각진 얼굴형의 장점을 살리면서 세련된 분위기를 만듭니다.",
  note:"참고: 여성 스타일링 원칙은 각진 턱선을 '완화'하는 방향이지만, 남성 그루밍에서는 뚜렷한 턱선을 매력 포인트로 '강조'하는 것이 일반적인 관례입니다. 이 항목은 그 관례를 따른 것으로, 원 문헌의 여성 기준 원칙과는 방향이 반대입니다.",
  tags:["Square 추천","페이드","세련됨"]
},
{
  name:"포마드컷",
  image:"images/Pomadecut.png",
  gender:"male",
  primaryFaceShape:"Square Face",
  type:"short",
  style:"clean",
  reason:"Square Face는 또렷한 턱선과 포마드컷의 정돈된 라인이 잘 어울립니다.",
  point:"성숙하고 깔끔한 이미지를 연출할 수 있습니다.",
  note:"참고: 여성 스타일링 원칙은 각진 턱선을 '완화'하는 방향이지만, 남성 그루밍에서는 뚜렷한 턱선을 매력 포인트로 '강조'하는 것이 일반적인 관례입니다. 이 항목은 그 관례를 따른 것으로, 원 문헌의 여성 기준 원칙과는 방향이 반대입니다.",
  tags:["Square 추천","정돈됨","클래식"]
},

/* -----------------------------------------------------
   아래 4개는 추천 스타일 종류를 확장하면서 추가한 항목이다.
   images/ 폴더에 이미 있었지만 어떤 얼굴형에도 연결되어 있지
   않던 사진들을, Algorithm 1(script.js 상단 faceShapePrinciples
   주석 참고)의 추천 조건에 맞는 얼굴형에 배정했다. 특히 가장
   항목이 적었던 Heart Face(여성), Square Face(여성),
   Long Face(여성)를 우선 보강했다.
   ----------------------------------------------------- */
{
  name:"트위스터펌",
  image:"images/Twisterperm.jpg",
  gender:"female",
  primaryFaceShape:"Heart Face",
  type:"long",
  style:"casual",
  reason:"Heart Face는 풍성한 웨이브나 컬이 있는 스타일이 이마와 턱의 균형을 맞춰줘요. 트위스터펌처럼 볼륨감 있는 롱 펌이 잘 어울립니다.",
  point:"자연스러운 웨이브와 볼륨감이 좁은 턱선 주변을 부드럽게 채워줍니다.",
  tags:["Heart 추천","볼륨","개성있는 컬"]
},
{
  name:"언발란스컷",
  image:"images/Unbalancedcut.jpg",
  gender:"female",
  primaryFaceShape:"Heart Face",
  type:"short",
  style:"clean",
  reason:"Heart Face는 사이드로 넘긴 비대칭 앞머리가 넓은 이마를 자연스럽게 가려주면서 세련된 느낌을 줍니다.",
  point:"한쪽으로 쏠린 언발란스 라인이 이목구비에 포인트를 주고 개성 있는 분위기를 만듭니다.",
  tags:["Heart 추천","사이드뱅","비대칭"]
},
{
  name:"웨이비펌",
  image:"images/Wavyperm.jpg",
  gender:"female",
  primaryFaceShape:"Square Face",
  type:"long",
  style:"soft",
  reason:"Square Face는 부드러운 웨이브 펌이 각진 턱선을 자연스럽게 감싸줘요. 느슨한 웨이브와 사이드 뱅이 각진 느낌을 완화합니다.",
  point:"굵은 웨이브가 얼굴 옆선을 부드럽게 흘러내리며 부드러운 인상을 더해줍니다.",
  tags:["Square 추천","웨이브","부드러움"]
},
{
  name:"블런트컷",
  image:"images/Bluntcut.jpg",
  gender:"female",
  primaryFaceShape:"Long Face",
  type:"medium",
  style:"clean",
  reason:"Long Face는 세로 길이를 과하게 늘리지 않는 미디엄 길이가 잘 어울려요. 어깨 위에서 깔끔하게 떨어지는 블런트컷이 시선을 분산시켜줍니다.",
  point:"턱선보다 아래, 어깨 쪽에서 끝나는 라인이 얼굴이 길어 보이는 느낌을 줄여줍니다.",
  tags:["Long 추천","단정함","미디엄 기장"]
}
];

/* ===== 연예인 데이터 ===== */

const celebrityByFaceShape = {

  "Oval Face":[
    {name:"수지",image:"images/suji.jpg"},
    {name:"아이유",image:"images/iu.jpg"},
    {name:"박보검",image:"images/parkbogum.jpg"}
  ],

  "Round Face":[
    {name:"박보영",image:"images/parkboyoung.jpg"},
    {name:"김세정",image:"images/kimsejeong.jpg"},
    {name:"조세호",image:"images/joseho.jpg"}
  ],

  "Heart Face":[
    {name:"장원영",image:"images/jangwonyoung.jpg"},
    {name:"한예슬",image:"images/hanyeseul.jpg"},
    {name:"이종석",image:"images/leejongsuk.jpg"}
  ],

  "Long Face":[
    {name:"김고은",image:"images/kimgoeun.jpg"},
    {name:"이동욱",image:"images/leedongwook.jpg"}
  ],

  "Square Face":[
    {name:"전지현",image:"images/junjihyun.jpg"},
    {name:"정우성",image:"images/jungwoosung.jpg"},
    {name:"마동석",image:"images/madongseok.jpg"}
  ]

};

/* ===== 워스트 스타일 ===== */

/* -----------------------------------------------------
   비추천 스타일 목록
   items: { name: 비추천 스타일 이름, reason: 왜 이 얼굴형엔
           안 어울리는지 구체적으로 풀어쓴 설명 } — 항목마다
           다른, 이해하기 쉬운 이유를 담는다 (템플릿 문구 재사용 X)
   confidence: "high"  = faceShapePrinciples와 직접 대응되는
               항목
               "low"   = 원 문헌에 명시적 근거가 약하고
               관례적으로 통용되는 추정에 가까운 항목
   ----------------------------------------------------- */
const worstHairDB = {

  "Round Face":{
    items:[
      { name:"무거운 일자단발", reason:"귀 밑에서 일자로 뚝 자른 단발은 옆으로 볼륨이 생겨서 얼굴이 더 둥글고 넓어 보일 수 있어요." },
      { name:"볼륨 없는 생머리", reason:"층 없이 밋밋하게 떨어지는 생머리는 세로 라인을 살려주지 못해서 얼굴이 더 넓적해 보일 수 있어요." },
      { name:"짧은 숏컷", reason:"귀 위로 짧게 자른 숏컷은 볼 라인을 그대로 드러내서 둥근 느낌을 가려주지 못해요." }
    ],
    confidence:"high"
  },

  "Oval Face":{
    items:[
      { name:"픽시컷 (매우 짧은 길이)", reason:"아주 짧게 자른 픽시컷은 균형 잡힌 얼굴 비율을 가려버려서 오히려 원래 장점을 살리지 못해요." },
      { name:"숏컷 + 웨이브펌 조합", reason:"짧은 길이에 웨이브까지 더하면 볼륨이 옆으로 퍼져서 자연스러운 균형이 깨질 수 있어요." }
    ],
    confidence:"high"
  },

  "Heart Face":{
    items:[
      { name:"정수리 볼륨 스타일", reason:"정수리에 볼륨을 준 스타일은 이마를 더 넓어 보이게 해서 위가 넓고 아래가 좁은 느낌을 강조해요." },
      { name:"짧은 앞머리", reason:"짧고 일자로 자른 앞머리는 넓은 이마를 그대로 드러내서 얼굴 위쪽이 더 커 보이게 해요." },
      { name:"위쪽 집중 펌", reason:"머리 위쪽에만 볼륨을 주는 펌은 좁은 턱과 대비되어 얼굴형이 더 불균형해 보일 수 있어요." }
    ],
    confidence:"high"
  },

  "Long Face":{
    items:[
      { name:"초장발 생머리", reason:"허리까지 오는 긴 생머리는 세로선을 강조해서 얼굴이 실제보다 더 길어 보이게 해요." },
      { name:"높은 포마드", reason:"정수리 위로 높게 세운 스타일은 세로 길이를 한층 더 늘려 보이게 만들어요." },
      { name:"정수리 볼륨펌", reason:"머리 위쪽에 볼륨을 주는 펌은 얼굴 길이를 더 강조해서 역효과가 날 수 있어요." }
    ],
    confidence:"high"
  },

  "Square Face":{
    items:[
      { name:"완전 밀착 숏컷", reason:"머리에 완전히 붙는 짧은 숏컷은 각진 턱선을 그대로 드러내서 더 딱딱해 보일 수 있어요." },
      { name:"일자 단발", reason:"일자로 뚝 잘린 단발선이 각진 턱선과 나란히 이어져서 각진 느낌을 두 배로 강조해요." },
      { name:"턱선 강조 스타일", reason:"턱 주변에 볼륨이나 포인트를 주는 스타일은 이미 뚜렷한 턱선을 더 도드라지게 만들어요." }
    ],
    confidence:"high"
  }

};

/* ===== 아코디언 (모바일) ===== */

function toggleAccordion(toggleEl){

  const box = toggleEl.parentElement;

  box.classList.toggle("open");

}

/* ===== 결과 탭 ===== */

function showResultTab(tabName){

  document.querySelectorAll(".tab-btn").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.querySelectorAll(".tab-panel").forEach(panel=>{
    panel.classList.toggle("active", panel.id === "tabPanel-" + tabName);
  });

}

/* ===== 얼굴형 점수 출력 ===== */

function renderScores(scores){

  const scoreResult =
  document.getElementById("scoreResult");

  scoreResult.innerHTML = "";

  scores.forEach(item=>{

    scoreResult.innerHTML += `
      <div class="score-item">
        <strong>${item.shape}</strong>
        ${item.percent}%

        <div class="score-bar">
          <div
            class="score-fill"
            style="width:${item.percent}%"
          ></div>
        </div>

      </div>
    `;

  });

}

/* ===== 추천 헤어 ===== */

function hairDetail(
  shape,
  gender,
  hairLength,
  style
){

  let result =
  hairDB.filter(hair=>

    hair.gender === gender &&
    hair.primaryFaceShape === shape

  );

  let filtered =
  result.filter(hair=>

    (hairLength === "" || hair.type === hairLength) &&
    (style === "" || hair.style === style)

  );

  if(filtered.length > 0){
    return filtered;
  }

  return result;
}

/* ===== 메인 분석 함수 ===== */

async function runRecommendation(){

  if(!gbModel){
    await gbModelPromise;
  }
  if(!gbModel){
    alert("모델을 아직 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  if(!currentImage){

    alert("사진을 업로드하세요!");
    return;

  }

  if(!faceLandmarks){

    alert(
      "얼굴을 인식하지 못했습니다!"
    );

    return;

  }

  const hairLength =
  document.getElementById("hairLengthSelect").value;

  const style =
  document.getElementById("styleSelect").value;

  const lm =
  getAlignedLandmarks(faceLandmarks);

  const top = lm[10];
  const chin = lm[152];

  const left = lm[234];
  const right = lm[454];

  const cheekL = lm[93];
  const cheekR = lm[323];

  const jawL = lm[172];
  const jawR = lm[397];

  const foreL = lm[103];
  const foreR = lm[332];

  const templeL = lm[127];
  const templeR = lm[356];

  const chinNarrowL = lm[149];
  const chinNarrowR = lm[378];

  const lowJawL = lm[214];
  const lowJawR = lm[434];

  const lw =
  dist(top,chin) /
  dist(left,right);

  const jc =
  dist(jawL,jawR) /
  dist(cheekL,cheekR);

  const fj =
  dist(foreL,foreR) /
  dist(jawL,jawR);

  const fc =
  dist(foreL,foreR) /
  dist(cheekL,cheekR);

  const ja =
  angle(
    jawL,
    chin,
    jawR
  );

  /* -----------------------------------------------------
     [3단계 추가] 5개 특징 추가
     twCw: 관자놀이/광대 폭 비율, chinTaper: 턱이 뾰족해지는 정도,
     jawSquareness: 아래턱이 각진 정도, widthUniformity: 이마/광대/턱
     세 폭의 균일성(오벌 단서), chinAngle: 턱 끝 각도
     ----------------------------------------------------- */
  const templeW = dist(templeL, templeR);
  const cheekW  = dist(cheekL, cheekR);
  const jawW    = dist(jawL, jawR);

  const twCw = templeW / cheekW;

  const chinTaper =
  dist(chinNarrowL, chinNarrowR) / jawW;

  const jawSquareness =
  dist(lowJawL, lowJawR) / jawW;

  const widthUniformity =
  Math.max(templeW, cheekW, jawW) /
  Math.min(templeW, cheekW, jawW);

  const chinAngle =
  angle(
    chinNarrowL,
    chin,
    chinNarrowR
  );

  const analysis =
  classifyDetailed(
    lw,
    jc,
    fj,
    fc,
    ja,
    twCw,
    chinTaper,
    jawSquareness,
    widthUniformity,
    chinAngle
  );

  const shape =
  analysis.shape;

  const skinResult =
  detectSkinTone();

  const skinTone = skinResult.tone;

  const season = getSeason(skinTone, skinResult.ita);

  const seasonName = season ? seasonDB[season].name : null;

  const skinToneLabel = seasonName
    ? `${skinToneDB[skinTone].name} · ${seasonName}`
    : skinToneDB[skinTone].name;

  const colorSource = season ? seasonDB[season] : skinToneDB[skinTone];

  const recommend =
  hairDetail(
    shape,
    gender,
    hairLength,
    style
  );

  lastRecommend =
  recommend;

  document
  .getElementById("faceShapeResult")
  .innerText =
  shapeKorean[shape];

  document
  .getElementById("skinToneResult")
  .innerText =
  skinToneLabel;

  document
  .getElementById("genderResult")
  .innerText =
  gender==="male" ? "남자" : "여자";

  document
  .getElementById("analysisReason")
  .innerText =
  getAnalysisReason(analysis);

  renderScores(
    analysis.scores
  );

  document
  .getElementById("faceShapeConfidence")
  .innerText =
  `확신도 ${analysis.scores[0].percent}%`;

    const icon =
  document.getElementById("faceShapeIcon");

  const visualText =
  document.getElementById("shapeVisualText");

  if(shapeImages[shape]){

    icon.src =
    shapeImages[shape];

    icon.style.display =
    "block";

  }

  visualText.innerText =
  `${shapeKorean[shape]} 얼굴형입니다. 얼굴형 결과를 한눈에 이해할 수 있도록 실루엣으로 함께 표시했습니다.`;

  drawMeasurementOverlay(
    faceLandmarks,
    { lw, jc, fj, ja }
  );

  document
  .getElementById("mainReason")
  .innerText =
  `${shapeKorean[shape]} 얼굴형과 ${skinToneLabel} 분석 결과를 바탕으로 헤어스타일과 헤어 컬러를 추천합니다.`;

  const skinText =
  document.getElementById("skinToneDescription");

  skinText.innerText = season
    ? `${skinToneDB[skinTone].name}(${seasonName})으로 분석되었습니다. 퍼스널컬러 4계절 기준 세부 톤에 맞는 헤어 컬러를 함께 추천합니다.`
    : `${skinToneDB[skinTone].name}으로 분석되었습니다. 웜/쿨 어느 쪽으로도 치우치지 않는 경계 영역이라 세부 계절 구분 없이 추천합니다.`;

  const bestColorRow =
  document.getElementById("bestColorRow");

  const worstColorRow =
  document.getElementById("worstColorRow");

  bestColorRow.innerHTML =
  "<strong>추천 컬러</strong>";

  colorSource
  .recommend
  .forEach(color=>{

    bestColorRow.innerHTML +=
    `<span class="color-tag">${color}</span>`;

  });

  worstColorRow.innerHTML =
  "<strong>비추천 컬러</strong>";

  colorSource
  .avoid
  .forEach(color=>{

    worstColorRow.innerHTML +=
    `<span class="color-tag">${color}</span>`;

  });

  const hairCards =
  document.getElementById("hairCards");

  hairCards.innerHTML = "";

  if(recommend.length === 0){

    hairCards.innerHTML =
    `<p class="empty-text">추천 가능한 헤어스타일이 없습니다.</p>`;

  }

  recommend.forEach(hair=>{

    const tagHTML =
    hair
    .tags
    .map(tag=>`<span class="tag">${tag}</span>`)
    .join("");

    const principleInfo =
    faceShapePrinciples[hair.primaryFaceShape];

    const principleHTML =
    principleInfo
      ? `<p class="principle-box">
          <strong>근거 원칙</strong><br>
          ${principleInfo.principle}
        </p>`
      : "";

    const noteHTML =
    hair.note
      ? `<p class="note-box">${hair.note}</p>`
      : "";

    hairCards.innerHTML += `
    <div class="hair-card">

      <img
        src="${hair.image}"
        onerror="this.src='images/default.jpg'"
      >

      <div class="hair-info">

        <h4>${hair.name}</h4>

        <p>
        <strong>추천 이유</strong><br>
        ${hair.reason}
        </p>

        <p>
        <strong>스타일 포인트</strong><br>
        ${hair.point}
        </p>

        ${principleHTML}

        ${noteHTML}

        <div class="tag-row">
        ${tagHTML}
        </div>

      </div>

    </div>
    `;

  });

  const worstHairCards =
  document.getElementById("worstHairCards");

  worstHairCards.innerHTML = "";

  const worstEntry =
  worstHairDB[shape];

  const worstList =
  worstEntry ? worstEntry.items : null;

  if(worstList && worstList.length > 0){

    const principleInfo =
    faceShapePrinciples[shape];

    const confidenceTag =
    worstEntry.confidence === "low"
      ? `<span class="tag confidence-low">근거 약함</span>`
      : `<span class="tag confidence-high">근거 확인됨</span>`;

    const principleHTML =
    principleInfo
      ? `<p class="principle-box">
          <strong>근거 원칙</strong><br>
          ${principleInfo.principle}
        </p>`
      : "";

    const lowConfidenceNoteHTML =
    worstEntry.confidence === "low"
      ? `<p class="note-box">참고: 이 얼굴형은 원 문헌에서 "대부분의 스타일이 무난히 어울리는 만능형"으로 분류되어, 아래 비추천 목록은 명확한 학술적 근거보다는 관례적 추정에 가깝습니다.</p>`
      : "";

    worstList.forEach(item=>{

      worstHairCards.innerHTML += `
      <div class="hair-card">

        <div class="hair-info">

          <h4>${item.name}</h4>

          <p>
          <strong>비추천 이유</strong><br>
          ${item.reason}
          </p>

          ${principleHTML}

          ${lowConfidenceNoteHTML}

          <div class="tag-row">
            <span class="tag">WORST</span>
            <span class="tag">비추천</span>
            ${confidenceTag}
          </div>

        </div>

      </div>
      `;

    });

  }
  else{

    worstHairCards.innerHTML =
    `<p class="empty-text">비추천 스타일 정보가 없습니다.</p>`;

  }

  const celebCards =
  document.getElementById("celebCards");

  celebCards.innerHTML = "";

  const celebList =
  celebrityByFaceShape[shape];

  if(celebList && celebList.length > 0){

    celebList.forEach(celeb=>{

      celebCards.innerHTML += `
      <div class="celeb-card">

        <img
          src="${celeb.image}"
          onerror="this.src='images/default.jpg'"
        >

        <h4>${celeb.name}</h4>

      </div>
      `;

    });

  }
  else{

    celebCards.innerHTML =
    `<p class="empty-text">해당 얼굴형의 연예인 예시가 없습니다.</p>`;

  }
}

/* ===== 결과 저장 / 공유 =====

   .result-card 전체를 그대로 캡처하면 추천 헤어 카드가 여러 개
   쌓여서 이미지가 세로로 매우 길어진다. 그래서 저장/공유 전용으로
   사진·얼굴형·피부톤·추천 컬러·대표 추천 헤어 1개만 담은 고정
   너비의 #shareCard 템플릿을 결과로 채운 뒤, 그 카드만 html2canvas로
   캡처한다.
   ----------------------------------------------------------- */

async function buildShareCard(){

  const card =
  document.getElementById("shareCard");

  const photo =
  document.getElementById("shareCardPhoto");

  photo.style.display = "block";
  photo.src = currentImage || "";

  // html2canvas가 캡처를 시작하기 전에 사진 로딩이 끝나있어야
  // 빈 칸으로 캡처되지 않는다 (capturePhoto의 preview.onload 대기와
  // 같은 이유).
  if(currentImage && !(photo.complete && photo.naturalWidth > 0)){
    await new Promise(resolve=>{
      photo.onload = resolve;
      photo.onerror = resolve;
    });
  }

  document
  .getElementById("shareCardShape")
  .innerText =
  document.getElementById("faceShapeResult").innerText || "-";

  document
  .getElementById("shareCardConfidence")
  .innerText =
  document.getElementById("faceShapeConfidence").innerText || "-";

  document
  .getElementById("shareCardSkin")
  .innerText =
  document.getElementById("skinToneResult").innerText || "-";

  document
  .getElementById("shareCardGender")
  .innerText =
  document.getElementById("genderResult").innerText || "-";

  const colorsBox =
  document.getElementById("shareCardColors");

  colorsBox.innerHTML = "";

  document
  .querySelectorAll("#bestColorRow .color-tag")
  .forEach(tag=>{
    colorsBox.innerHTML +=
    `<span class="color-tag">${tag.innerText}</span>`;
  });

  const hairBox =
  document.getElementById("shareCardHair");

  if(lastRecommend.length > 0){

    const top = lastRecommend[0];

    hairBox.innerHTML = `
      <img src="${top.image}" onerror="this.onerror=null;this.style.display='none';">
      <div>
        <h4>${top.name}</h4>
        <p>${top.reason}</p>
      </div>
    `;

    hairBox.style.display = "flex";

  }
  else{
    hairBox.style.display = "none";
  }

  return card;
}

async function captureResultCanvas(){

  if(!faceLandmarks){
    alert("먼저 분석을 완료해주세요!");
    return null;
  }

  const target = await buildShareCard();

  try{

    return await html2canvas(target, {
      backgroundColor:"#ffffff",
      scale:2,
      useCORS:true
    });

  }
  catch(error){

    console.error(error);
    alert("이미지를 생성하는 중 오류가 발생했습니다.");
    return null;

  }
}

function getResultFileName(){

  const shapeName =
  document.getElementById("faceShapeResult").innerText || "결과";

  return `헤어스타일추천_${shapeName}.png`;
}

async function saveResultAsImage(){

  const canvas = await captureResultCanvas();

  if(!canvas) return;

  const link =
  document.createElement("a");

  link.download = getResultFileName();
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/* -----------------------------------------------------
   [공유하기] Firestore(sharedResults 컬렉션)에 사진 썸네일 +
   선택 옵션을 업로드하고, 그 문서 ID로 "?shared=<id>" 링크를
   만들어 공유한다. 저장용 "결과 링크 저장"(localStorage, 이
   기기에서만 재현)과 달리, 이 링크는 다른 사람이 다른 기기에서
   열어도 똑같은 분석 결과를 볼 수 있다.
   Firestore 업로드가 실패하면(미설정, 오프라인 등) 예전 방식인
   이미지 파일 공유/다운로드로 자동 대체한다.
   ----------------------------------------------------- */

async function shareResult(){

  if(!currentImage || !faceLandmarks){
    alert("먼저 분석을 완료해주세요!");
    return;
  }

  const shapeName =
  document.getElementById("faceShapeResult").innerText || "";

  let shareUrl;

  try{

    const thumbImage = await buildThumbnailDataUrl(currentImage);

    // Firestore가 프로젝트에서 아직 켜져 있지 않거나 네트워크가
    // 불안정하면 요청이 응답 없이 계속 재시도만 하며 멈춰있을 수
    // 있다 — 무한정 기다리지 않도록 타임아웃을 걸고, 넘기면
    // 즉시 이미지 공유 방식으로 대체한다.
    const addPromise = db.collection("sharedResults").add({
      image: thumbImage,
      gender: gender,
      hairLength: document.getElementById("hairLengthSelect").value,
      style: document.getElementById("styleSelect").value,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    const timeoutPromise = new Promise((_, reject)=>{
      setTimeout(()=> reject(new Error("firestore-timeout")), 8000);
    });

    const docRef = await Promise.race([addPromise, timeoutPromise]);

    shareUrl =
    `${location.origin}${location.pathname}?shared=${docRef.id}#analyze`;

  }
  catch(error){

    console.error("공유 링크 업로드 실패, 이미지 공유로 대체:", error);
    await shareResultAsImageFallback(shapeName);
    return;

  }

  const shareData = {
    title:"Hair Style Finder 분석 결과",
    text:`내 얼굴형은 ${shapeName}! 어울리는 헤어스타일을 확인해보세요.`,
    url: shareUrl
  };

  if(navigator.share){

    try{
      await navigator.share(shareData);
    }
    catch(error){
      // 사용자가 공유를 취소한 경우(AbortError)는 정상 흐름이라 무시
      if(error.name !== "AbortError"){
        console.error(error);
      }
    }

    return;
  }

  if(navigator.clipboard && navigator.clipboard.writeText){

    navigator.clipboard.writeText(shareUrl)
      .then(()=> alert(`공유 링크가 복사되었습니다!\n\n${shareUrl}`))
      .catch(()=> alert(`공유 링크: ${shareUrl}`));

  }
  else{

    alert(`공유 링크: ${shareUrl}`);

  }
}

async function shareResultAsImageFallback(shapeName){

  const canvas = await captureResultCanvas();

  if(!canvas) return;

  const fileName = getResultFileName();

  canvas.toBlob(async (blob)=>{

    if(!blob){
      alert("이미지를 생성하는 중 오류가 발생했습니다.");
      return;
    }

    const file =
    new File([blob], fileName, { type:"image/png" });

    const shareData = {
      files:[file],
      title:"Hair Style Finder 분석 결과",
      text:`내 얼굴형은 ${shapeName}! 어울리는 헤어스타일을 확인해보세요.`
    };

    const canShareFile =
    navigator.canShare &&
    navigator.canShare({ files:[file] });

    if(canShareFile){

      try{
        await navigator.share(shareData);
      }
      catch(error){
        // 사용자가 공유를 취소한 경우(AbortError)는 정상 흐름이라 무시
        if(error.name !== "AbortError"){
          console.error(error);
        }
      }

      return;
    }

    // 파일 공유(Web Share API Level 2)를 지원하지 않는 환경
    // (대부분의 데스크톱 브라우저) → 이미지 다운로드로 대체
    const link =
    document.createElement("a");

    link.download = fileName;
    link.href = URL.createObjectURL(blob);
    link.click();

    alert("이 브라우저는 공유 기능을 지원하지 않아 이미지를 다운로드했습니다. 다운로드된 이미지로 직접 공유해주세요!");

  }, "image/png");
}

/* -----------------------------------------------------
   [결과 링크 저장] 다른 사람과 공유하는 용도가 아니라, "같은
   브라우저에서 나중에 다시 보기" 용도다. 서버에 저장하지 않고
   localStorage에 사진 원본 + 선택했던 옵션(성별/머리길이/스타일)만
   저장해두고, 그 링크로 들어오면 같은 사진으로 분석을 자동으로
   다시 돌려서 동일한 결과를 재현한다.
   최근 5개까지만 보관 — 사진을 base64로 들고 있어서 무한정
   쌓이면 localStorage 용량(보통 5~10MB)을 금방 채울 수 있음.
   ----------------------------------------------------- */

const SAVED_RESULT_PREFIX = "hsf_result_";
const SAVED_RESULT_INDEX_KEY = "hsf_result_ids";
const SAVED_RESULT_MAX = 5;
const SAVED_RESULT_THUMB_MAX_SIZE = 480;

/* 원본 사진을 그대로 저장하면 localStorage 용량(보통 5~10MB)을
   사진 한 장으로 다 써버릴 수 있다. 긴 변 기준
   SAVED_RESULT_THUMB_MAX_SIZE로 줄이고 JPEG로 재인코딩해서
   용량을 크게 낮춘다 — 저장용일 뿐 분석 정확도에는 영향 없음. */
function buildThumbnailDataUrl(sourceDataUrl){

  return new Promise((resolve, reject)=>{

    const img = new Image();

    img.onload = ()=>{

      const scale =
      Math.min(1, SAVED_RESULT_THUMB_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));

      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      canvas.getContext("2d").drawImage(img, 0, 0, w, h);

      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };

    img.onerror = reject;
    img.src = sourceDataUrl;
  });
}

async function saveResultLink(){

  if(!currentImage || !faceLandmarks){
    alert("먼저 분석을 완료해주세요!");
    return;
  }

  const id = String(Date.now());

  let thumbImage;

  try{
    thumbImage = await buildThumbnailDataUrl(currentImage);
  }
  catch(error){
    console.error(error);
    alert("사진을 저장용으로 압축하는 중 오류가 발생했습니다.");
    return;
  }

  const data = {
    image: thumbImage,
    gender: gender,
    hairLength: document.getElementById("hairLengthSelect").value,
    style: document.getElementById("styleSelect").value,
    savedAt: new Date().toISOString()
  };

  let ids = JSON.parse(
    localStorage.getItem(SAVED_RESULT_INDEX_KEY) || "[]"
  );

  try{

    ids.push(id);

    while(ids.length > SAVED_RESULT_MAX){
      const oldId = ids.shift();
      localStorage.removeItem(SAVED_RESULT_PREFIX + oldId);
    }

    localStorage.setItem(SAVED_RESULT_PREFIX + id, JSON.stringify(data));
    localStorage.setItem(SAVED_RESULT_INDEX_KEY, JSON.stringify(ids));

  }
  catch(error){

    console.error(error);

    // 용량 초과 등으로 실패하면, 방금 추가하려던 id가 인덱스에만
    // 남아 실제 데이터 없이 "빈 링크"가 되지 않도록 되돌린다.
    ids = ids.filter((x)=> x !== id);
    localStorage.setItem(SAVED_RESULT_INDEX_KEY, JSON.stringify(ids));

    alert("저장 공간이 부족해서 링크를 저장하지 못했습니다. 브라우저 저장공간을 정리한 뒤 다시 시도해주세요.");
    return;

  }

  const url =
  `${location.origin}${location.pathname}?saved=${id}#analyze`;

  if(navigator.clipboard && navigator.clipboard.writeText){

    navigator.clipboard.writeText(url)
      .then(()=> alert(`결과 링크가 복사되었습니다!\n이 브라우저에서 아래 주소로 들어오면 같은 결과를 다시 볼 수 있어요.\n\n${url}`))
      .catch(()=> alert(`결과 링크가 저장되었습니다. 아래 주소를 복사해두세요.\n\n${url}`));

  }
  else{

    alert(`결과 링크가 저장되었습니다. 아래 주소를 복사해두세요.\n\n${url}`);

  }
}

/* -----------------------------------------------------
   [결과 링크 복원] 주소에 ?saved=<id>(이 기기 localStorage) 또는
   ?shared=<id>(Firestore, 다른 사람이 공유한 링크)가 있으면,
   저장해둔 사진·옵션을 그대로 불러와 업로드 → 분석까지 자동으로
   재현한다. 페이지 맨 아래, 다른 함수들이 다 정의된 뒤에 실행.
   ----------------------------------------------------- */

async function restoreSavedResultFromUrl(){

  const params = new URLSearchParams(location.search);
  const savedId = params.get("saved");
  const sharedId = params.get("shared");

  if(!savedId && !sharedId) return;

  let data = null;

  if(savedId){

    const raw =
    localStorage.getItem(SAVED_RESULT_PREFIX + savedId);

    if(raw){
      try{
        data = JSON.parse(raw);
      }
      catch(error){
        console.error(error);
      }
    }

  }
  else if(sharedId){

    try{

      const doc =
      await db.collection("sharedResults").doc(sharedId).get();

      if(doc.exists){
        data = doc.data();
      }
      else{
        alert("공유된 결과를 찾을 수 없습니다. 링크가 만료되었거나 잘못됐을 수 있어요.");
      }

    }
    catch(error){
      console.error(error);
      alert("공유된 결과를 불러오지 못했습니다.");
    }

  }

  if(!data) return;

  showPage("analyzePage");
  setGender(data.gender === "male" ? "male" : "female");

  if(data.hairLength){
    document.getElementById("hairLengthSelect").value = data.hairLength;
  }

  if(data.style){
    document.getElementById("styleSelect").value = data.style;
  }

  const preview = document.getElementById("preview");
  const video = document.getElementById("camera");

  currentImage = data.image;
  preview.src = data.image;
  preview.style.display = "block";
  video.style.display = "none";

  const img = new Image();

  img.onload = async ()=>{

    try{
      await faceMesh.send({ image:img });
    }
    catch(error){
      console.error(error);
      alert("저장된 사진으로 얼굴을 다시 인식하지 못했습니다.");
      return;
    }

    if(!faceLandmarks){
      alert("저장된 사진에서 얼굴을 다시 인식하지 못했습니다.");
      return;
    }

    runRecommendation();

  };

  img.src = data.image;
}

/* ===== 초기화 ===== */

function resetPage(){

  currentImage = null;
  faceLandmarks = null;
  lastRecommend = [];

  const preview = document.getElementById("preview");
  const video = document.getElementById("camera");

  preview.src = "";
  preview.style.display = "none";
  video.style.display = "block";

  document.getElementById("faceShapeResult").innerText = "-";
  document.getElementById("skinToneResult").innerText = "-";
  document.getElementById("genderResult").innerText = "-";
  document.getElementById("faceShapeConfidence").innerText = "분석 전";

  showResultTab("hair");

  document.getElementById("shapeVisualText").innerText =
  "분석 결과에 따라 얼굴형 실루엣이 표시됩니다.";

  document.getElementById("analysisReason").innerText =
  "사진을 업로드하고 분석을 시작하면 얼굴형 분석 이유가 표시됩니다.";

  document.getElementById("mainReason").innerText =
  "사진을 업로드하고 분석을 시작하면 추천 설명이 표시됩니다.";

  document.getElementById("skinToneDescription").innerText =
  "분석 전입니다.";

  document.getElementById("bestColorRow").innerHTML = "";
  document.getElementById("worstColorRow").innerHTML = "";

  document.getElementById("scoreResult").innerHTML =
  `<p class="empty-text">분석 전입니다.</p>`;

  document.getElementById("hairCards").innerHTML =
  `<p class="empty-text">추천 결과가 없습니다.</p>`;

  document.getElementById("worstHairCards").innerHTML =
  `<p class="empty-text">분석 후 표시됩니다.</p>`;

  document.getElementById("celebCards").innerHTML =
  `<p class="empty-text">추천 결과가 나오면 얼굴형별 연예인 예시가 표시됩니다.</p>`;

  const icon = document.getElementById("faceShapeIcon");
  icon.src = "";
  icon.style.display = "none";

  const measureCanvas = document.getElementById("measureCanvas");
  if(measureCanvas){
    measureCanvas.style.display = "none";
    measureCanvas.getContext("2d").clearRect(0, 0, measureCanvas.width, measureCanvas.height);
  }

  const measureLegend = document.getElementById("measureLegend");
  if(measureLegend) measureLegend.style.display = "none";
}

/* ===== 브라우저 뒤로가기 처리 ===== */

function handlePageByHash(){

  if(location.hash === "#login"){
    showPage("mainPage");
    openAuthModal("login");
  }
  else if(location.hash === "#analyze"){
    showPage("analyzePage");
  }
  else{
    showPage("mainPage");
  }

}

window.addEventListener("hashchange", handlePageByHash);
window.addEventListener("popstate", handlePageByHash);

restoreSavedResultFromUrl();