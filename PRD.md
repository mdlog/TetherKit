# Product Requirements Document (PRD): TetherKit

| Atribut Dokumen | Detail |
| --- | --- |
| Nama Produk | **TetherKit** (Core SDK + `tether-deck` + `phantom-beam`) |
| Versi Dokumen | 1.0.0 (Hackathon MVP Specification) |
| Target Kompetisi | **Kiroween 2026** — Kategori Utama: **Skeleton Crew** |
| Potensi Bonus Target | *Best Demo*, *Bonus Blog Prize*, *Social Blitz Prize* (opsional: *Best Student* / *Best Startup*) |
| Tenggat Pengumpulan | Jumat, 4 Desember 2026 pukul 14:00 PST (Sabtu, 5 Desember 2026 pukul 05:00 WIB / 06:00 WITA) |
| Lisensi Proyek | MIT Open Source License |

---

## 1. Ringkasan Eksekutif & Visi Produk

**TetherKit** adalah kerangka kerja (*skeleton code template*) sumber terbuka dan nol-instalasi yang mengubah ponsel pintar apa pun menjadi pengontrol gerak spasial, papan sentuh nirkabel, dan unit umpan balik fisik berlatensi rendah bagi aplikasi web desktop—cukup dengan memindai kode QR di peramban.

Berbeda dari solusi pelacakan gestur berbasis kamera web yang menuntut pencahayaan baik, sudut kamera tetap, serta pengunduhan dependensi visi komputer yang berat, TetherKit memanfaatkan **WebRTC DataChannel** dan **sensor bawaan peramban seluler** (giroskop, sentuh multi-jari, audio prosedural, dan getar haptik) untuk membangun tautan dua arah berkecepatan tinggi langsung di peramban modern.

Untuk membuktikan fleksibilitas kerangka inti `tetherkit-core`, repositori ini menyertakan **dua aplikasi yang sangat kontras** dari satu fondasi yang sama:
1. **`tether-deck` (Aplikasi Produktivitas & Presentasi):** Mengubah ponsel menjadi penunjuk laser giroskopik, pengontrol rotasi model 3D, dan remot presentasi lengkap dengan catatan pembicara serta pengatur waktu langsung di layar ponsel.
2. **`phantom-beam` (Aplikasi Gim Horor Asimetris Bertema Kiroween):** Menyulap layar desktop menjadi lorong gelap berhantu, sementara ponsel di tangan pemain bertindak sebagai senter fisik dan detektor EMF (*Electromagnetic Field*) yang mengeluarkan denyut audio/visual serta getaran haptik semakin cepat saat mendekati entitas tak kasatmata.

---

## 2. Latar Belakang Masalah & Peluang

| Masalah Utama | Dampak Terhadap Pengembang & Pengguna | Solusi TetherKit |
| --- | --- | --- |
| Aplikasi desktop interaktif & demo 3D terikat pada mouse/trackpad | Presentasi produk, inspeksi objek 3D, dan gim web terasa datar dan kurang imersif | Mengubah ponsel yang sudah dimiliki setiap orang menjadi pengontrol 3-DOF/sentuh nirkabel |
| Pengendali berbasis kamera web (Computer Vision) rapuh | Gagal di ruangan gelap, menguras CPU, dan memicu kekhawatiran privasi kamera | Memakai sensor orientasi/sentuh lokal ponsel tanpa menyalakan kamera maupun mengirim video |
| Membangun proyek *multi-device* dari nol memakan waktu lama | Pengembang harus menulis ulang kode pairing QR, WebRTC ICE, fallback relay, kalibrasi, dan Wake Lock | Menyediakan kerangka *skeleton* siap pakai (`tetherkit-core`) dengan kontrak skema tervalidasi Kiro Specs |
| Juri hackathon sering menguji aplikasi hanya dari 1 laptop | Aplikasi dua perangkat kerap tidak bisa dinilai maksimal jika juri enggan mengambil ponsel | Menyediakan **Virtual Phone Split-View Emulator** bawaan sehingga 100% fitur tetap bisa diuji pada satu layar |

---

## 3. Kesesuaian Kriteria Penjurian & Kepatuhan Aturan

### 3.1 Pemetaan Terhadap 5 Kriteria Penjurian Kiroween 2026

1. **Potential Impact:** Memberi templat nyata bagi pengembang web untuk membuat gim pesta, alat presentasi interaktif, maupun kontroler instalasi pameran tanpa memerlukan aplikasi toko (*App Store/Play Store*).
2. **Technological Implementation:** Memanfaatkan **Kiro Spec-Driven Development** (`.kiro/specs/`), **Agent Hooks** (`.kiro/hooks/`), **Steering Docs** (`.kiro/steering/`), dan **Property-Based Testing** (`fast-check`) untuk menjamin keandalan protokol sinkronisasi biner/JSON antara ponsel dan desktop.
3. **Design:** Antarmuka bersih bergaya *Spatial Utility* pada `tether-deck` dan atmosfer *Gothic Phosphor / EMF Radar* pada `phantom-beam`, lengkap dengan kalibrasi satu ketukan dan HUD latensi real-time.
4. **Innovation / Idea:** Menyediakan dua arah komunikasi fisik—gerak ponsel mengendalikan kanvas desktop (hulu), dan kondisi spasial desktop memicu sinyal EMF/getar/audio ke ponsel (hilir)—melalui arsitektur nol-instalasi dengan mode emulator bawaan.
5. **Presentation:** Video demo di bawah 3 menit langsung memperlihatkan *picture-in-picture* tangan memegang ponsel asli menggerakkan model 3D di detik ke-5, berpindah ke senter berhantu di detik ke-20, lalu membedah otomatisasi Kiro.

### 3.2 Daftar Periksa Kepatuhan Aturan Kategori *Skeleton Crew*

- [ ] Repositori **GitHub publik** (bukan GitLab/BitBucket) dibuat baru antara 30 Oktober – 4 Desember 2026.
- [ ] Berkas `LICENSE` (MIT) berada di *root* dan terdeteksi pada bagian *About* GitHub.
- [ ] Folder `/.kiro` berada utuh di *root* proyek dan **tidak** tercantum di `.gitignore`.
- [ ] Terdapat **dua folder aplikasi terpisah** yang jelas di dalam repositori (`tether-deck/` dan `phantom-beam/`), terpisah dari pustaka inti (`tetherkit-core/`).
- [ ] Tersedia **Working App URL** publik berbasis **HTTPS** (wajib untuk API sensor perangkat) yang dapat langsung dijalankan juri.
- [ ] Video demo diunggah publik ke YouTube berdurasi **kurang dari 3 menit**, bebas musik atau merek berhak cipta pihak ketiga.
- [ ] Berkas `THIRD_PARTY_NOTICES.md` mencantumkan seluruh pustaka sumber terbuka dan aset yang digunakan.

---

## 4. Persona Pengguna & Skenario Utama

1. **Raka (Pembicara Teknis / Desainer 3D — Pengguna `tether-deck`):**
   Ingin memutar model arsitektur 3D dan mengarahkan laser pointer saat presentasi dari jauh tanpa membeli *clicker* fisik mahal, sekaligus melihat sisa waktu dan catatan di genggaman tangannya.
2. **Dina (Pemain Kasual — Pengguna `phantom-beam`):**
   Ingin memainkan gim horor singkat 60 detik di laptop bersama teman hanya dengan memindai QR, merasakan sensasi mengayunkan ponsel seperti senter asli di ruangan gelap dengan efek suara dan getar mendebarkan.
3. **Budi (Pengembang Web — Pengguna `tetherkit-core`):**
   Ingin menyalin (*fork*) templat bersih yang mudah dipahami dalam 10 menit untuk membuat aplikasi kontroler ponsel kustom miliknya sendiri memakai Kiro IDE.
4. **Dewan Juri Hackathon (Penguji Cepat < 90 Detik):**
   Mungkin menguji menggunakan ponsel pribadi dengan memindai QR, ATAU menguji cepat di satu peramban laptop menggunakan tombol **"Launch Split-View Emulator"** tanpa perlu menyentuh ponsel.

---

## 5. Batasan Ruang Lingkup (*Scope Boundaries*)

### 5.1 Masuk Ruang Lingkup MVP (Harus Selesai Sebelum 4 Desember 2026)

* **Core SDK (`tetherkit-core`):** Pairing kode QR + kode ruangan 6-karakter manual, koneksi WebRTC DataChannel (kanal sensor tak berurutan + kanal kontrol andal), *fallback* otomatis ke WebSocket Relay setelah timeout 4 detik, kalibrasi pusat (*recenter*), filter *smoothing* orientasi, mode cadangan *Touch Trackpad* (untuk perangkat tanpa giroskop/WKWebView), manajemen `Screen Wake Lock`, `FeedbackDispatcher` (Vibration API Android + Web Audio + pulsa visual iOS/desktop), dan komponen `VirtualPhoneEmulator`.
* **App 1 (`tether-deck`):** Mode *3D Spatial Inspector* (Three.js dengan 2 model interaktif bawaan + kontrol rotasi/zoom), Mode *Laser & Slide Deck* (5 slide interaktif bawaan bertema TetherKit/Kiroween + laser trail halus), tampilan catatan pembicara & timer di ponsel, serta HUD metrik latensi/FPS.
* **App 2 (`phantom-beam`):** Lorong 3D/2.5D gelap dengan sorot kerucut senter real-time, 2 jenis entitas hantu (*Stalker Wraith* & *Shadow Mimic*) dengan AI patroli/mendekat, sistem perhitungan jarak-sudut untuk mengirim intensitas EMF 0.0–1.0 ke ponsel, mekanik tembak *UV Overload* untuk mengusir entitas, kondisi menang/kalah dalam sesi 60 detik, dan kontrol volume/audio.

### 5.2 Di Luar Ruang Lingkup MVP (Ditunda Pasca-Hackathon)

* Dukungan multipemain serentak (> 1 ponsel terhubung ke 1 layar desktop dalam satu sesi).
* Unggah berkas PPTX/PDF atau berkas `.glb` kustom ke penyimpanan awan permanen (MVP cukup mendukung unggah lokal di memori browser untuk `.glb`/Markdown dan konten bawaan siap pakai).
* Integrasi akun login/database pengguna (sesi bersifat sementara/*ephemeral* demi kecepatan dan privasi).

---

## 6. Persyaratan Fungsional (Format EARS untuk Kiro Specs)

### 6.1 Core Framework (`tetherkit-core`)

| ID | Persyaratan Fungsional (EARS Notation) | Prioritas |
| --- | --- | --- |
| FR-CORE-01 | **WHEN** Host desktop membuka sesi baru, **THE SYSTEM SHALL** menghasilkan `roomId` acak minimal 6 karakter beserta `sessionToken` sementara, membuka koneksi ke server *signaling*, dan menampilkan kode QR serta tautan pendek yang dapat disalin. | P0 (Wajib) |
| FR-CORE-02 | **WHEN** pengguna memindai kode QR dari ponsel atau mengetikkan kode ruangan, **THE SYSTEM SHALL** melakukan negosiasi WebRTC SDP/ICE dan membangun dua *DataChannel*: kanal `sensor` (`ordered: false, maxRetransmits: 0`) dan kanal `control` (`ordered: true`). | P0 (Wajib) |
| FR-CORE-03 | **IF** koneksi P2P WebRTC gagal tersambung dalam 4.000 ms (misalnya akibat NAT simetris/firewall), **THEN THE SYSTEM SHALL** secara otomatis beralih ke mode `WS_RELAY` melalui server WebSocket tanpa memutus alur pengguna dan memperbarui indikator status transport. | P0 (Wajib) |
| FR-CORE-04 | **WHEN** pengendali seluler dijalankan pada iOS Safari 13+ dan pengguna menekan tombol **"Connect & Enable Sensors"**, **THE SYSTEM SHALL** memanggil `DeviceOrientationEvent.requestPermission()` tepat di dalam *handler* klik pengguna tersebut. | P0 (Wajib) |
| FR-CORE-05 | **IF** API izin sensor ditolak pengguna atau tidak tersedia (seperti pada peramban dalam aplikasi `WKWebView` atau desktop), **THEN THE SYSTEM SHALL** mengaktifkan mode **Touch Trackpad Fallback** secara mulus dan menampilkan pesan saran membuka peramban sistem (Safari/Chrome) bila terdeteksi berada di `WKWebView`. | P0 (Wajib) |
| FR-CORE-06 | **WHEN** pengguna menekan tombol **"Recenter / Zero"** di ponsel, **THE SYSTEM SHALL** menyimpan orientasi saat ini sebagai titik referensi nol relatif (`offsetYaw`, `offsetPitch`, `offsetRoll`) sehingga seluruh gerakan selanjutnya dihitung relatif terhadap posisi nyaman pengguna. | P0 (Wajib) |
| FR-CORE-07 | **WHEN** pengendali seluler aktif dan terlihat, **THE SYSTEM SHALL** meminta `navigator.wakeLock.request("screen")` (jika didukung peramban) serta meminta ulang kunci layar secara otomatis setiap kali peristiwa `visibilitychange` kembali menjadi `visible`. | P1 (Tinggi) |
| FR-CORE-08 | **WHEN** Host desktop mengirimkan pesan `FeedbackEvent` (`intensity`, `pattern`), **THE SYSTEM SHALL** memicu `navigator.vibrate()` (dibatasi maksimal 10 elemen dan total < 10.000 ms) pada perangkat yang mendukung, serta memutar pulsa Web Audio API dan kilau tepi layar sebagai pengganti haptik universal pada iOS. | P0 (Wajib) |
| FR-CORE-09 | **WHEN** penguji di desktop mengeklik tombol **"Try Virtual Phone (Split-View)"**, **THE SYSTEM SHALL** membuka panel sisi berisi antarmuka pengendali seluler nyata yang terhubung ke Host via saluran lokal `BroadcastChannel` menggunakan skema `TetherProtocol` yang identik. | P0 (Wajib) |

### 6.2 Aplikasi 1 — `tether-deck`

| ID | Persyaratan Fungsional (EARS Notation) | Prioritas |
| --- | --- | --- |
| FR-DECK-01 | **WHEN** `tether-deck` berada dalam mode **Laser & Slides** dan ponsel dimiringkan, **THE SYSTEM SHALL** memetakan perubahan *yaw* dan *pitch* ke koordinat ternormalisasi `(x, y)` dalam rentang `[-1, 1]` dan merender titik laser bercahaya dengan efek jejak (*trail*) pada kanvas di atas slide aktif. | P0 (Wajib) |
| FR-DECK-02 | **WHEN** pengguna menekan tombol *Next* / *Previous* atau menggeser layar ponsel secara horizontal pada mode presentasi, **THE SYSTEM SHALL** memindahkan slide aktif di desktop dan menyinkronkan nomor slide, catatan pembicara, serta sisa waktu presentasi ke layar ponsel. | P0 (Wajib) |
| FR-DECK-03 | **WHEN** `tether-deck` berada dalam mode **3D Inspector** dan tombol *Grab / Orbit* di ponsel ditahan sambil memutar pergelangan tangan, **THE SYSTEM SHALL** memutar objek 3D Three.js secara halus pada sumbu yang sesuai dan mendukung geser dua-jari atau tombol zoom untuk memperbesar/memperkecil kamera. | P0 (Wajib) |
| FR-DECK-04 | **WHEN** pengguna memilih berkas `.glb` lokal atau salah satu dari 2 model bawaan di desktop, **THE SYSTEM SHALL** memuat objek ke adegan 3D tanpa mengirim berkas ke server eksternal dan langsung dapat dikendalikan dari ponsel. | P1 (Tinggi) |

### 6.3 Aplikasi 2 — `phantom-beam`

| ID | Persyaratan Fungsional (EARS Notation) | Prioritas |
| --- | --- | --- |
| FR-PHAN-01 | **WHEN** sesi permainan `phantom-beam` dimulai, **THE SYSTEM SHALL** merender ruang koridor gelap di desktop dengan kerucut cahaya senter yang mengikuti posisi `(x, y)` dari sensor ponsel secara real-time. | P0 (Wajib) |
| FR-PHAN-02 | **WHILE** entitas hantu berada di dalam atau dekat lorong permainan, **THE SYSTEM SHALL** menghitung skor kedekatan sudut sorot senter dan jarak entitas menjadi nilai EMF (`0.0` hingga `1.0`) serta mengirimkannya ke ponsel maksimal 15 kali per detik (throttled). | P0 (Wajib) |
| FR-PHAN-03 | **WHEN** ponsel menerima nilai EMF > `0.15`, **THE SYSTEM SHALL** menggerakkan jarum/bar LED EMF Meter di layar ponsel, mempercepat bunyi detak *Geiger-counter*, dan memicu pulsa haptik/audio dengan interval yang memendek seiring naiknya nilai EMF. | P0 (Wajib) |
| FR-PHAN-04 | **WHEN** sorot senter tepat mengenai entitas yang terungkap dan pemain menahan tombol **"UV Surge"** di ponsel selama 2,0 detik, **THE SYSTEM SHALL** meningkatkan meter pengusiran hingga 100%, memicu efek disolusi partikel, dan menambah skor pemain. | P0 (Wajib) |
| FR-PHAN-05 | **WHEN** seluruh target entitas berhasil diusir sebelum waktu 60 detik habis, **THE SYSTEM SHALL** menampilkan layar kemenangan ("AREA PURIFIED"); **IF** integritas kewarasan (*Sanity*) mencapai 0 akibat entitas menyentuh pemain terlalu lama atau waktu habis, **THE SYSTEM SHALL** menampilkan layar kekalahan beserta tombol **"Play Again"** yang disinkronkan antara desktop dan ponsel. | P0 (Wajib) |

---

## 7. Persyaratan Non-Fungsional (NFR)

| Kategori | Target Spesifikasi Terukur |
| --- | --- |
| **Latensi End-to-End** | <= 35 ms pada jaringan Wi-Fi lokal (WebRTC P2P); <= 110 ms pada mode fallback `WS_RELAY`. |
| **Laju Sampling & Render** | Pengiriman sensor dibatasi stabil pada 60 Hz; render kanvas desktop & 3D dijaga >= 60 FPS pada laptop standar. |
| **Kompatibilitas Peramban** | **Host Desktop:** Chrome 110+, Edge 110+, Firefox 115+, Safari 16.4+. **Ponsel:** Android Chrome 110+, iOS Safari 17+ (Wake Lock penuh pada iOS 18.4+, dengan degradasi aman pada versi di bawahnya). |
| **Keamanan & Privasi** | Wajib berjalan di atas **HTTPS/WSS**; tidak menyimpan data sensor di server; `roomId` otomatis kedaluwarsa setelah 15 menit tidak aktif; *rate limit* pesan signaling maksimal 30 permintaan/menit per IP. |
| **Ketahanan Paket (*Resilience*)** | Paket sensor berurutan nomor (`seq`) lebih kecil dari paket terakhir yang diterima wajib dibuang seketika agar tidak terjadi lonjakan mundur (*jitter spike*). |
| **Ukuran Bundel** | Paket inti `tetherkit-core` terkompresi < 25 KB (tanpa aset 3D), mudah dibaca sebagai templat *Skeleton Crew*. |

---

## 8. Storyboard Video Demo (< 3 Menit — Target 2 Menit 45 Detik)

Video direkam 1080p 60fps dengan rekaman kamera tangan memegang ponsel asli (*Picture-in-Picture*) agar keajaiban fisiknya langsung terlihat nyata.

| Rentang Waktu | Bagian | Visual di Layar & Aksi Nyata | Poin Pesan Narasi |
| --- | --- | --- | --- |
| **0:00 – 0:15** | **Hook Instan** | Layar desktop menampilkan `tether-deck` 3D model. PiP tangan memegang ponsel memindai QR -> detik ke-5 pergelangan tangan memutar model 3D seketika tanpa menyentuh mouse! | "Tak perlu kamera web atau instalasi aplikasi. Pindai QR, dan ponsel Anda langsung menjadi pengendali spasial 60Hz untuk desktop." |
| **0:15 – 0:50** | **Demo App 1: `tether-deck`** | Pindah ke mode Laser & Slides: gerakan tangan menyorot poin slide dengan *laser trail*, menekan tombol di ponsel untuk pindah slide sambil memperlihatkan catatan pembicara & timer di layar ponsel. | Menunjukkan nilai guna nyata (*Potential Impact*) untuk presenter, desainer 3D, dan pengembang. |
| **0:50 – 1:35** | **Demo App 2: `phantom-beam`** | Berpindah ke aplikasi kedua (`phantom-beam`). Lampu ruangan/layar meredup. Gerakan ponsel menyapu koridor gelap; saat mendekati hantu, EMF meter di ponsel menyala merah, bunyi Geiger berdetak kencang, lalu tombol *UV Surge* memusnahkan hantu. | "Satu kerangka kode yang sama melahirkan dua aplikasi kontras—membuktikan kelenturan arsitektur *Skeleton Crew*." |
| **1:35 – 2:20** | **Bedah Rekayasa Kiro** | Tampilkan struktur folder GitHub (`.kiro/` + `tether-deck/` + `phantom-beam/`). Buka Kiro IDE: ubah 1 aksi baru di `.kiro/specs/tether-protocol/requirements.md`, simpan -> tunjukkan **Agent Hook** memicu pembaruan tipe TypeScript & menjalankan **Property-Based Tests** (`fast-check`) secara otomatis. | Memamerkan kedalaman penggunaan Kiro (Specs EARS, Steering, Agent Hooks, dan PBT) untuk skor *Technological Implementation*. |
| **2:20 – 2:45** | **Fallback & Penutup** | Klik tombol **"Try Virtual Phone (Split-View)"** di satu layar laptop untuk menunjukkan kemudahan juri menguji tanpa ponsel, lalu tampilkan layar akhir URL repo & demo publik. | "TetherKit: Lean core, dua aplikasi nyata, siap diuji di ponsel maupun satu layar." |

---

## 9. Peta Jalan Eksekusi 15 Hari (19 November – 4 Desember 2026)

| Tanggal | Fase | Deliverable Kunci |
| --- | --- | --- |
| **19–20 Nov** | **Inisiasi & Fondasi Kiro** | Daftar Devpost, ajukan 4.000 kredit Kiro (jauh sebelum batas 1 Des), buat repo GitHub publik + lisensi MIT + `/.kiro/` (`steering` & `specs`), jalankan HTTPS dev lokal. |
| **21–24 Nov** | **Inti `tetherkit-core` & Signaling** | Implementasi server WebSocket signaling + relay, WebRTC dual-channel, kalibrasi giroskop, iOS permission flow, Touch Trackpad fallback, `FeedbackDispatcher`, dan `VirtualPhoneEmulator`. |
| **25–27 Nov** | **Aplikasi 1 (`tether-deck`)** | Bangun antarmuka presenter & Three.js 3D Inspector, slide engine, laser canvas, dan sinkronisasi timer/catatan. |
| **28–30 Nov** | **Aplikasi 2 (`phantom-beam`)** | Bangun lorong atmosferik, raycast/shader senter, AI 2 entitas, EMF feedback loop ke ponsel, audio prosedural, dan layar menang/kalah 60 detik. |
| **1 Des** | **Testing & PBT + Kredit** | Tulis dan luluskan rangkaian Property-Based Testing (`fast-check`), uji fisik di Android + iOS Safari + desktop, pastikan kredit Kiro sudah diproses (batas form 1 Des 12:00 PST). |
| **2 Des** | **Deployment & Konten Bonus** | Deploy production HTTPS (Frontend + WSS Relay), uji URL publik di Incognito, rekam & unggah video YouTube < 3 menit, terbitkan blog & pos `#KiroweenHackathon26`. |
| **3–4 Des** | **Audit Akhir & Submit** | Verifikasi `/.kiro/` tidak di-ignore, cek daftar pustaka pihak ketiga, finalisasi pengisian form Devpost minimal 12 jam sebelum **4 Des 14:00 PST (5 Des 05:00 WIB / 06:00 WITA)**. |

---

## 10. Matriks Risiko & Strategi Mitigasi

| Risiko Teknis / Nonteknis | Dampak | Strategi Mitigasi |
| --- | --- | --- |
| **iOS Safari memblokir sensor tanpa HTTPS atau tanpa klik langsung** | Sensor orientasi bernilai `null` | Wajib HTTPS di dev & prod; ikat `requestPermission()` ke tombol eksplisit; otomatis alihkan ke mode Touch Trackpad jika ditolak. |
| **Tautan QR dibuka di kamera/WhatsApp WebView (`WKWebView`)** | `requestPermission` tidak tersedia | Deteksi pola User-Agent WebView umum; tampilkan banner panduan "Buka di Safari/Chrome" + langsung aktifkan Touch Trackpad. |
| **iOS tidak mendukung `navigator.vibrate()`** | Tidak ada efek getar di iPhone | `FeedbackDispatcher` otomatis mengganti/melengkapi dengan detak Web Audio API + kilatan tepi layar sinkron. |
| **NAT/Firewall kampus/kantor memblokir koneksi WebRTC P2P** | Status tersangkut di *Connecting* | Timeout WebRTC 4 detik otomatis jatuh ke kanal cadangan `WS_RELAY` pada server signaling yang sama. |
| **Juri tidak memakai ponsel saat menilai** | Hanya melihat layar QR | Tombol **"Open Split-View Emulator"** menanamkan komponen ponsel asli di sebelah kanvas desktop lewat `BroadcastChannel`. |