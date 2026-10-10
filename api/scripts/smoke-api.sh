#!/usr/bin/env bash
# Uji end-to-end API antrian barbershop (smoke test 76 asersi).
#
# Prasyarat: API hidup DAN database dalam kondisi hasil seed
# (5 layanan, 3 kapster, 5 antrian untuk hari ini) — jalankan `make seed` dulu kalau ragu.
# Script ini membuat lalu menghapus sendiri data ujinya (kecuali beberapa baris
# percobaan yang sengaja dibiarkan agar jumlah baris tetap konsisten).
#
# Pakai:
#   ./scripts/smoke-api.sh                                  # API lokal (port 3210)
#   BASE=http://localhost/api ./scripts/smoke-api.sh         # lewat Nginx / docker compose
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:3210/api}"
# Flag tambahan untuk curl, mis. CURL_EXTRA=-k saat menembak TLS self-signed
CURL_EXTRA="${CURL_EXTRA:-}"
JQ="node $(dirname "$0")/json-get.js"
BODY=/tmp/barbershop-body.json
PAYLOAD=/tmp/barbershop-payload.json
PASS=0; FAIL=0

check() {
  if [[ "$2" == "$3" ]]; then printf '  PASS %-48s %s\n' "$1" "$3"; PASS=$((PASS+1));
  else printf '  FAIL %-48s harap [%s], dapat [%s]\n' "$1" "$2" "$3"; FAIL=$((FAIL+1)); fi
}
jqv() { $JQ "$BODY" "$1"; }
send() { # send <method> <path> ; body JSON dibaca dari $PAYLOAD bila ada
  local m="$1" p="$2"
  if [[ -s "$PAYLOAD" ]]; then
    curl $CURL_EXTRA -s -o "$BODY" -w '%{http_code}' -X "$m" "$BASE$p" -H 'Content-Type: application/json' --data-binary "@$PAYLOAD"
  else
    curl $CURL_EXTRA -s -o "$BODY" -w '%{http_code}' -X "$m" "$BASE$p"
  fi
}
get()  { : > "$PAYLOAD"; send GET "$1"; }
post() { printf '%s' "$2" > "$PAYLOAD"; send POST "$1"; }
patch(){ printf '%s' "$2" > "$PAYLOAD"; send PATCH "$1"; }
del()  { : > "$PAYLOAD"; send DELETE "$1"; }
body() { head -c 400 "$BODY"; }
id_at() { # id_at <path> <index>
  get "$1" >/dev/null
  node -e "
    const fs=require('fs');
    const d=JSON.parse(fs.readFileSync('$BODY','utf8').trim() || 'null');
    if(!Array.isArray(d)) { console.error('BUKAN ARRAY: '+JSON.stringify(d).slice(0,200)); process.exit(2); }
    const row=d[$2]; if(!row){ console.error('INDEX $2 KOSONG'); process.exit(3); }
    process.stdout.write(String(row.id));
  "
}

echo "== Kesehatan =="
check "GET /health" 200 "$(get /health)"
check "  db" up "$(jqv '.db')"

echo "== Master data =="
check "GET /services" 200 "$(get /services)"
check "  layanan seed" 5 "$(jqv '.length')"
check "GET /barbers" 200 "$(get /barbers)"
check "  kapster seed" 3 "$(jqv '.length')"

echo "== Papan antrian (kondisi seed) =="
check "GET /queues" 200 "$(get /queues)"
check "  tanggal" "$(TZ=Asia/Jakarta date +%F)" "$(jqv '.date')"
check "  total" 5 "$(jqv '.summary.total')"
check "  menunggu" 2 "$(jqv '.summary.waiting')"
check "  dilayani" 1 "$(jqv '.summary.inProgress')"
check "  selesai" 2 "$(jqv '.summary.done')"
check "  rata-rata menit" 25 "$(jqv '.summary.avgServiceMinutes')"
check "  nomor terakhir" 5 "$(jqv '.summary.lastNumber')"

echo "== Ambil id dari endpoint =="
SVC=$(id_at '/services?activeOnly=true' 0); BAR=$(id_at '/barbers?activeOnly=true' 1); BAR2=$(id_at '/barbers?activeOnly=true' 0)
check "id layanan" true "$([[ "$SVC" =~ ^[0-9]+$ ]] && echo true || echo false)"
check "id kapster" true "$([[ "$BAR" =~ ^[0-9]+$ ]] && echo true || echo false)"
check "id kapster kedua" true "$([[ "$BAR2" =~ ^[0-9]+$ ]] && echo true || echo false)"

echo "== Nomor urut harian =="
check "POST /queues" 201 "$(post /queues '{"customerName":"Uji Satu","serviceId":'"$SVC"',"customerPhone":"0812-0000-9999"}')"
QID=$(jqv '.id')
if [[ -z "$QID" ]]; then echo "    body: $(body)"; fi
check "  kode" A-006 "$(jqv '.code')"
check "  status awal" WAITING "$(jqv '.status')"
check "  layanan tersambung" "$SVC" "$(jqv '.service.id')"
check "  barber null" true "$(jqv '.barber === null')"

echo "== Validasi input =="
check "tanpa nama -> 400" 400 "$(post /queues '{"serviceId":'"$SVC"'}')"
check "  pesan menyebut nama" true "$(jqv ".message.join(' ').includes('Nama pelanggan')")"
check "nama 1 karakter -> 400" 400 "$(post /queues '{"customerName":"A","serviceId":'"$SVC"'}')"
check "layanan tidak ada -> 404" 404 "$(post /queues '{"customerName":"Uji Layanan","serviceId":999999}')"
check "tanggal ngawur -> 400" 400 "$(get '/queues?date=10-10-2026')"
check "status ngawur -> 400" 400 "$(get '/queues?status=SELESAI')"
check "layanan duplikat -> 409" 409 "$(post /services '{"name":"Potong Rambut"}')"
check "kapster 1 karakter -> 400" 400 "$(post /barbers '{"name":"B"}')"
check "durasi 1 menit -> 400" 400 "$(post /services '{"name":"Uji Durasi","durationMin":1}')"

echo "== Alur status =="
check "start tanpa kapster -> 400" 400 "$(post "/queues/$QID/start" '{}')"
check "  pesan menyebut kapster" true "$(jqv ".message.includes('Pilih kapster')")"
check "start dengan kapster" 201 "$(post "/queues/$QID/start" '{"barberId":'"$BAR"'}')"
check "  status" IN_PROGRESS "$(jqv '.status')"
check "  startedAt" true "$(jqv '.startedAt !== null')"
check "  kapster terpasang" "$BAR" "$(jqv '.barber.id')"
check "ubah saat dilayani -> 409" 409 "$(patch "/queues/$QID" '{"customerName":"Ganti Nama"}')"
check "finish" 201 "$(post "/queues/$QID/finish" '')"
check "  status" DONE "$(jqv '.status')"
check "  finishedAt" true "$(jqv '.finishedAt !== null')"
check "finish dua kali -> 409" 409 "$(post "/queues/$QID/finish" '')"
check "batal setelah selesai -> 409" 409 "$(post "/queues/$QID/cancel" '')"

echo "== Satu kapster satu antrian aktif =="
check "buat antrian dua" 201 "$(post /queues '{"customerName":"Uji Dua","serviceId":'"$SVC"',"barberId":'"$BAR"'}')"
Q2=$(jqv '.id')
check "buat antrian tiga" 201 "$(post /queues '{"customerName":"Uji Tiga","serviceId":'"$SVC"',"barberId":'"$BAR"'}')"
Q3=$(jqv '.id')
check "start antrian dua" 201 "$(post "/queues/$Q2/start" '{}')"
check "  status" IN_PROGRESS "$(jqv '.status')"
check "start kapster sama -> 409" 409 "$(post "/queues/$Q3/start" '{}')"
check "  pesan menyebut kode yang dilayani" true "$(jqv ".message.toString().includes('sedang melayani')")"
check "batal saat dilayani" 201 "$(post "/queues/$Q2/cancel" '')"
check "  status" CANCELLED "$(jqv '.status')"
check "start setelah kapster bebas" 201 "$(post "/queues/$Q3/start" '{}')"
check "  pakai kapster yang sama" "$BAR" "$(jqv '.barber.id')"
check "finish bersih-bersih" 201 "$(post "/queues/$Q3/finish" '')"

echo "== Master data =="
check "hapus layanan terpakai -> 409" 409 "$(del "/services/$SVC")"
check "  pesan menyebut nonaktifkan" true "$(jqv ".message.toString().includes('Nonaktifkan')")"
check "buat layanan" 201 "$(post /services '{"name":"Layanan Sementara","durationMin":15,"price":10000}')"
NEWSVC=$(jqv '.id')
check "PATCH layanan" 200 "$(patch "/services/$NEWSVC" '{"price":12000,"active":false}')"
check "  harga" 12000 "$(jqv '.price')"
check "  aktif" false "$(jqv '.active')"
check "hapus layanan bebas" 200 "$(del "/services/$NEWSVC")"
check "buat kapster" 201 "$(post /barbers '{"name":"Kapster Sementara"}')"
NEWBAR=$(jqv '.id')
check "hapus kapster bebas" 200 "$(del "/barbers/$NEWBAR")"
check "hapus kapster terpakai -> 409" 409 "$(del "/barbers/$BAR2")"
check "antrian tidak ada -> 404" 404 "$(get /queues/999999)"
check "layanan tidak ada -> 404" 404 "$(get /services/999999)"

echo "== Filter & pencarian =="
check "filter DONE" 200 "$(get '/queues?status=DONE')"
check "  ada 4" 4 "$(jqv '.items.length')"
check "cari 'Uji'" 200 "$(get '/queues?q=Uji')"
check "  ketemu 3" 3 "$(jqv '.items.length')"
check "cari 'A-006'" 200 "$(get '/queues?q=A-006')"
check "  ketemu 1" 1 "$(jqv '.items.length')"
check "filter kapster" 200 "$(get "/queues?barberId=$BAR")"
check "  ada 4 (termasuk yang dibatalkan)" 4 "$(jqv '.items.length')"
check "summary setelah alur" 4 "$(get /queues >/dev/null; jqv '.summary.done')"

echo "== Bersihkan antrian uji =="
check "hapus antrian uji" 200 "$(del "/queues/$QID")"

echo
printf 'Hasil: %d PASS, %d FAIL\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
