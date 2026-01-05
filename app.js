// app.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://smzbrhwdeirfeivaxktt.supabase.co";
const supabaseKey = "sb_publishable_rPWVO3_OnyhoH-TqB8zinA_L-5vdG6T";

const supabase = createClient(supabaseUrl, supabaseKey);

// ---------- DOM 요소 ----------

// 화면 전환
const loginScreen = document.getElementById("login-screen");
const mainScreen = document.getElementById("main-screen");
const welcomeText = document.getElementById("welcome-text");
const logoutBtn = document.getElementById("logout-btn");

// 로그인/회원가입 관련
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginUsernameInput = document.getElementById("login-username");
const loginPasswordInput = document.getElementById("login-password");
const registerUsernameInput = document.getElementById("register-username");
const registerPasswordInput = document.getElementById("register-password");
const authTabButtons = document.querySelectorAll(".auth-tab-btn");

// 글 작성/목록
const newPostForm = document.getElementById("new-post-form");
const postTitleInput = document.getElementById("post-title");
const postContentInput = document.getElementById("post-content");
const postGraphInput = document.getElementById("post-graph-input");
const postGraphEnable = document.getElementById("post-graph-enable");
const postsList = document.getElementById("posts-list");

// 상세 모달
const detailModal = document.getElementById("detail-modal");
const detailCloseBtn = document.getElementById("detail-close-btn");
const detailTitle = document.getElementById("detail-title");
const detailMeta = document.getElementById("detail-meta");
const detailContent = document.getElementById("detail-content");
const detailLikeCount = document.getElementById("detail-like-count");
const detailDislikeCount = document.getElementById("detail-dislike-count");
const detailLikeForm = document.getElementById("detail-like-form");

// 글 상세 그래프 영역
const postGraphContainer = document.getElementById("post-graph-container");
const postGraphExpr = document.getElementById("post-graph-expr");
const postGraphCanvas = document.getElementById("post-graph-canvas");

// 글 작성자용 액션
const detailOwnerActions = document.getElementById("detail-owner-actions");
const detailEditBtn = document.getElementById("detail-edit-btn");
const detailDeleteBtn = document.getElementById("detail-delete-btn");

// 댓글
const commentsList = document.getElementById("comments-list");
const commentForm = document.getElementById("comment-form");
const commentInput = document.getElementById("comment-input");

let currentPostId = null;
let currentPost = null;

// ---------- 공통 헬퍼 ----------

function getUsername() {
  return localStorage.getItem("username") || "";
}
function setUsername(name) {
  localStorage.setItem("username", name);
}
function getNickname() {
  return getUsername();
}

function showLogin() {
  loginScreen.classList.remove("hidden");
  mainScreen.classList.add("hidden");
  welcomeText.textContent = "";
  logoutBtn.classList.add("hidden");
}

function showMain() {
  loginScreen.classList.add("hidden");
  mainScreen.classList.remove("hidden");
  const username = getUsername();
  welcomeText.textContent = username ? `${username} 님` : "";
  logoutBtn.classList.remove("hidden");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR");
}

// ----- 수식 평가 & 그래프 그리기 -----

function evalExprAtX(expr, x) {
  if (!expr) return NaN;

  // 1. 기본 정리: 소문자, 앞의 "y=" 제거
  let raw = expr.toString().trim().toLowerCase();
  raw = raw.replace(/y\s*=/g, ""); // "y = 2x+1" → "2x+1"

  // 2. 공백 제거
  raw = raw.replace(/\s+/g, "");

  // 3. 암시적 곱셈 처리
  //    2x   → 2*x
  //    x2   → x*2
  //    2(x) → 2*(x)
  //    (x+1)2 → (x+1)*2
  //    x(x+1) → x*(x+1)
  //    (x+1)x → (x+1)*x
  raw = raw
    .replace(/(\d)(x)/g, "$1*$2")
    .replace(/(x)(\d)/g, "$1*$2")
    .replace(/(\d)\(/g, "$1*(")
    .replace(/\)(\d)/g, ")*$1")
    .replace(/x\(/g, "x*(")
    .replace(/\)x/g, ")*x");

  // 4. 허용 문자만 체크 (숫자, x, 괄호, 사칙, ., ^)
  if (!/^[0-9x+\-*/().^]*$/.test(raw)) {
    return NaN;
  }

  // 5. ^ → ** 로 바꿔서 JS에서 계산 가능하게
  const jsExpr = raw.replace(/\^/g, "**");

  try {
    const f = new Function("x", `"use strict"; return (${jsExpr});`);
    const y = f(x);
    if (!isFinite(y)) return NaN;
    return y;
  } catch (e) {
    console.warn("식 계산 오류:", expr, e);
    return NaN;
  }
}

function drawGraphOnCanvas(canvas, expr) {
  if (!canvas || !expr) return;

  const ctx = canvas.getContext("2d");
  const width = (canvas.width = 260);
  const height = (canvas.height = 160);

  // 화면에 보여줄 x, y 범위
  const xMin = -10;
  const xMax = 10;
  const yMin = -10;
  const yMax = 10;

  // 배경
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, width, height);

  // --------- 축 그리기 ----------
  ctx.strokeStyle = "#4b5563";
  ctx.lineWidth = 1;
  ctx.beginPath();

  // x축 (y = 0)
  const y0 = (yMax / (yMax - yMin)) * height;
  ctx.moveTo(0, y0);
  ctx.lineTo(width, y0);

  // y축 (x = 0)
  const x0 = ((0 - xMin) / (xMax - xMin)) * width;
  ctx.moveTo(x0, 0);
  ctx.lineTo(x0, height);

  ctx.stroke();

  // --------- 그래프 그리기 ----------
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  let started = false;
  let prevPy = null;

  // 캔버스 높이 기준으로 "너무 큰 점프"이면 끊어버릴 기준
  const MAX_JUMP = height; // 한 프레임에서 화면 전체 높이 이상 점프하면 끊기

  for (let px = 0; px <= width; px++) {
    const x = xMin + (px / width) * (xMax - xMin);
    const y = evalExprAtX(expr, x);

    // NaN / 무한대 / 너무 큰 값이면 이 구간은 건너뜀 (끊기)
    if (!isFinite(y) || Math.abs(y) > 1e6) {
      started = false;
      prevPy = null;
      continue;
    }

    // y를 화면 좌표로 변환 (yMin~yMax 밖이어도 일단 좌표는 계산)
    const py = height - ((y - yMin) / (yMax - yMin)) * height;

    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else {
      // 이전 점이 있고, y가 너무 많이 튀면 → 그래프 끊고 새로 시작
      if (prevPy !== null && Math.abs(py - prevPy) > MAX_JUMP) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }

    prevPy = py;
  }

  ctx.stroke();
}




// ---------- 그래프 ON/OFF 토글 ----------

if (postGraphEnable && postGraphInput) {
  postGraphEnable.addEventListener("change", () => {
    if (postGraphEnable.checked) {
      postGraphInput.classList.remove("hidden");
      postGraphInput.focus();
    } else {
      postGraphInput.classList.add("hidden");
      postGraphInput.value = "";
    }
  });
}

// ---------- 탭 전환 (로그인 / 회원가입) ----------

authTabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    authTabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const target = btn.dataset.target;
    if (target === "login") {
      loginForm.classList.remove("hidden");
      registerForm.classList.add("hidden");
    } else {
      loginForm.classList.add("hidden");
      registerForm.classList.remove("hidden");
    }
  });
});

// ---------- 회원가입 ----------

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = registerUsernameInput.value.trim();
  const password = registerPasswordInput.value.trim();
  if (!username || !password) return;

  const { error } = await supabase.from("users").insert({
    username,
    password, // 평문 (실서비스면 X)
  });

  if (error) {
    if (error.code === "23505") {
      alert("이미 존재하는 아이디입니다.");
    } else {
      console.error(error);
      alert("회원가입 중 오류가 발생했습니다.");
    }
    return;
  }

  alert("회원가입 완료! 로그인해 주세요.");
  registerUsernameInput.value = "";
  registerPasswordInput.value = "";

  authTabButtons.forEach((b) =>
    b.classList.toggle("active", b.dataset.target === "login")
  );
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
});

// ---------- 로그인 ----------

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value.trim();
  if (!username || !password) return;

  const { data: user, error } = await supabase
    .from("users")
    .select("id, username, password")
    .eq("username", username)
    .single();

  if (error || !user || user.password !== password) {
    console.error(error);
    alert("아이디 또는 비밀번호가 틀렸습니다.");
    return;
  }

  await supabase
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", user.id);

  setUsername(username);
  loginUsernameInput.value = "";
  loginPasswordInput.value = "";

  showMain();
  loadPosts();
});

// ---------- 로그아웃 ----------

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("username");
  showLogin();
});

// ---------- 글 목록 로딩 (내 좋아요 상태 포함) ----------

async function loadPosts() {
  postsList.innerHTML = "<p>로딩 중...</p>";

  const { data: posts, error } = await supabase
    .from("posts")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    postsList.innerHTML = "<p>글을 불러오는 중 오류가 발생했습니다.</p>";
    return;
  }

  if (!posts || posts.length === 0) {
    postsList.innerHTML = "<p>아직 작성된 글이 없습니다.</p>";
    return;
  }

  const username = getUsername();
  let userLikesMap = {};

  if (username) {
    const { data: myLikes, error: likesError } = await supabase
      .from("likes")
      .select("post_id, value")
      .eq("username", username);

    if (likesError) {
      console.error(likesError);
    } else {
      (myLikes || []).forEach((row) => {
        userLikesMap[row.post_id] = row.value;
      });
    }
  }

  postsList.innerHTML = "";
  posts.forEach((post) => {
    const card = document.createElement("div");
    card.className = "post-card";

    card.innerHTML = `
      <div class="post-header">
        <div class="post-title">${escapeHtml(post.title)}</div>
        <div class="post-meta">
          ${escapeHtml(post.author)} · ${formatDate(post.created_at)}
        </div>
      </div>
      <div class="post-content-preview">
        ${escapeHtml(
          post.content.length > 120
            ? post.content.slice(0, 120) + "..."
            : post.content
        )}
      </div>
      <div class="post-footer">
        <div>👍 ${post.like_count ?? 0} / 👎 ${post.dislike_count ?? 0}</div>
        <div class="post-actions">
          <button class="btn small-btn" data-action="detail" data-id="${post.id}">상세</button>
          <button class="btn small-btn" data-action="like" data-id="${post.id}">👍</button>
          <button class="btn small-btn" data-action="dislike" data-id="${post.id}">👎</button>
        </div>
      </div>
    `;

    const userValue = userLikesMap[post.id];
    const likeBtn = card.querySelector('button[data-action="like"]');
    const dislikeBtn = card.querySelector('button[data-action="dislike"]');

    if (userValue === 1 && likeBtn) likeBtn.classList.add("selected");
    if (userValue === -1 && dislikeBtn) dislikeBtn.classList.add("selected");

    postsList.appendChild(card);
  });
}

// ---------- 새 글 작성 ----------

newPostForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = getUsername();
  if (!username) {
    alert("로그인이 필요합니다.");
    showLogin();
    return;
  }

  const title = postTitleInput.value.trim();
  const content = postContentInput.value.trim();
  if (!title || !content) return;

  let graphExpr = null;
  if (postGraphEnable && postGraphEnable.checked && postGraphInput) {
    const raw = postGraphInput.value.trim();
    if (raw) graphExpr = raw;
  }

  const { error } = await supabase.from("posts").insert({
    title,
    content,
    author: username,
    graph_expr: graphExpr,
  });

  if (error) {
    console.error(error);
    alert("글 작성 중 오류가 발생했습니다.");
    return;
  }

  postTitleInput.value = "";
  postContentInput.value = "";
  if (postGraphInput) postGraphInput.value = "";
  if (postGraphEnable) postGraphEnable.checked = false;
  if (postGraphInput) postGraphInput.classList.add("hidden");

  loadPosts();
});

// ---------- 글 카드 클릭 (상세/좋아요/싫어요) ----------

postsList.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const postId = parseInt(btn.dataset.id, 10);
  if (!postId) return;

  if (action === "detail") {
    await openDetail(postId);
  } else if (action === "like") {
    await updateLike(postId, "like");
    await loadPosts();
  } else if (action === "dislike") {
    await updateLike(postId, "dislike");
    await loadPosts();
  }
});

// ---------- 좋아요/싫어요 (1인 1표 + 토글) ----------

async function updateLike(postId, type) {
  const username = getUsername();
  if (!username) {
    alert("로그인이 필요합니다.");
    return;
  }

  const value = type === "like" ? 1 : -1;

  const { data: existingRows, error: existingError } = await supabase
    .from("likes")
    .select("*")
    .eq("post_id", postId)
    .eq("username", username);

  if (existingError) {
    console.error(existingError);
    alert("좋아요 정보를 불러오는 중 오류가 발생했습니다.");
    return;
  }

  const existing = existingRows && existingRows[0];

  if (!existing) {
    const { error: insertError } = await supabase.from("likes").insert({
      post_id: postId,
      username,
      value,
    });
    if (insertError) {
      console.error(insertError);
      alert("좋아요 저장 중 오류가 발생했습니다.");
      return;
    }
  } else if (existing.value === value) {
    const { error: deleteError } = await supabase
      .from("likes")
      .delete()
      .eq("id", existing.id);
    if (deleteError) {
      console.error(deleteError);
      alert("좋아요 취소 중 오류가 발생했습니다.");
      return;
    }
  } else {
    const { error: updateError } = await supabase
      .from("likes")
      .update({ value })
      .eq("id", existing.id);
    if (updateError) {
      console.error(updateError);
      alert("좋아요 상태 변경 중 오류가 발생했습니다.");
      return;
    }
  }

  const { data: likeRows, error: countError } = await supabase
    .from("likes")
    .select("value")
    .eq("post_id", postId);

  if (countError) {
    console.error(countError);
    return;
  }

  let likeCount = 0;
  let dislikeCount = 0;
  (likeRows || []).forEach((row) => {
    if (row.value === 1) likeCount += 1;
    if (row.value === -1) dislikeCount += 1;
  });

  const { error: updError } = await supabase
    .from("posts")
    .update({
      like_count: likeCount,
      dislike_count: dislikeCount,
    })
    .eq("id", postId);

  if (updError) console.error(updError);
}

// ---------- 상세 모달 열기 ----------

async function openDetail(postId) {
  currentPostId = postId;

  const { data: post, error } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .single();

  if (error || !post) {
    console.error(error);
    alert("글을 불러올 수 없습니다.");
    return;
  }

  currentPost = post;

  detailTitle.textContent = post.title;
  detailMeta.textContent = `${post.author} · ${formatDate(post.created_at)}`;
  detailContent.textContent = post.content;
  detailLikeCount.textContent = post.like_count ?? 0;
  detailDislikeCount.textContent = post.dislike_count ?? 0;

  // 그래프 표시
  if (post.graph_expr) {
    postGraphContainer.classList.remove("hidden");
    postGraphExpr.textContent = post.graph_expr;
    drawGraphOnCanvas(postGraphCanvas, post.graph_expr);
  } else {
    postGraphContainer.classList.add("hidden");
  }

  const username = getUsername();
  let myValue = null;
  if (username) {
    const { data: myLikeRows, error: myLikeError } = await supabase
      .from("likes")
      .select("value")
      .eq("post_id", postId)
      .eq("username", username);

    if (!myLikeError && myLikeRows && myLikeRows[0]) {
      myValue = myLikeRows[0].value;
    }
  }

  const likeBtn = detailLikeForm.querySelector('button[data-type="like"]');
  const dislikeBtn = detailLikeForm.querySelector(
    'button[data-type="dislike"]'
  );
  likeBtn.classList.remove("selected");
  dislikeBtn.classList.remove("selected");
  if (myValue === 1) likeBtn.classList.add("selected");
  if (myValue === -1) dislikeBtn.classList.add("selected");

  if (username && username === post.author) {
    detailOwnerActions.classList.remove("hidden");
  } else {
    detailOwnerActions.classList.add("hidden");
  }

  await loadComments(postId);

  detailModal.classList.remove("hidden");
}

// ---------- 상세 모달 닫기 ----------

detailCloseBtn.addEventListener("click", () => {
  detailModal.classList.add("hidden");
  currentPostId = null;
  currentPost = null;
});

detailModal.addEventListener("click", (e) => {
  if (e.target === detailModal) {
    detailModal.classList.add("hidden");
    currentPostId = null;
    currentPost = null;
  }
});

// ---------- 상세에서 좋아요/싫어요 ----------

detailLikeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentPostId) return;

  const type = e.submitter?.dataset.type;
  if (!type) return;

  await updateLike(currentPostId, type);
  await openDetail(currentPostId);
});

// ---------- 글 수정 / 삭제 ----------

detailEditBtn.addEventListener("click", async () => {
  if (!currentPostId || !currentPost) return;
  const username = getUsername();
  if (!username || username !== currentPost.author) {
    alert("본인이 작성한 글만 수정할 수 있습니다.");
    return;
  }

  const newTitle = prompt("새 제목을 입력하세요.", currentPost.title);
  if (newTitle === null) return;

  const newContent = prompt("새 내용을 입력하세요.", currentPost.content);
  if (newContent === null) return;

  const newGraph = prompt(
    "새 그래프 식을 입력하세요. (없으면 비워두기, 예: y = x^2 + 1)",
    currentPost.graph_expr || ""
  );
  if (newGraph === null) return;

  const title = newTitle.trim();
  const content = newContent.trim();
  const graphExpr = newGraph.trim();

  if (!title || !content) {
    alert("제목과 내용을 모두 입력하세요.");
    return;
  }

  const { error } = await supabase
    .from("posts")
    .update({
      title,
      content,
      graph_expr: graphExpr || null,
    })
    .eq("id", currentPostId);

  if (error) {
    console.error(error);
    alert("글 수정 중 오류가 발생했습니다.");
    return;
  }

  await openDetail(currentPostId);
  await loadPosts();
});

detailDeleteBtn.addEventListener("click", async () => {
  if (!currentPostId || !currentPost) return;
  const username = getUsername();
  if (!username || username !== currentPost.author) {
    alert("본인이 작성한 글만 삭제할 수 있습니다.");
    return;
  }

  if (!confirm("이 글을 삭제할까요? (댓글과 좋아요도 함께 삭제됩니다)")) return;

  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", currentPostId);

  if (error) {
    console.error(error);
    alert("글 삭제 중 오류가 발생했습니다.");
    return;
  }

  detailModal.classList.add("hidden");
  currentPostId = null;
  currentPost = null;
  await loadPosts();
});

// ---------- 댓글 ----------

async function loadComments(postId) {
  commentsList.innerHTML = "<p>댓글 로딩 중...</p>";

  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("id", { ascending: true });

  if (error) {
    console.error(error);
    commentsList.innerHTML = "<p>댓글을 불러오는 중 오류가 발생했습니다.</p>";
    return;
  }

  const username = getUsername();

  if (!data || data.length === 0) {
    commentsList.innerHTML = "<p>아직 댓글이 없습니다.</p>";
    return;
  }

  commentsList.innerHTML = "";
  data.forEach((c) => {
    const item = document.createElement("div");
    item.className = "comment-item";

    let actionsHtml = "";
    if (username && username === c.author) {
      actionsHtml = `
        <div class="comment-actions">
          <button class="btn small-btn" data-action="edit-comment" data-id="${c.id}">수정</button>
          <button class="btn small-btn danger-btn" data-action="delete-comment" data-id="${c.id}">삭제</button>
        </div>
      `;
    }

    item.innerHTML = `
      <div class="comment-header">
        <span>${escapeHtml(c.author)}</span>
        <span class="meta">${formatDate(c.created_at)}</span>
      </div>
      <div class="comment-body">
        <p>${escapeHtml(c.content)}</p>
        ${actionsHtml}
      </div>
    `;
    commentsList.appendChild(item);
  });
}

commentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = getUsername();
  if (!username) {
    alert("로그인이 필요합니다.");
    return;
  }
  if (!currentPostId) return;

  const content = commentInput.value.trim();
  if (!content) return;

  const { error } = await supabase.from("comments").insert({
    post_id: currentPostId,
    author: username,
    content,
  });

  if (error) {
    console.error(error);
    alert("댓글 작성 중 오류가 발생했습니다.");
    return;
  }

  commentInput.value = "";
  await loadComments(currentPostId);
});

// 댓글 수정/삭제
commentsList.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const commentId = parseInt(btn.dataset.id, 10);
  if (!commentId) return;

  const username = getUsername();
  if (!username) {
    alert("로그인이 필요합니다.");
    return;
  }

  const { data: comment, error } = await supabase
    .from("comments")
    .select("author, content")
    .eq("id", commentId)
    .single();

  if (error || !comment) {
    console.error(error);
    alert("댓글을 찾을 수 없습니다.");
    return;
  }

  if (comment.author !== username) {
    alert("본인이 작성한 댓글만 수정/삭제할 수 있습니다.");
    return;
  }

  if (action === "delete-comment") {
    if (!confirm("댓글을 삭제할까요?")) return;
    const { error: delError } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);
    if (delError) {
      console.error(delError);
      alert("댓글 삭제 중 오류가 발생했습니다.");
      return;
    }
    await loadComments(currentPostId);
  } else if (action === "edit-comment") {
    const newContent = prompt("새 댓글 내용을 입력하세요.", comment.content);
    if (newContent === null) return;
    const trimmed = newContent.trim();
    if (!trimmed) {
      alert("내용을 입력하세요.");
      return;
    }
    const { error: updError } = await supabase
      .from("comments")
      .update({ content: trimmed })
      .eq("id", commentId);
    if (updError) {
      console.error(updError);
      alert("댓글 수정 중 오류가 발생했습니다.");
      return;
    }
    await loadComments(currentPostId);
  }
});

// ---------- 초기 로드 ----------

window.addEventListener("DOMContentLoaded", () => {
  const username = getUsername();
  if (username) {
    showMain();
    loadPosts();
  } else {
    showLogin();
  }
});
