#!/usr/bin/env bash
# ==================================================================
# ¿Puede next_order_number() repetir un número si lo piden a la vez?
#
# pgTAP corre en una sola sesión y no puede probar concurrencia. Esto
# abre N conexiones a la vez, cada una como el mismo usuario de prueba,
# pide un número en cada una y comprueba que salen 1..N sin repetidos.
#
# Por qué importa: si la función lee el último número y luego escribe
# el siguiente en dos pasos, dos peticiones simultáneas leen el mismo
# valor y sacan el mismo número (condición de carrera). Con una sola
# sentencia (`insert … on conflict do update … returning`) Postgres
# bloquea la fila del contador y las pone en fila.
#
# Uso (con `supabase start` en marcha):
#   bash scripts/db/order-numbers-race.sh
#   bash scripts/db/order-numbers-race.sh "postgresql://…"   # otra base
# Deja la base como estaba: borra el usuario de prueba al acabar.
# ==================================================================
set -euo pipefail
DB="${1:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
N="${N:-40}"
USER_ID="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
OUT="$(mktemp)"

cleanup() {
  psql "$DB" -q -c "delete from auth.users where id = '$USER_ID'" >/dev/null 2>&1 || true
  rm -f "$OUT"
}
trap cleanup EXIT

psql "$DB" -q -c "insert into auth.users (id, email) values ('$USER_ID', 'race@test.local') on conflict do nothing" >/dev/null

for _ in $(seq "$N"); do
  psql "$DB" -X -q -t -A >>"$OUT" <<SQL &
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"$USER_ID","role":"authenticated"}';
select public.next_order_number();
commit;
SQL
done
wait

got=$(grep -cE '^[0-9]+$' "$OUT" || true)
unique=$(grep -E '^[0-9]+$' "$OUT" | sort -n | uniq | wc -l | tr -d ' ')
max=$(grep -E '^[0-9]+$' "$OUT" | sort -n | tail -1)

if [ "$got" = "$N" ] && [ "$unique" = "$N" ] && [ "$max" = "$N" ]; then
  echo "ok - $N peticiones simultáneas, $N números distintos (1..$N)"
else
  echo "not ok - $N peticiones: $got respuestas, $unique distintas, máximo $max"
  grep -E '^[0-9]+$' "$OUT" | sort -n | uniq -d | sed 's/^/  repetido: /'
  exit 1
fi
