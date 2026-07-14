# Emniyet Spor Salonu

Emniyet Spor Salonu için açık temalı kurs ve havuz operasyon pilotu. Uygulama; personel girişi, kurs planlama, kursiyer kaydı, kontenjan ve bekleme listesi, yoklama, kulvar planı, manuel tahsilat ve tesis tarafından yapılandırılan havuz kontrollerini tek akışta toplar.

Zenit GymOps altyapısı tarafından desteklenir; müşteri markası arayüzde birincildir.

## Teknoloji

- Vue 3, Vite, TypeScript, Vue Router ve Pinia
- Tailwind CSS'in Vite build entegrasyonu ve yerel CSS tasarım tokenları
- Fastify 5 JSON API ve production SPA sunucusu
- PostgreSQL 17 ve Drizzle ORM
- Argon2id parola hash'i, PostgreSQL üzerinde sunucu oturumu ve HttpOnly cookie
- Tek uygulama container'ı + ayrı PostgreSQL kaynağı

## Kapsam sınırı

Bu pilot yalnız personel tarafından kullanılan salon üyeliği, kurs ve havuz operasyonlarını kapsar. QR, turnike, Supabase, online ödeme, üye mobil uygulaması, gerçek mesaj gönderimi, yapay zekâ ve resmi kurum amblem/işaretleri yoktur.

## Yerel kurulum

Gereksinimler: Node.js 22+, npm 10+, Docker Desktop.

```powershell
Copy-Item .env.example .env
docker compose -f docker-compose.dev.yml up -d postgres
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Web: `http://localhost:5173`  
API: `http://localhost:3000`  
Canlılık: `http://localhost:3000/health/live`  
Hazırlık: `http://localhost:3000/health/ready`

`.env.example` yalnız yerel, kurgu değerler içerir. Gerçek şifre ve bağlantı değerlerini Git'e eklemeyin.

## Demo kullanıcıları

Seed işlemi yerel geliştirme için kurgu kullanıcılar oluşturur. Seed çalışırken `SEED_PASSWORD` verilirse o geçici değer kullanılır. Verilmezse yalnız yerel kullanım için `Pilot!2026` kurgu varsayılanı kullanılır. Production'da `SEED_DEMO_DATA=true` açıkça verilmedikçe seed çalışmaz.

İlk production yöneticisi için:

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL='gecici-admin@example.local'
$env:BOOTSTRAP_ADMIN_PASSWORD='<uzun-gecici-parola>'
npm run bootstrap:admin
```

Bu değişkenleri ilk girişten sonra kaldırın/döndürün. Komut parola veya bağlantı dizesini loglamaz.

## Komutlar

| Komut | Amaç |
|---|---|
| `npm run dev` | Vite ve Fastify geliştirme sunucularını birlikte açar |
| `npm run lint` | ESLint kontrolü |
| `npm run typecheck` | Vue ve Node TypeScript kontrolü |
| `npm run build` | Web ve sunucu production build'i |
| `npm run db:generate` | Drizzle şemasından yeni migration üretir |
| `npm run db:migrate` | Git'teki migration'ları kontrollü uygular |
| `npm run db:seed` | Kurgu pilot verisini idempotent yükler |
| `npm run db:check` | DB bağlantısı ve beklenen tabloları kontrol eder |
| `npm run smoke:api` | Oturum, RBAC ve kritik operasyon smoke akışını çalıştırır |
| `npm run verify` | Lint + typecheck + production build |
| `npm test` | Lint + typecheck yerel kontrolü |
| `npm start` | Derlenmiş tek HTTP sunucusunu başlatır |

## Mimari

```text
src/       Vue istemci ve açık tema bileşenleri
server/    Fastify, auth/RBAC, API ve production static serving
shared/    İstemci/sunucu paylaşılan sözleşmeler
drizzle/   Versiyonlanan ve gözden geçirilen SQL migration'ları
scripts/   Seed, bootstrap, DB check ve smoke runner
```

Tarayıcı PostgreSQL'e doğrudan bağlanmaz. Tüm sorgular `/api` üzerinden geçer. Organizasyon kapsamı istek gövdesinden değil doğrulanmış oturumdan alınır. Kritik yazımlar audit olayına dönüşür. Para değerleri integer kuruş olarak saklanır. Kulvar çakışmaları PostgreSQL exclusion constraint ile; yoklama tekrarları unique constraint + upsert ile korunur.

## Migration disiplini

1. `server/db/schema.ts` değişikliğini yapın.
2. `npm run db:generate` çalıştırın.
3. Üretilen SQL'i, constraint ve indeksleri inceleyin.
4. Temiz bir yerel PostgreSQL üzerinde `npm run db:migrate` çalıştırın.
5. Aynı migration'ı production'da yalnız kontrollü pre-deploy adımında bir kez çalıştırın.

Uygulama başlangıç komutu migration çalıştırmaz. Birden fazla replica'nın eşzamanlı migration çalıştırmasına izin vermeyin. Schema push production mekanizması değildir.

## Coolify hazırlığı

1. Coolify'de private PostgreSQL kaynağı oluşturun; DB portunu internete açmayın.
2. Git reposundan Dockerfile build-pack kullanan uygulama oluşturun.
3. Exposed port: `3000`.
4. Health path: `/health/ready`, beklenen durum `200`.
5. Aşağıdaki runtime environment değişkenlerini tanımlayın:

```text
NODE_ENV=production
PORT=3000
DATABASE_URL=<Coolify internal PostgreSQL URL>
APP_ORIGIN=https://<nihai-domain>
TRUST_PROXY=true
SESSION_COOKIE_NAME=emniyet_session
SESSION_TTL_HOURS=12
LOG_LEVEL=info
```

6. Pre-deployment komutunu kontrollü olarak `npm run db:migrate` yapın. Uygulama replica sayısını artırmadan migration'ın tek yürütücüde tamamlandığını doğrulayın.
7. Geçici bootstrap admin değişkenleriyle yöneticiyi bir kez oluşturun; sonra değerleri kaldırın/döndürün.
8. Final HTTPS origin üzerinden login, `/health/live` ve `/health/ready` doğrulayın.
9. PostgreSQL backup politikasını Coolify tarafında etkinleştirin.

Uygulama rollback'i database rollback varsaymaz. Yıkıcı migration ayrıca onaylı backup/rollback planı gerektirir.

## Güvenlik notları

- Session cookie HttpOnly, SameSite=Lax ve production'da Secure'dur.
- Sunucuda yalnız session token SHA-256 hash'i saklanır.
- Login oran sınırı ve genel güvenlik header'ları aktiftir.
- State-changing production isteklerinde tam `APP_ORIGIN` eşleşmesi aranır.
- Bootstrap parolası, session token ve `DATABASE_URL` loglanmaz.
- Seed verileri tamamen kurgusaldır; kimlik numarası veya tıbbi tanı toplanmaz.

## Son doğrulama

```powershell
npm run verify
npm run db:migrate
npm run db:seed
npm run db:seed
npm run smoke:api
docker build -t emniyet-spor-salonu:local .
```

Gerçek Coolify deploy bu repository hazırlığının parçası değildir; dış deploy yapılmadan başarı iddiasında bulunulmaz.
