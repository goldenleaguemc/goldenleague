# Golden League · web (Vercel)

Web estática (sin build, sin dependencias). Archivos: `index.html` (la página), `data.json` (los datos), `excel_a_json.py` (convierte tu Excel en data.json).

## Subirla a Vercel (la primera vez)
**Opción A — GitHub (recomendada, se actualiza sola):**
1. Crea un repositorio en github.com y sube estos 3 archivos (botón *Add file → Upload files*).
2. Entra en vercel.com → *Sign up* con tu cuenta de GitHub → *Add New… → Project* → elige el repositorio → *Deploy*. (Framework: "Other"; no cambies nada más.)
3. En ~30 s tendrás un enlace tipo `golden-league.vercel.app`. Puedes cambiarlo en *Settings → Domains*.

**Opción B — sin GitHub:** instala Node.js y en esta carpeta ejecuta `npx vercel` (te pide login y 4 preguntas; responde Enter). Para publicar cambios: `npx vercel --prod`.

## Actualizar las estadísticas
1. Rellena `Golden_League_Borrush.xlsx` (hoja Partidas, Palmarés…).
2. Ejecuta `python excel_a_json.py Golden_League_Borrush.xlsx` (una vez: `pip install openpyxl`). Genera un `data.json` nuevo.
3. Sube el `data.json` a GitHub (o `npx vercel --prod`). Vercel republica solo.

## Probarla en tu PC
No abras el HTML con doble clic (el navegador bloquea `data.json`). Usa: `python -m http.server` y abre http://localhost:8000

## Reglas de cálculo (iguales que el Excel)
Puesto por kills (desempate: menos muertes); puntos según la tabla de `data.json` (`puntos`, de 1º a 16º); clasificación por puntos → kills → victorias.
