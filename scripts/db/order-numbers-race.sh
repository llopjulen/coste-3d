#!/usr/bin/env bash
# ==================================================================
# ¿Puede next_order_number(taller) repetir un número si lo piden a la vez?
#
# pgTAP corre en una sola sesión y no puede probar concurrencia. Esto
# abre N conexiones a la vez, repartidas entre DOS personas del mismo
# taller (jefe y encargado, como dos ordenadores del taller), pide un
# número en cada una y comprueba que salen 1..N sin repetidos.
# (Modo taller, 2026-11-06: el contador es del taller, no de la persona.)
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
OWNER="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
MANAGER="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
WS="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
OUT="$(mktemp)"

# El taller primero (su jefe tiene on delete restrict), luego las cuentas.
cleanup() {
  psql "$DB" -q -c "delete from public.workspaces where id = '$WS'" \
                -c "delete from auth.users where id in ('$OWNER', '$MANAGER')" >/dev/null 2>&1 || true
  rm -f "$OUT"
}
trap cleanup EXIT

psql "$DB" -q -v ON_ERROR_STOP=1 \
  -c "insert into auth.users (id, email) values ('$OWNER', 'race-a@test.local'), ('$MANAGER', 'race-m@test.local') on conflict do nothing" \
  -c "insert into public.workspaces (id, name, owner_id) values ('$WS', 'Carrera', '$OWNER')" \
  -c "insert into public.memberships (workspace_id, user_id, role) values ('$WS', '$OWNER', 'owner'), ('$WS', '$MANAGER', 'manager')" >/dev/null

for i in $(seq "$N"); do
  if [ $((i % 2)) -eq 0 ]; then WHO="$OWNER"; else WHO="$MANAGER"; fi
  psql "$DB" -X -q -t -A >>"$OUT" <<SQL &
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"$WHO","role":"authenticated"}';
select public.next_order_number('$WS');
commit;
SQL
done
wait

got=$(grep -cE '^[0-9]+$' "$OUT" || true)
unique=$(grep -E '^[0-9]+$' "$OUT" | sort -n | uniq | wc -l | tr -d ' ')
max=$(grep -E '^[0-9]+$' "$OUT" | sort -n | tail -1)

if [ "$got" = "$N" ] && [ "$unique" = "$N" ] && [ "$max" = "$N" ]; then
  echo "ok - $N peticiones simultáneas de dos personas del taller, $N números distintos (1..$N)"
else
  echo "not ok - $N peticiones: $got respuestas, $unique distintas, máximo $max"
  grep -E '^[0-9]+$' "$OUT" | sort -n | uniq -d | sed 's/^/  repetido: /'
  exit 1
fi
