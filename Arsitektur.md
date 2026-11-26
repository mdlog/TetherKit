# System & Technical Architecture: TetherKit

| Atribut Arsitektur | Detail |
| --- | --- |
| Proyek | **TetherKit** (Skeleton Crew Reference Architecture) |
| Pola Repositori | Monorepo pnpm Workspaces (Root `/.kiro/` + 1 Core SDK + 1 Signaling Relay + 2 App Folders Terpisah) |
| Stack Utama | TypeScript 5, React 19, Vite, Three.js (`@react-three/fiber` atau Vanilla Three.js), WebRTC `RTCDataChannel`, Node.js `ws`, `fast-check` |
| Target Kepatuhan | Kiroween 2026 (`/.kiro` di root + 2 folder terpisah untuk 2 aplikasi + Open Source MIT) |

---

## 1. Prinsip Arsitektur

1. **Lean Core, Zero Lock-In (`tetherkit-core`):** Seluruh logika konektivitas, protokol pesan, kalibrasi sensor, dan umpan balik diisolasi ke dalam pustaka TypeScript murni yang bebas dari ketergantungan *game engine* tertentu. Aplikasi konsumen cukup menggunakan *hook* atau instans `TetherHost` / `TetherController`.
2. **Dual-Transport Resilience:** Jalur utama menggunakan **WebRTC DataChannel** langsung antarperangkat agar latensi serendah mungkin, namun setiap pesan juga kompatibel 100% dengan **WebSocket Relay** dan **BroadcastChannel** (untuk mode *Emulator Split-View* di satu layar).
3. **Graceful Hardware Degradation:** Arsitektur tidak pernah berasumsi ponsel pasti memiliki giroskop aktif atau dukungan getar (`navigator.vibrate`). Setiap lapisan perangkat keras dibungkus *adapter* dengan jalur cadangan (*Touch Trackpad*, *Web Audio*, *Visual Pulse*).
4. **Spec-Driven & Property-Verified:** Kontrak tipe pesan dan transformasi sudut matematika ditentukan di `.kiro/specs/` dan diuji dengan **Property-Based Testing (`fast-check`)** agar tahan terhadap paket rusak, berurutan acak, atau perubahan mendadak di batas sudut +/-180 derajat.

---

## 2. Struktur Repositori (Kepatuhan Penuh *Skeleton Crew*)

Penempatan folder dibuat eksplisit di tingkat *root* agar juri dapat langsung melihat `/.kiro`, kerangka inti, dan **dua folder aplikasi terpisah** pada halaman utama GitHub:

tetherkit/
├── .kiro/                                 # WAJIB di root & TIDAK boleh di .gitignore
│   ├── hooks/
│   │   ├── sync-protocol-on-spec-save.json
│   │   └── run-core-pbt-on-edit.json
│   ├── specs/
│   │   ├── tether-protocol/
│   │   │   ├── requirements.md
│   │   │   ├── design.md
│   │   │   └── tasks.md
│   │   ├── tether-deck/
│   │   │   ├── requirements.md
│   │   │   ├── design.md
│   │   │   └── tasks.md
│   │   └── phantom-beam/
│   │       ├── requirements.md
│   │       ├── design.md
│   │       └── tasks.md
│   └── steering/
│       ├── product.md
│       ├── tech.md
│       ├── structure.md
│       └── sensor-browser-safety.md
├── tetherkit-core/                        # Kerangka inti (Skeleton SDK + UI Emulator)
│   ├── src/
│   │   ├── protocol/                      # Schema Zod/TS, frame encoder, seq guard
│   │   ├── transport/                     # WebRTC, WS Relay, BroadcastChannel adapters
│   │   ├── sensors/                       # Gyro normalizer, EMA filter, Touch fallback
│   │   ├── feedback/                      # Vibration + WebAudio + WakeLock manager
│   │   ├── react/                         # useTetherHost, useTetherController, QR & Emulator UI
│   │   └── index.ts
│   ├── tests/
│   │   ├── protocol.pbt.test.ts           # Property-based tests via fast-check
│   │   └── sensor-math.pbt.test.ts
│   └── package.json
├── tether-deck/                           # APLIKASI 1 (Folder Terpisah): Presenter & 3D Tool
│   ├── src/
│   │   ├── host/                          # Desktop 3D Inspector, Slide Engine, Laser Overlay
│   │   ├── controller/                    # Mobile Presenter UI (Calibrate, Notes, Timer, Buttons)
│   │   ├── assets/                        # Sample .glb models & built-in slide deck
│   │   └── App.tsx
│   ├── vite.config.ts
│   └── package.json
├── phantom-beam/                          # APLIKASI 2 (Folder Terpisah): Gim Horor Asimetris
│   ├── src/
│   │   ├── host/                          # Desktop Corridor Renderer, Ghost AI, Flashlight, EMF Math
│   │   ├── controller/                    # Mobile Flashlight/EMF Meter UI, UV Surge Trigger
│   │   ├── audio/                         # Procedural Geiger & Ambient WebAudio synth
│   │   └── App.tsx
│   ├── vite.config.ts
│   └── package.json
├── signaling-relay/                       # Server Ringan WebSocket Signaling + Relay Fallback
│   ├── src/
│   │   ├── room-manager.ts
│   │   ├── rate-limiter.ts
│   │   └── server.ts
│   ├── Dockerfile
│   └── package.json
├── LICENSE                                # MIT License (terdeteksi otomatis GitHub)
├── README.md                              # Dokumentasi arsitektur, cara pasang, demo links
├── THIRD_PARTY_NOTICES.md                 # Pengungkapan penuh pustaka & aset open-source
├── pnpm-workspace.yaml
└── package.json

---

## 3. Topologi Sistem & Aliran Data Jaringan

+-------------------------------------------------------------------+

| DESKTOP HOST BROWSER |
| [tether-deck] ATAU [phantom-beam] |
| |-- Host App Engine (Three.js / Game Loop / Slide Deck) |
| |-- TetherHost (tetherkit-core) |
| | |-- SensorFrame Receiver (Seq Drop + State Store) |
| | |-- FeedbackEmitter (EMF / Slide State -> Controller) |
| | '-- Split-View Emulator Drawer (BroadcastChannel mode) |
+-------+-------------------------+-------------------------+-------+

| (A) SDP/ICE + | (B) WebRTC P2P | (C) Fallback
| WS Relay Fallback | (Primary Path) | Emulator
        v | v
+-------------------------------+ | +---------------+

| SIGNALING & RELAY SERVER | | | Local Tab |
| (Node.js + ws over TLS/WSS) | | | BroadcastCh |
| - Room Map (TTL 15 menit) | | +-------+-------+
| - SDP / ICE Forwarding | | |
| - Fallback Frame Relay | | |
+---------------+---------------+ | |
                ^ | |

| (WSS)           v (UDP-like & Ordered)    v
+---------------+-------------------------------------------+-------+

| MOBILE CONTROLLER BROWSER |
| URL: https://<app-domain>/control?room=AB12CD&token=... |
| |-- Permission & WKWebView Gate (iOS requestPermission) |
| |-- SensorPipeline (Gyro 60Hz + EMA Filter OR Touch Trackpad) |
| |-- WakeLockManager (navigator.wakeLock + visibilitychange) |
| '-- FeedbackDispatcher (Vibration API + WebAudio + Edge Glow) |
+-------------------------------------------------------------------+

### 3.1 Konfigurasi Dual-Channel WebRTC

Untuk menghindari *Head-of-Line blocking* (di mana 1 paket sensor yang hilang menahan seluruh antrean gerakan berikutnya), `TetherHost` dan `TetherController` membuka dua `RTCDataChannel` terpisah:

| Nama Kanal | Konfigurasi `RTCDataChannelInit` | Arah Data | Jenis Pesan |
| --- | --- | --- | --- |
| `tether-sensor` | `{ ordered: false, maxRetransmits: 0 }` | Controller -> Host | `SensorFrame` 60 Hz (orientasi relatif, delta sentuh, status tombol tahan) |
| `tether-control` | `{ ordered: true }` | Dua Arah (`Host <-> Controller`) | `HandshakeAck`, `RecenterEvent`, `DiscreteAction` (next/prev slide, mode switch), `FeedbackEvent` (EMF, getar, sinkron catatan/timer) |

---

## 4. Desain Mendalam Modul Inti (`tetherkit-core`)

### 4.1 State Machine Koneksi & Fallback Otomatis

[IDLE]

|-> Host creates room / Controller scans QR
[SIGNALING_CONNECTING] --(WSS connected)--> [JOINED_ROOM]

| |
| (Both peers present)                         v
  +------------------------------------> [WEBRTC_NEGOTIATING] (Timer: 4000ms)

| |
                         ICE + DataChannel | | Timeout 4000ms OR
                         Open < 4000ms | | ICE Failed
                                            v           v
                                    [P2P_CONNECTED]  [WS_RELAY_CONNECTED]

| |
                                            +-----+-----+

| (Session active)
                                                  v
                                        [DISCONNECTED / RETRY]

* Jalur Paralel Single-Screen Judge Mode:
[IDLE] --(Klik "Split-View Emulator")--> [LOCAL_LOOPBACK_CONNECTED via BroadcastChannel]

### 4.2 Protokol Pesan (`TetherProtocol` v1)

Seluruh muatan memakai tipe ketat TypeScript dengan *sequence counter* (`seq`) untuk menjamin konsistensi di atas kanal tak berurutan:

```ts
export type TransportMode = 'p2p' | 'ws-relay' | 'local-emulator';

export interface SensorFrame {
  v: 1;
  type: 'sensor';
  seq: number;        // Monotonik naik; paket dengan seq <= lastSeq dibuang
  ts: number;         // performance.now() pengirim untuk estimasi jitter/latensi
  inputSource: 'gyro' | 'touch';
  nx: number;         // Koordinat pointer/aim ternormalisasi [-1.0, 1.0]
  ny: number;         // Koordinat vertikal ternormalisasi [-1.0, 1.0]
  roll: number;       // Sudut miring pergelangan [-1.0, 1.0] (untuk rotasi 3D)
  primaryHeld: boolean; // Tahan tombol aksi (Grab 3D / Laser / UV Surge)
}

export interface ControlAction<TPayload = unknown> {
  v: 1;
  type: 'action';
  action: string;     // Contoh: 'slide_next', 'slide_prev', 'recenter', 'game_restart'
  payload?: TPayload;
}

export interface FeedbackEvent {
  v: 1;
  type: 'feedback';
  emfIntensity?: number;      // 0.0 - 1.0 (untuk phantom-beam)
  vibratePattern?: number[];  // Di-clamp maks 10 elemen, total <= 10000 ms
  audioCue?: 'tick' | 'banish' | 'warning' | 'click';
  syncState?: Record<string, unknown>; // Misal: { slideIndex, notes, remainingSec }
}
```

### 4.3 Pipeline Sensor, Kalibrasi Relatif, & Penanganan iOS/Android

Masalah paling umum pada demo giroskop web adalah efek *gimbal lock* pada sudut Euler mentah (`alpha` 0–360 derajat yang melompat dari 359 ke 0) serta posisi awal ponsel yang tidak mengarah ke layar. `SensorPipeline` memecahkannya lewat empat tahap:

1. **Permission & WebView Gate:**
   - Memeriksa keberadaan `DeviceOrientationEvent` dan metode statis `(DeviceOrientationEvent as any).requestPermission`.
   - Memeriksa pola *User-Agent* peramban dalam aplikasi (`FBAN`, `FBAV`, `Instagram`, `Line`, `MicroMessenger`, `WhatsApp`, atau deteksi hilangnya `requestPermission` pada iOS). Jika terdeteksi berada di `WKWebView`, tampilkan bannerinstruksi *"Buka di Safari/Chrome untuk giroskop penuh"* sekaligus langsung mengaktifkan **Touch Trackpad Mode** agar aplikasi tetap bisa dimainkan tanpa jeda.
2. **Shortest-Angle Delta & Relative Calibration (Zeroing):**
   - Saat tombol **Recenter** ditekan, `originYaw = rawAlpha`, `originPitch = rawBeta`, `originRoll = rawGamma` disimpan.
   - Selisih sudut `deltaYaw` dihitung dengan fungsi pembungkus terpendek (*shortest angular distance*) ke rentang `[-180, 180]` agar perlintasan batas `0/360` tidak pernah melompat:
```ts
export function wrapDeltaDegrees(current: number, origin: number): number {
  const diff = ((current - origin + 540) % 360) - 180;
  return diff;
}
```
   - Nilai `deltaYaw` dan `deltaPitch` dipetakan ke jendela sudut nyaman (misal `+/- 35 deg` -> `[-1, 1]`) dan di-*clamp* pada `[-1, 1]`.
3. **Exponential Moving Average (EMA) + Deadzone:**
   - Menerapkan filter smoothing ringan (`smoothed = alpha * raw + (1 - alpha) * prev`, dengan `alpha = 0.35`) dan *micro-deadzone* `0.004` untuk menghilangkan getaran tangan manusia pada kursor laser/senter tanpa terasa lamban (*laggy*).
4. **Touch Trackpad Fallback:**
   - Area sentuh penuh di layar ponsel menerjemahkan `pointermove` menjadi penambahan `(nx, ny)` secara proporsional. Pengguna tetap dapat memutar model 3D, mengarahkan laser, dan menyapu senter koridor dari desktop atau perangkat tanpa sensor.

### 4.4 FeedbackDispatcher & WakeLockManager

* **`FeedbackDispatcher`:**
  - Mengecek dukungan runtime `typeof navigator.vibrate === 'function'` dan memastikan ada *sticky user activation* sebelum memanggil getaran.
  - Melakukan sanitasi pola getar (maksimal 10 angka, tiap nilai <= 1000 ms) agar aman dari penolakan browser Android OEM.
  - Pada iOS/Desktop (atau saat mode Audio aktif), memicu *synthesizer* Web Audio API (`OscillatorNode` + `GainNode` pendek 15 ms) untuk menghasilkan klik taktil / detak Geiger-counter serta memicu CSS state `pulseIntensity` pada tepi layar ponsel.
* **`WakeLockManager`:**
  - Memanggil `await navigator.wakeLock.request('screen')` dalam blok `try/catch` (agar tidak error saat mode hemat daya aktif atau browser lama).
  - Mendaftarkan pendengar `document.addEventListener('visibilitychange', ...)` untuk otomatis meminta kembali *wake lock* saat layar ponsel kembali fokus, dan melepasnya saat sesi berakhir.

---

## 5. Arsitektur Aplikasi 1: `tether-deck`

### 5.1 Komponen Desktop Host

* **Mode Switcher (`3D Inspector` | `Laser & Slides`):** Mempertahankan koneksi `TetherHost` tetap hidup saat presenter berpindah mode.
* **3D Viewport (`ThreeInspector.tsx`):**
  - Menggunakan Three.js dengan dua aset `.glb` bawaan (misal: *Modular Cyber Server Node* dan *Mechanical Gyro Artifact*) ditambah input unggah lokal `URL.createObjectURL(file)` untuk `.glb` milik pengguna.
  - Menerima `SensorFrame`: saat `primaryHeld === true`, `nx/ny/roll` memutar objek secara mulus menggunakan *quaternion increment*; tombol zoom di ponsel menggeser jarak kamera.
* **Slide & Laser Canvas (`SlidePresenter.tsx`):**
  - Merender dek presentasi HTML/Markdown bawaan (5 slide demonstrasi interaktif).
  - Lapisan kanvas `<canvas>` transparan penuh (`pointer-events: none`) merender titik laser dengan *ring buffer* 12 posisi terakhir untuk menciptakan efek jejak cahaya halus pada `requestAnimationFrame`.
  - Setiap pergantian slide mengirim `FeedbackEvent.syncState` (`{ slideIndex, totalSlides, speakerNotes, elapsedSec }`) ke ponsel.
* **Telemetry HUD:** Pill ringkas di sudut kanan atas menampilkan badge mode (`P2P` hijau / `RELAY` kuning / `EMULATOR` biru), latensi estimasi, dan indikator baterai/sensor ponsel.

### 5.2 Komponen Mobile Controller (`DeckController.tsx`)

* Atas: Status bar transport, tombol **Recenter**, dan tombol ganti mode (`3D` / `Laser`).
* Tengah: Panel **Catatan Pembicara & Timer** (pada mode Slides) atau pad orientasi visual dengan indikator posisi sentuh cadangan.
* Bawah: Tombol besar ergonomis **HOLD TO LASER / ORBIT** (ramah ibu jari) + tombol **PREV** dan **NEXT**.

---

## 6. Arsitektur Aplikasi 2: `phantom-beam`

### 6.1 Engine Permainan & Pencahayaan (`CorridorEngine.ts`)

Berjalan pada loop `requestAnimationFrame` terpisah dari siklus *re-render* React untuk menjamin 60 FPS stabil:

* **Adegan Gelap (Three.js / WebGL):** Lorong batu gotik prosedural dengan *exponential fog* pekat dan lampu `SpotLight` tunggal yang mengikuti koordinat `(nx, ny)` dari `TetherHost` dengan sedikit efek inersia tangan.
* **Entitas Hantu & AI:**
  - `Stalker Wraith`: Muncul di balik kabut, bergerak mendekati pemain perlahan; mengeluarkan aura kabur sebelum menampakkan wujud penuh saat tersorot senter.
  - `Shadow Mimic`: Berpindah posisi secara lateral; menghindar jika terkena sorot pinggiran senter terlalu lama tanpa *UV Surge*.
* **Kalkulasi EMF & Throttling Hilir:**
  - Setiap *frame*, engine menghitung jarak ternormalisasi `d` (0–1) dan keselarasan sudut `cosTheta` antara arah senter dengan posisi entitas terdekat.
  - Nilai `emf = clamp((1 - d) * 0.65 + max(0, cosTheta) * 0.35, 0, 1)`.
  - Pengiriman `FeedbackEvent` dari desktop ke ponsel **di-throttle maksimal setiap 66 ms (15 Hz)** dan hanya dikirim jika perubahan `|emf - prevEmf| > 0.03` atau timer detak terpenuhi—mencegah banjir antrean pesan di DataChannel dan motor getar.
* **Mekanik UV Surge (Exorcism):**
  - Saat `cosTheta > cos(10°)` (senter tepat mengunci entitas) dan `primaryHeld === true` selama akumulasi `2000 ms`, intensitas warna senter bergeser ke sinar ungu UV, progres banishment naik ke 100%, partikel pecah muncul, dan `audioCue: 'banish'` dikirim ke ponsel.
  - Setelah lock diperoleh, histeresis mempertahankannya sampai 14° agar getaran tangan tidak membuat lock berkedip. HP mengirim pola haptic khusus saat lock diperoleh dan denyut progres pada 25/50/75%.

### 6.2 Komponen Mobile Controller (`PhantomController.tsx`)

* Desain UI ala perangkat keras **EMF Reader / Senter Taktis**:
  - 5 segmen LED indikator EMF (Hijau -> Kuning -> Oranye -> Merah Berkedip) + jarum analog SVG responsif.
  - Tombol tengah besar **HOLD: UV SURGE** dengan progres cincin melingkar.
  - Panel kalibrasi **RECENTER FLASHLIGHT** dan tombol sinkron **PLAY AGAIN** saat sesi 60 detik selesai.

---

## 7. Arsitektur Backend (`signaling-relay`)

Server dirancang seminimal mungkin agar biaya operasional nol dan bebas basis data:

* **Teknologi:** Node.js 22 + `ws` (WebSocket) + `nanoid`.
* **Penyimpanan State:** `Map<roomId, RoomState>` di memori RAM. Setiap `RoomState` menampung maksimal 2 klien (`host` dan `controller`), `sessionTokenHash`, serta `expiresAt` (TTL 15 menit yang diperbarui saat ada aktivitas).
* **Alur Pesan Signaling:**
  1. `register_host` -> server mengembalikan `roomId`.
  2. `join_room` (memvalidasi `roomId` & `sessionToken`) -> server memberi tahu kedua pihak `peer_ready`.
  3. `signal_offer` / `signal_answer` / `signal_ice` -> diteruskan langsung ke lawan bicara di ruangan yang sama.
  4. `relay_frame` (hanya aktif bila mode `WS_RELAY` dipakai) -> meneruskan JSON/biner ringan antar dua peer di ruangan yang sama, dengan batasan ukuran muatan maksimal `4 KB` per pesan.
* **Keamanan:** Pembatasan maksimal 200 ruangan aktif bersamaan pada instans gratis dan *rate limiter* per IP (maksimal 30 koneksi/menit) untuk mencegah penyalahgunaan URL publik selama penjurian.

---

## 8. Blueprint Konfigurasi Kiro (`/.kiro`)

Berikut rancangan berkas nyata yang harus dibuat dan dipelihara di folder `/.kiro/` selama pengembangan agar terverifikasi dalam repositori publik.

### 8.1 `.kiro/steering/sensor-browser-safety.md`

---
inclusion: fileMatch
fileMatchPattern: ["tetherkit-core/src/sensors/**", "tetherkit-core/src/feedback/**"]
---
# Pedoman Kompatibilitas Sensor & Haptik Peramban

1. Seluruh akses `DeviceOrientationEvent.requestPermission()` WAJIB dipanggil langsung secara sinkron di dalam event handler klik pengguna (user gesture), bukan di dalam `useEffect` atau `setTimeout`.
2. Selalu siapkan fallback `TouchTrackpadAdapter` apabila permission ditolak, sensor tidak tersedia, atau halaman dibuka di `WKWebView` / peramban dalam aplikasi.
3. `navigator.vibrate()` tidak didukung di iOS Safari dan Firefox 129+. Selalu panggil melalui `FeedbackDispatcher` yang membatasi array maksimal 10 elemen, mengecek fungsi secara defensif, dan otomatis memicu Web Audio + pulse visual sebagai pengganti universal.
4. `navigator.wakeLock` wajib dibungkus try/catch dan didaftarkan ulang pada event `visibilitychange` saat `document.visibilityState === 'visible'`.

### 8.2 `.kiro/hooks/run-core-pbt-on-edit.json`

Menggunakan aksi `command` (Shell Command) agar otomatis memvalidasi properti matematika & protokol tiap kali agent menyunting berkas inti tanpa menghabiskan kuota kredit Kiro:

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Run TetherKit Core Property-Based Tests",
      "description": "Menjalankan tes properti fast-check setiap kali agent mengubah protokol atau matematika sensor",
      "trigger": "FileSave",
      "matcher": "^tetherkit-core/src/(protocol|sensors)/.*\\.ts$",
      "action": {
        "type": "command",
        "command": "pnpm --filter tetherkit-core test:pbt"
      },
      "timeout": 45,
      "enabled": true
    }
  ]
}
```

### 8.3 `.kiro/hooks/sync-protocol-on-spec-save.json`

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Verify Spec & Protocol Alignment",
      "description": "Mengingatkan agent untuk memverifikasi kesesuaian tipe TypeScript saat spesifikasi protokol diperbarui",
      "trigger": "FileSave",
      "matcher": "^\\.kiro/specs/tether-protocol/(requirements|design)\\.md$",
      "action": {
        "type": "agent",
        "prompt": "Spesifikasi tether-protocol baru saja diperbarui. Periksa perbedaan terhadap tetherkit-core/src/protocol/types.ts, perbarui skema tipe bila perlu, dan pastikan unit test serta PBT tetap lolos."
      },
      "enabled": true
    }
  ]
}
```

### 8.4 Spesifikasi Property-Based Testing (`fast-check`)

Properti invarian berikut diuji otomatis dengan ratusan input acak (termasuk nilai ekstrem `NaN`, `-0`, `359.999 deg`, dan urutan paket acak) pada `tetherkit-core/tests/`:

| Nama Properti | Invarian yang Diuji via `fast-check` |
| --- | --- |
| **Angle Wrapping Bounds** | Untuk sembarang sudut `a, b` dalam `[0, 360)`, `wrapDeltaDegrees(a, b)` selalu menghasilkan nilai dalam rentang `[-180, 180)` dan `wrapDeltaDegrees(a, a) === 0`. |
| **Calibration Identity** | Setelah memanggil `calibrate(rawYaw, rawPitch)` dengan sudut input acak, pembacaan berikutnya dengan sudut yang sama persis menghasilkan `nx === 0` dan `ny === 0`. |
| **Normalized Output Clamp** | Untuk sembarang input giroskop atau geseran sentuh acak, nilai keluaran `nx`, `ny`, `roll` tidak pernah menghasilkan `NaN`/`Infinity` dan selalu berada di `[-1.0, 1.0]`. |
| **Monotonic Sequence Guard** | Untuk sembarang permutasi urutan bilangan bulat `seq` yang masuk ke `FrameOrderGuard`, nilai `lastAcceptedSeq` bersifat naik monoton dan paket usang selalu ditolak. |
| **Vibration Sanitizer** | Untuk sembarang array bilangan bulat acak (negatif, sangat panjang, atau nilai > 10000), `sanitizeVibrationPattern()` selalu mengembalikan panjang <= 10 dan total durasi <= 10.000 ms. |

---

## 9. Deployment, HTTPS Lokal, & Keamanan Produksi

| Lingkungan | Konfigurasi Hosting & TLS | Tujuan |
| --- | --- | --- |
| **Dev Lokal (Laptop + HP Asli)** | `@vitejs/plugin-basic-ssl` atau `cloudflared tunnel --url https://localhost:5173` | **Wajib:** iOS Safari dan Chrome Android memblokir API `DeviceOrientation` dan `WakeLock` pada alamat LAN `http://192.168.x.x`. |
| **Produksi Frontend** | **Vercel** atau **Cloudflare Pages** (2 proyek terpisah atau 2 sub-domain untuk `tether-deck` dan `phantom-beam`, otomatis HTTPS) | Menjamin *Working App URL* Devpost cepat, gratis, dan memiliki sertifikat TLS valid. |
| **Produksi Signaling Relay** | **Fly.io** / **Railway** / **Render** (`wss://relay.tetherkit...`) | Mendukung koneksi WebSocket persisten dengan TLS terminasi otomatis. |

### Daftar Periksa Uji Coba Pra-Pengumpulan

1. **Uji Lintas Jaringan:** Uji Host di Wi-Fi rumah/kantor dan Ponsel menggunakan jaringan seluler 4G/5G untuk memverifikasi transisi `P2P` (STUN) maupun fallback otomatis ke `WS_RELAY` jika NAT memblokir.
2. **Uji Matriks Perangkat:** Uji pada minimal 1 Android Chrome (verifikasi getar + giroskop + Wake Lock), 1 iPhone Safari (verifikasi dialog `requestPermission` + pengganti audio/visual + Wake Lock), dan 1 peramban dalam aplikasi (verifikasi pesan WKWebView + Touch Trackpad).
3. **Uji Pengalaman Juri 1 Layar:** Buka URL publik di mode *Incognito* pada satu desktop saja, klik **"Try Virtual Phone (Split-View)"**, dan selesaikan satu putaran presentasi di `tether-deck` serta satu putaran pengusiran hantu di `phantom-beam` dalam waktu di bawah 90 detik.