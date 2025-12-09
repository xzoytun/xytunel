// =====================================
// CONFIG
// =====================================
// DI FRONTEND (GitHub Pages / tesom.rmpremium.cloud)
const API_BASE = "/api/web";
const fmtRupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");

// key utk simpan order terakhir di localStorage
const ORDER_KEY = "xt_last_order";

// timer polling status
let POLL_TIMER = null;

// simpan teks mentah hasil trial & topup (buat salin semua)
let LAST_TRIAL_RAW = "";
let LAST_TRIAL_PARSED = {};
let LAST_TOPUP_MESSAGE_RAW = "";

function lockButton(btn, locked) {
  if (!btn) return;
  btn.disabled = locked;
  btn.classList.toggle("loading", !!locked);
}

// =====================================
// NAVIGATION (Overview / Servers / Create / Trial / Topup)
// =====================================
function openAppPage(name) {
  // simpan tab terakhir
  localStorage.setItem("xt_panel_tab", name);

  document.querySelectorAll(".app-page").forEach((p) =>
    p.classList.remove("active")
  );
  const page = document.getElementById("app-" + name);
  if (page) page.classList.add("active");

  document.querySelectorAll(".nav-btn").forEach((btn) =>
    btn.classList.remove("active")
  );
  const activeBtn = document.querySelector(
    '.nav-btn[data-target="' + name + '"]'
  );
  if (activeBtn) activeBtn.classList.add("active");

  const nav = document.querySelector(".app-nav");
  if (nav) nav.classList.remove("open");
}

// =====================================
// ORDER STORAGE + POLLING
// =====================================
function saveLastOrder(orderId, amount) {
  try {
    localStorage.setItem(
      ORDER_KEY,
      JSON.stringify({ orderId, amount, ts: Date.now() })
    );
  } catch (e) {}
}

function loadLastOrder() {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearLastOrder() {
  try {
    localStorage.removeItem(ORDER_KEY);
  } catch (e) {}
}

function copyText(txt) {
  if (!txt) return;
  navigator.clipboard
    .writeText(txt)
    .then(() => alert("✅ Berhasil disalin"))
    .catch(() => alert("Clipboard tidak support di browser ini."));
}

function copyTrialAll() {
  if (!LAST_TRIAL_RAW) return;
  copyText(LAST_TRIAL_RAW);
}

function copyTopupAll() {
  if (!LAST_TOPUP_MESSAGE_RAW) return;
  copyText(LAST_TOPUP_MESSAGE_RAW);
}

async function pollOrderStatusOnce(orderId) {
  if (!orderId) return;
  try {
    const res = await fetch(
      `${API_BASE}/order-status?orderId=${encodeURIComponent(orderId)}`
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) return;

    const data = json.data || {};
    if (data.status === "paid") {
      // stop timer
      if (POLL_TIMER) {
        clearInterval(POLL_TIMER);
        POLL_TIMER = null;
      }
      clearLastOrder();

      // tampilkan akun_message
      if (data.akun_message && typeof data.akun_message === "string") {
        const card = document.getElementById("topupAccountCard");
        const content = document.getElementById("topupAccountContent");
        if (card && content) {
          content.innerHTML = data.akun_message;

          LAST_TOPUP_MESSAGE_RAW = data.akun_message
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n\n")
            .replace(/<[^>]+>/g, "")
            .trim();

          card.style.display = "block";
          card.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          alert(
            "Akun berhasil dibuat:\n\n" +
              data.akun_message.replace(/<[^>]+>/g, "")
          );
        }
      }
    }
  } catch (e) {
    console.warn("Gagal cek status order:", e);
  }
}

function startOrderPolling(orderId) {
  if (!orderId) return;
  if (POLL_TIMER) clearInterval(POLL_TIMER);
  // cek status tiap 5 detik
  POLL_TIMER = setInterval(() => pollOrderStatusOnce(orderId), 5000);
}

// =====================================
// SERVER LIST
// =====================================
let cachedServers = [];

async function loadServersFromApi() {
  try {
    const res = await fetch(API_BASE + "/servers");
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Gagal load server.");
    }

    cachedServers = json.data || [];
    renderServers();
    fillServerSelects();
  } catch (e) {
    console.warn("Gagal load servers:", e);
    const wrap = document.getElementById("serverList");
    if (wrap) {
      wrap.innerHTML =
        "<p class='muted small'>Gagal memuat server.</p>";
    }
  }
}

function renderServers() {
  const wrap = document.getElementById("serverList");
  if (!wrap) return;

  if (!cachedServers.length) {
    wrap.innerHTML =
      "<p class='muted small'>Server kosong / belum disetting di backend.</p>";
    return;
  }

  wrap.innerHTML = cachedServers
    .map((s) => {
      const isFull = s.penuh;
      const statusText = isFull ? "PENUH" : "TERSEDIA";

      return `
        <div class="server-item">
          <div class="server-info">
            <h4>${s.nama_server}</h4>
            <p class="small muted">${s.lokasi} • ${s.isp}</p>
            <p class="small muted">
              Kuota ${s.quota}GB / hari • IP Max ${s.iplimit}
            </p>
          </div>
          <span class="server-status ${isFull ? "offline" : "online"}">
            ${statusText}
          </span>
        </div>
      `;
    })
    .join("");
}

function fillServerSelects() {
  const selCreate = document.getElementById("createServer");
  const selTrial  = document.getElementById("trialServer");

  if (!cachedServers.length) {
    if (selCreate) selCreate.innerHTML = "<option value=''>Server kosong</option>";
    if (selTrial)  selTrial.innerHTML  = "<option value=''>Server kosong</option>";
    return;
  }

  const html = cachedServers
    .map((s) => `<option value="${s.id}">${s.nama_server}</option>`)
    .join("");

  if (selCreate) selCreate.innerHTML = html;
  if (selTrial)  selTrial.innerHTML  = html;
}

// =====================================
// PASSWORD FIELD VISIBILITY (CREATE + TRIAL)
// =====================================
const typeSelect        = document.getElementById("createType");
const passwordFieldWrap = document.getElementById("createPassWrap");
const trialTypeSelect   = document.getElementById("trialType");
const trialPassWrap     = document.getElementById("trialPassWrap");

function updatePasswordVisibility() {
  if (!typeSelect || !passwordFieldWrap) return;
  const t = typeSelect.value.toLowerCase();
  passwordFieldWrap.style.display = t === "ssh" ? "block" : "none";
}

function updateTrialPasswordVisibility() {
  if (!trialTypeSelect || !trialPassWrap) return;
  const t = trialTypeSelect.value.toLowerCase();
  trialPassWrap.style.display = t === "ssh" ? "block" : "none";
}

// =====================================
// TRIAL RESULT + COPY HELPER
// =====================================
function showTrialResult(messageHtml) {
  const card   = document.getElementById("trialResultCard");
  const content = document.getElementById("trialResultContent");
  const btnBox  = document.getElementById("trialCopyButtons");
  if (!card || !content || !btnBox) {
    // fallback kalau HTML card belum dipasang
    alert("Trial berhasil dibuat:\n\n" + messageHtml.replace(/<[^>]+>/g, ""));
    return;
  }

  // simpan versi text polos
  LAST_TRIAL_RAW = messageHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .trim();

  // tampilkan html apa adanya
  content.innerHTML = messageHtml;

  const find = (label) => {
    const r = new RegExp(
      `<b>${label}<\\/b>\\s*:?\\s*<code>(.*?)<\\/code>`,
      "i"
    );
    const m = messageHtml.match(r);
    return m ? m[1] : "";
  };

  LAST_TRIAL_PARSED = {
    username: find("Username"),
    password: find("Password"),
    uuid: find("UUID"),
    domain: find("Domain"),
  };

  btnBox.innerHTML = "";

  if (LAST_TRIAL_PARSED.username) {
    btnBox.innerHTML += `
      <button type="button" class="btn-outline"
        onclick="copyText('${LAST_TRIAL_PARSED.username}')">
        Copy Username
      </button>`;
  }

  if (LAST_TRIAL_PARSED.password) {
    btnBox.innerHTML += `
      <button type="button" class="btn-outline"
        onclick="copyText('${LAST_TRIAL_PARSED.password}')">
        Copy Password
      </button>`;
  }

  if (LAST_TRIAL_PARSED.uuid) {
    btnBox.innerHTML += `
      <button type="button" class="btn-outline"
        onclick="copyText('${LAST_TRIAL_PARSED.uuid}')">
        Copy UUID
      </button>`;
  }

  card.style.display = "block";
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

// =====================================
// ON LOAD
// =====================================
window.addEventListener("load", () => {
  const email = localStorage.getItem("xt_email");
  const pass  = localStorage.getItem("xt_pass");

  // Kalau belum login, lempar ke landing
  if (!email || !pass) {
    window.location.href = "index.html";
    return;
  }

  const headerEmailEl = document.getElementById("userEmailHeader");
  if (headerEmailEl) headerEmailEl.innerText = email;

  // Logout
  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) {
    btnLogout.onclick = () => {
      localStorage.removeItem("xt_email");
      localStorage.removeItem("xt_pass");
      localStorage.removeItem("xt_panel_tab");
      clearLastOrder();
      window.location.href = "index.html";
    };
  }

  // Nav button click
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.onclick = () => openAppPage(btn.dataset.target);
  });

  // Hamburger
  const btnToggleNav = document.getElementById("btnToggleNav");
  if (btnToggleNav) {
    btnToggleNav.onclick = () => {
      const nav = document.querySelector(".app-nav");
      if (nav) nav.classList.toggle("open");
    };
  }

  // Load server list
  loadServersFromApi();

  // Password visibility
  updatePasswordVisibility();
  if (typeSelect) {
    typeSelect.addEventListener("change", updatePasswordVisibility);
  }
  updateTrialPasswordVisibility();
  if (trialTypeSelect) {
    trialTypeSelect.addEventListener("change", updateTrialPasswordVisibility);
  }

  // ===== Service card → buka tab create / trial =====
  document.querySelectorAll(".service-cta").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.createType || "ssh";
      openAppPage("create");
      const sel = document.getElementById("createType");
      if (sel) {
        sel.value = t;
        updatePasswordVisibility();
      }
    });
  });

  document.querySelectorAll(".service-cta-trial").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.trialType || "ssh";
      openAppPage("trial");
      const sel =
        document.getElementById("trialType") ||
        document.getElementById("createType");
      if (sel) {
        sel.value = t;
        updateTrialPasswordVisibility();
      }
      const trialBtn = document.getElementById("btnTrial");
      if (trialBtn) {
        trialBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  });

  // =====================================
  // FORM: BUAT AKUN → BIKIN ORDER PAKASIR
  // =====================================
  const btnCreate = document.getElementById("btnCreate");
  if (btnCreate) {
    btnCreate.onclick = async (ev) => {
      const btn = ev.currentTarget;
      const type = document.getElementById("createType").value;
      const serverId = parseInt(
        document.getElementById("createServer").value,
        10
      );
      const username = document
        .getElementById("createUser")
        .value.trim();
      const password = document.getElementById("createPass")
        ? document.getElementById("createPass").value.trim()
        : "";
      const days = parseInt(
        document.getElementById("createDays").value,
        10
      );
      const userEmail = localStorage.getItem("xt_email") || "";

      if (!userEmail) {
        alert("Kamu harus login terlebih dahulu.");
        window.location.href = "index.html";
        return;
      }
      if (!serverId || !username || !days) {
        alert("Lengkapi semua form (server, username, hari).");
        return;
      }
      if (type === "ssh" && !password) {
        alert("Password SSH wajib diisi untuk akun SSH.");
        return;
      }
      if (days !== 15 && days !== 30) {
        alert("Untuk panel web hanya tersedia paket 15 atau 30 hari.");
        return;
      }

      lockButton(btn, true);

      try {
        const res = await fetch(API_BASE + "/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: userEmail,
            type,
            serverId,
            username,
            days,
            password,
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Gagal membuat order.");
        }

        const data = json.data || {};
        const card = document.getElementById("topupPaymentCard");
        const img = document.getElementById("qrisImage");
        const infoEl = document.getElementById("paymentInfo");
        const linkEl = document.getElementById("paymentLink");

        if (card && infoEl) {
          infoEl.textContent = `Order ID: ${
            data.orderId || "-"
          } • Nominal: ${fmtRupiah(data.amount || 0)}`;

          if (img) {
            let qrUrl =
              data.qrImageBase64 ||
              data.qrImageUrl ||
              data.qrisImageUrl ||
              data.qr_url ||
              data.qris_image ||
              data.qrisImage ||
              data.qrImage ||
              "";

            // kalau base64 tanpa prefix
            if (
              qrUrl &&
              !qrUrl.startsWith("http") &&
              !qrUrl.startsWith("data:")
            ) {
              qrUrl = "data:image/png;base64," + qrUrl;
            }

            if (qrUrl) {
              img.src = qrUrl;
              img.style.display = "block";
            } else {
              img.style.display = "none";
            }
          }

          if (linkEl) {
            if (data.paymentUrl) {
              linkEl.href = data.paymentUrl;
              linkEl.style.display = "inline-block";
            } else {
              linkEl.style.display = "none";
            }
          }

          card.style.display = "block";
        }

        // simpan order & mulai polling status
        saveLastOrder(data.orderId, data.amount);
        startOrderPolling(data.orderId);

        // pindah ke tab pembayaran
        openAppPage("topup");

        alert(
          "Order berhasil dibuat.\nSilakan lakukan pembayaran menggunakan QR / link yang tampil. Akun akan dibuat otomatis setelah pembayaran berhasil."
        );
      } catch (e) {
        alert(e.message || "Gagal membuat order pembayaran.");
      } finally {
        lockButton(btn, false);
      }
    };
  }

  // =====================================
  // TRIAL AKUN (WEB PANEL) – HIT /api/web/trial
  // =====================================
  const btnTrial = document.getElementById("btnTrial");
  if (btnTrial) {
    btnTrial.onclick = async (ev) => {
      const btn = ev.currentTarget;

      const userEmail = localStorage.getItem("xt_email") || "";
      if (!userEmail) {
        alert("Kamu harus login terlebih dahulu.");
        window.location.href = "index.html";
        return;
      }

      const typeEl =
        document.getElementById("trialType") ||
        document.getElementById("createType");
      const serverEl =
        document.getElementById("trialServer") ||
        document.getElementById("createServer");
      const usernameEl =
        document.getElementById("trialUsername") ||
        document.getElementById("createUser");
      const passwordEl =
        document.getElementById("trialPassword") ||
        document.getElementById("createPass");

      const type = typeEl ? typeEl.value : "";
      const serverId = serverEl ? parseInt(serverEl.value, 10) : 0;
      const username = usernameEl ? usernameEl.value.trim() : "";
      const password = passwordEl ? passwordEl.value.trim() : "";

      if (!type || !serverId) {
        alert("Data trial tidak lengkap (tipe / server).");
        return;
      }

      lockButton(btn, true);
      try {
        const res = await fetch(API_BASE + "/trial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: userEmail,
            type,
            serverId,
            username,
            password,
          }),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json.ok) {
          if (res.status === 429 && json.error) {
            // limit 2 hari sekali dari backend
            throw new Error(json.error);
          }
          throw new Error(json.error || "Gagal membuat akun trial.");
        }

        const data = json.data || {};
        if (data.message && typeof data.message === "string") {
          // tampil di card + tombol copy
          showTrialResult(data.message);
        } else {
          alert(
            "Trial berhasil dibuat.\n\n" +
              JSON.stringify(data, null, 2)
          );
        }
      } catch (e) {
        alert(e.message || "Gagal membuat akun trial.");
      } finally {
        lockButton(btn, false);
      }
    };
  }

  // === Restore tab terakhir setelah refresh ===
  const lastTab = localStorage.getItem("xt_panel_tab") || "overview";
  openAppPage(lastTab);

  // === Restore order terakhir kalau ada ===
  const lastOrder = loadLastOrder();
  if (lastOrder && lastOrder.orderId) {
    const card = document.getElementById("topupPaymentCard");
    const infoEl = document.getElementById("paymentInfo");
    if (card && infoEl) {
      infoEl.textContent = `Order ID: ${
        lastOrder.orderId
      } • Nominal: ${fmtRupiah(lastOrder.amount || 0)}`;
      card.style.display = "block";
    }
    // auto pindah ke tab topup dan mulai polling
    openAppPage("topup");
    startOrderPolling(lastOrder.orderId);
  }

});

