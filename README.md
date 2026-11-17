# Smart Home & City IoT

Noventra adalah aplikasi web monitoring dan kontrol untuk prototipe Smart Home & City. Aplikasi menerima telemetri ESP32, menyimpan hingga 50 pembacaan terbaru di MongoDB, menampilkan kondisi sensor dan peringatan, serta menyediakan kontrol perangkat dan chatbot AI.

Menu Galeri Noventra menampilkan dokumentasi prototipe proyek IoT Kelompok 3, profil empat anggota, dan sembilan foto proyek dari folder `public/images`.

## Tentang aplikasi

Tujuan aplikasi ini adalah menyatukan data sensor dan beberapa kendali perangkat ESP32 dalam satu dashboard web. Sistem prototipe memantau suhu, kelembapan, parkir, gerakan, cahaya, jarak, level air, dan getaran. ESP32 juga mengendalikan aktuator seperti palang, lampu jalan, lampu lalu lintas, servo suhu, LED RGB, dan alarm.

Alamat web yang dikonfigurasi pada firmware saat ini adalah [smarcityandhome.vercel.app](https://smarcityandhome.vercel.app/). Aplikasi dapat dibuka melalui browser desktop maupun ponsel. Saat pertama dibuka, halaman pengantar Noventra tampil sekitar lima detik sebelum dashboard muncul. Aplikasi saat ini tidak meminta login.

### Cara menggunakan web

1. Buka alamat web di atas dan tunggu dashboard tampil.
2. Periksa indikator **Sistem online** di header dan **API terhubung** di sidebar untuk status API. Status ESP32 **Terhubung** berarti sudah ada pembacaan tersimpan; cocokkan waktu pembaruan terakhir untuk melihat kapan data itu diterima.
3. Pilih menu di sidebar untuk berpindah halaman. Di ponsel, buka sidebar dengan tombol menu.
4. Gunakan **Perbarui data** untuk meminta data terbaru secara manual. Dashboard juga mengambil data otomatis setiap 1,5 detik.
5. Untuk mengubah keluaran perangkat, buka **Kontrol ESP32** dan pilih kendali yang sesuai. Pastikan ESP32 aktif dan terhubung ke server.

### Menu, section, dan widget

#### Data Dashboard

Halaman ringkasan kondisi terbaru perangkat. Widget yang tersedia:

- **Kartu status ESP32 Smart City** menampilkan ID perangkat, status terhubung/menunggu data, dan waktu pembacaan terakhir yang diterima server.
- **Suhu udara** dan **Kelembapan** menampilkan pembacaan terbaru DHT11. Tanda `--` berarti data belum tersedia.
- **Parkir terisi** menampilkan jumlah kendaraan dan jumlah slot yang masih tersedia dari tiga slot.
- **Level air** menampilkan nilai ADC sensor water level dan memberi penanda jika firmware mendeteksi banjir.
- **Tren suhu & kelembapan** menggambarkan maksimal 50 pembacaan terbaru. Sumbu waktu mengikuti waktu data diterima server.
- **Status sensor** menampilkan kondisi getaran, banjir, lampu jalan, gerakan PIR, dan LED RGB.
- **Ketersediaan slot parkir** memperlihatkan status Slot A, B, dan C secara terpisah. Label slot A/B pada tampilan sudah mengikuti pemetaan khusus dashboard.
- **Sinkronisasi** di bagian bawah mengingatkan interval pembaruan dan batas penyimpanan pembacaan.

#### Kontrol ESP32

Berisi tiga kartu kendali:

- **Lampu RGB** menampilkan kondisi LED biru GPIO19 dan tombol untuk menyalakan atau mematikannya dari web.
- **Lampu jalan** menampilkan status lampu, nilai LDR, dan mode kontrol. Pilih **Otomatis** untuk mengikuti LDR, **Web ON** untuk menyalakan, atau **Web OFF** untuk mematikan.
- **Servo suhu** menampilkan posisi servo dan suhu DHT11. Pilih **Otomatis** untuk mengikuti aturan firmware, **Web ON** untuk membuka, atau **Web OFF** untuk menutup.

Pada lampu jalan dan servo suhu, pilihan **Web ON/OFF** adalah override. Pilih **Otomatis** lagi untuk menyerahkan kendali ke sensor. Perubahan web diteruskan ke ESP32 melalui API; hasil fisiknya bergantung pada ESP32 dan koneksinya.

#### Message

Inbox ini berisi peringatan yang dibuat ketika kondisi berubah menjadi aktif: banjir, getaran, gerakan PIR, suhu di atas 28 °C, atau seluruh slot parkir terisi. Setiap kartu menampilkan judul, rincian, waktu kejadian, tingkat keparahan, dan status sudah/belum dibaca. Badge di sidebar menunjukkan jumlah yang belum dibaca.

Gunakan **Tandai dibaca** pada sebuah pesan atau **Tandai semua dibaca** untuk memperbarui statusnya. API mengembalikan paling banyak 100 pesan terbaru. Peringatan dibuat saat transisi kondisi menjadi aktif, bukan pada setiap pembacaan selama kondisi tersebut masih aktif.

#### Chatbot AI

Chatbot menjawab pertanyaan tentang kondisi perangkat dan sensor. Tombol saran dapat mengisi pertanyaan contoh; kirim pertanyaan melalui kolom di bagian bawah. Setiap pertanyaan mengambil snapshot hingga lima pembacaan terbaru dari MongoDB. Pertanyaan ketersediaan parkir dijawab langsung dari data sensor; pertanyaan lain dikirim ke NVIDIA NIM, dengan satu model Free Endpoint cadangan bila model utama tidak menghasilkan teks. Jawaban mendukung Markdown.

Percakapan hanya disimpan sementara di halaman browser dan tidak menjadi arsip pesan sensor. Request hanya membawa delapan pesan percakapan terakhir (maksimal 1.200 karakter per pesan) agar chat panjang tidak membengkakkan konteks. Jika API key terkena rate limit/kuota atau ditolak, server mencoba key berikutnya yang diatur. Jika seluruh layanan gagal, UI menampilkan pesan bantuan singkat; detail teknis tetap dicatat di log server. Fitur ini membutuhkan setidaknya satu `NVIDIA_NIM_API_KEY_1` sampai `NVIDIA_NIM_API_KEY_5` pada server.

Chat memiliki tiga rute: RAG sebagai default untuk pertanyaan sensor/perangkat; perintah eksplisit lampu RGB/LED yang mengirim Web ON/OFF; dan perintah eksplisit lampu jalan yang mengirim Web ON/OFF, termasuk mengganti mode otomatis sebelumnya. Rute perintah menjawab lebih dulu, lalu aplikasi menyimpan perintah melalui API. Mode otomatis hanya tersedia di menu Kontrol ESP32; chat tidak mengaktifkan atau menawarkan mode tersebut. Pesan konfirmasi menandakan perintah tersimpan, dan ESP32 menerapkannya saat polling berikutnya.

#### Galeri Noventra

Menampilkan pengenalan proyek, penjelasan kemampuan pantau/otomatisasi/kendali, sembilan foto prototipe beserta keterangannya, dan profil empat anggota Kelompok 3.

#### Elemen umum

- **Sidebar** berisi kelima menu dan status koneksi API. Badge **Message** tampil jika ada pesan belum dibaca.
- **Header halaman** menunjukkan nama halaman dan status online/offline.
- **Perbarui data** meminta ulang data sensor, perintah, dan pesan.
- Tampilan responsif menyesuaikan layar desktop dan ponsel.

Tidak semua data yang dikirim firmware memiliki widget tersendiri. Jarak ultrasonik, status lampu lalu lintas, dan status palang tetap dikirim ke API/MongoDB, tetapi belum ditampilkan sebagai kartu khusus pada dashboard saat ini.

## Stack

- Node.js 20.9 atau lebih baru (proyek ini memakai Node.js 22).
- Next.js, React, Tailwind CSS, MongoDB Node.js Driver, Recharts, dan NVIDIA NIM untuk chatbot.
- MongoDB database: `smart_home_city`.
- Collections: `sensor_readings` (capped, maksimum 50 dokumen) dan `device_commands`. Jika `sensor_readings` sudah ada sebagai collection biasa, data lamanya dipertahankan dan aplikasi menggunakan `sensor_readings_latest50` sebagai collection capped.

## Skema MongoDB

`sensor_readings` memvalidasi setiap dokumen dengan skema MongoDB:

```json
{
  "deviceId": "esp32-smart-city",
  "recordedAt": "Date (waktu diterima server)",
  "temperatureC": "number | null",
  "humidityPercent": "number | null",
  "distanceCm": "number | null",
  "parking": {
    "slotAOccupied": "boolean",
    "slotBOccupied": "boolean",
    "slotCOccupied": "boolean",
    "occupied": "number",
    "available": "number"
  },
  "pirDetected": "boolean",
  "ldrRaw": "number",
  "streetLightOn": "boolean",
  "temperatureServoOpen": "boolean (opsional untuk firmware lama)",
  "waterLevelRaw": "number",
  "floodDetected": "boolean",
  "vibrationDetected": "boolean",
  "rgbLedOn": "boolean",
  "trafficLight": "green | yellow | red",
  "entryGateOpen": "boolean",
  "exitGateOpen": "boolean"
}
```

`device_commands` menyimpan status LED RGB dan override opsional `streetLightOverride` serta `temperatureServoOverride`. Nilai override `true`/`false` memilih kontrol web; `null` mengembalikan perangkat ke mode otomatis sensor.

Pada dashboard, label Slot A dan Slot B ditukar: `parking.slotAOccupied` (IR A/GPIO36) ditampilkan sebagai Slot B, sedangkan `parking.slotBOccupied` (IR B/GPIO39) ditampilkan sebagai Slot A. Data mentah API dan jumlah total slot tidak berubah.

## Menjalankan lokal

1. Pastikan MongoDB berjalan dan dapat diakses.
2. Salin `.env.example` menjadi `.env.local`; sesuaikan `MONGODB_URI` dan `MONGODB_DB` bila perlu.
3. Instal dependensi dengan `npm install`.
4. Siapkan collections dengan `npm run db:setup`. Aplikasi juga membuat collections saat pertama kali menerima request.
5. Jalankan `npm run dev`, lalu buka `http://localhost:3000` pada komputer server. Untuk ESP32 lokal, gunakan IPv4 komputer tersebut (lihat `ipconfig`) dan port `3000`.

Di firmware untuk penggunaan lokal, isi `WIFI_SSID` dan `WIFI_PASSWORD`, lalu ubah alamat `192.168.1.10` pada `API_READINGS_URL` dan `API_COMMANDS_URL` menjadi IPv4 komputer Anda. ESP32 dan komputer harus berada pada Wi-Fi/jaringan yang sama. Firewall Windows mungkin perlu mengizinkan koneksi masuk untuk Node.js pada jaringan privat.

Collection pembacaan aktif adalah capped collection MongoDB dengan `max: 50`. Saat pembacaan baru masuk, MongoDB otomatis menimpa/mengeluarkan dokumen paling lama; tidak ada proses pembersihan berkala atau risiko penumpukan melewati batas 50. Data diurutkan menurut waktu penerimaan server.

## API

- `POST /api/readings` — menerima satu pembacaan sensor dari ESP32.
- `GET /api/readings?limit=50` — membaca paling banyak 50 data terbaru.
- `GET /api/commands` — membaca status LED dan override perangkat.
- `POST /api/commands` menerima satu atau beberapa field: `rgbLedOn` (`boolean`), `streetLightOverride` (`boolean | null`), dan `temperatureServoOverride` (`boolean | null`).
- `GET /api/messages` — mengambil inbox dan jumlah pesan belum dibaca.
- `POST /api/messages` dengan `{"ids":["<message-id>"]}` atau `{"all":true}` — menandai pesan sudah dibaca.
- `POST /api/chat` — mengambil snapshot sensor langsung dari MongoDB lalu mengirim pertanyaan dan snapshot tersebut ke NVIDIA NIM.

Pesan dibuat saat sensor berubah menjadi kondisi banjir, getaran, gerakan, suhu di atas 28 °C, atau parkir penuh. Dashboard memeriksa data dan badge pesan setiap 1,5 detik; membuka pesan menandainya sudah dibaca dan mengurangi angka badge.

Dashboard memeriksa API setiap 1,5 detik. ESP32 mengirim telemetri setiap 1 detik dan memeriksa perintah setiap 250 ms melalui task jaringan prioritas tinggi, terpisah dari pengiriman telemetri agar pengiriman data sensor tidak menahan kontrol web. Palang PIR dan ultrasonik kembali tertutup 3 detik setelah pemicunya berhenti. Override web untuk lampu jalan atau servo suhu diterapkan segera setelah perintah diterima; mode otomatis sensor tetap tersedia. Polling ini juga kompatibel dengan deployment serverless Vercel tanpa koneksi WebSocket permanen.

## Chatbot NVIDIA NIM

Chatbot mengirim permintaan langsung ke [NVIDIA NIM Chat Completions API](https://docs.api.nvidia.com/nim/reference/llm-apis). Model dibatasi ke daftar chat **Free Endpoint** yang diverifikasi dari katalog NVIDIA: `nvidia/nemotron-3.5-lightning-30b-a3b` (default), `nvidia/nemotron-3.5-bolt-e4b`, `nvidia/nemotron-3-ultra-550b-a55b`, `stepfun-ai/step-5-preview`, dan `z-ai/glm-5.3-flash`. Pilih dengan `NVIDIA_NIM_MODEL`. Label “Free Endpoint” adalah filter katalog; model ID NIM tidak memakai akhiran `/free`.

Atur hingga lima API key secara berurutan. Jika NVIDIA NIM menolak key (401/403) atau melaporkan kuota/rate limit (429 atau kode limit yang dikenali), server mencoba key berikutnya untuk permintaan yang sama. Setiap permintaan baru mulai lagi dari key pertama; jika batas habis, key tersebut akan dilewati lagi pada permintaan berikutnya. Key yang kosong dilewati.

Di Vercel → Project → Settings → Environment Variables, tambahkan `NVIDIA_NIM_API_KEY_1` hingga `NVIDIA_NIM_API_KEY_5` sesuai key yang dimiliki, dan `NVIDIA_NIM_MODEL` (opsional). Jangan tambahkan prefix `NEXT_PUBLIC_`. Pilih environment yang dipakai, simpan, lalu redeploy. Untuk lokal, isi variabel yang sama pada `.env.local` dan restart server. File `.env.example` menunjukkan nama semua variabel; tempel key hanya ke environment privat, bukan ke Git, browser, firmware, atau chat.

Key tambahan tidak menjamin penambahan kuota: NVIDIA dapat menerapkan limit pada akun/proyek yang sama, sehingga semua key tetap bisa terkena batas bersama. Gunakan hanya key yang diizinkan untuk proyek/akun tersebut.

Key hanya dibaca server-side; tidak pernah dikirim ke browser. Setiap pertanyaan mengambil lima pembacaan ESP32 terbaru langsung dari MongoDB sebelum prompt dikirim. Prompt juga menjelaskan semua variabel, pin, logika sensor, dan ambang firmware.

Custom system prompt chatbot dapat diedit di `src/lib/chat-prompt.ts`. Instruksi format jawabannya menggunakan Markdown; dashboard merender heading, teks tebal, daftar, tabel, dan blok kode dengan styling khusus.

API tidak memakai autentikasi sesuai kebutuhan proyek ini. Endpoint yang dipublikasikan dapat menerima data/perintah dari siapa saja; gunakan hanya pada jaringan/lingkungan yang sesuai.

## Deploy ke Vercel

1. Untuk deployment baru atau pembaruan, push folder proyek ke repository Git dan impor/pilih repository tersebut di Vercel.
2. Siapkan MongoDB yang bisa diakses publik dari Vercel, misalnya MongoDB Atlas. URI `mongodb://localhost:27017` hanya berlaku di komputer lokal dan **tidak dapat dipakai dari Vercel**.
3. Isi Vercel Project → Settings → Environment Variables:
   - `MONGODB_URI`: connection string Atlas.
   - `MONGODB_DB`: `smart_home_city`.
   - `NVIDIA_NIM_API_KEY_1` sampai `NVIDIA_NIM_API_KEY_5`: API key NVIDIA NIM (server-side; isi key yang dimiliki, tanpa prefix `NEXT_PUBLIC_`).
   - `NVIDIA_NIM_MODEL`: ID model NVIDIA NIM dari daftar Free Endpoint yang diizinkan; default `nvidia/nemotron-3.5-lightning-30b-a3b`.
4. Pastikan akses jaringan/IP Vercel ke MongoDB diizinkan, lalu deploy. Collection capped dibuat otomatis pada request pertama.
5. Pastikan `API_READINGS_URL` dan `API_COMMANDS_URL` pada firmware menunjuk ke domain deployment HTTPS, lalu set `API_USE_HTTPS` ke `1`. Firmware saat ini dikonfigurasi ke `https://smarcityandhome.vercel.app`.

## Menghubungkan ESP32

Sketch firmware ada di `Code_iot_esp_32_Update/Code_iot_esp_32_Update.ino`. Sebelum upload, salin `Code_iot_esp_32_Update/esp32_secrets.example.h` menjadi `Code_iot_esp_32_Update/esp32_secrets.h` dan isi kredensial Wi-Fi. File rahasia tersebut diabaikan Git.

1. Pasang library ArduinoJson, DHT sensor library, LiquidCrystal I2C, dan ESP32Servo di Arduino IDE.
2. Salin file contoh secrets ke `esp32_secrets.h` di folder sketch dan isi nama Wi-Fi 2,4 GHz serta password.
3. Buka `Code_iot_esp_32_Update/Code_iot_esp_32_Update.ino` di Arduino IDE.
4. Pilih board dan port ESP32, lalu upload.
5. Pastikan ESP32 tersambung ke internet. Mode kontrol lampu jalan dan servo suhu dapat dipilih dari menu Kontrol ESP32 di dashboard.

Untuk mengganti Wi-Fi, edit nilai `WIFI_SSID` dan `WIFI_PASSWORD` di `esp32_secrets.h`.

Firmware mempertahankan sensor yang sudah ada pada sketch awal (ultrasonik, PIR, IR parkir, LDR, water-level, SW-420, DHT11, lampu lalu lintas, servo, buzzer, dan LCD) serta mengirim nilainya ke API. Servo palang kembali ke posisi awal 3 detik setelah pemicu sensor berhenti; servo suhu dan lampu jalan memiliki mode otomatis serta override web.

ESP32 klasik hanya mendukung Wi-Fi 2,4 GHz. Jika jaringan yang dipilih hanya berjalan pada 5 GHz, aktifkan/pilih SSID 2,4 GHz dari router atau hotspot; jaringan 2,4 GHz dan 5 GHz boleh memakai nama berbeda.

> Mode HTTPS firmware saat ini memakai `WiFiClientSecure::setInsecure()` untuk memudahkan pengujian. Sebelum penggunaan produksi, sebaiknya validasi sertifikat server menggunakan `setCACert()` dan root CA yang sesuai.
