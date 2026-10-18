# Golden League · web con panel de administración

Ya NO hace falta tocar data.json: se edita desde la propia web (pestaña ⚙ Admin) con formularios.

## Archivos
- `index.html` — la web y el panel de administración
- `api/data.js` — guarda y lee los datos (función de Vercel)
- `data.json` — datos de ejemplo iniciales (solo se usan hasta que guardes algo)
- `excel_a_json.py` — opcional (importar desde el Excel)

## Puesta en marcha (una sola vez)
1. **Sube los cambios a GitHub:** en tu repositorio, *Add file → Upload files*, arrastra `index.html` (reemplaza al antiguo) y la carpeta `api`. *Commit changes*.
2. **Crea la base de datos (gratis):** en Vercel abre tu proyecto → pestaña **Storage** → *Create Database* → **Upstash (Redis)** → plan Free → *Create* → conéctala al proyecto (todos los entornos).
3. **Pon tu clave de administrador:** proyecto → *Settings → Environment Variables* → nombre `ADMIN_PASSWORD`, valor la clave que quieras → *Save*.
4. **Redeploy:** pestaña *Deployments* → los tres puntos del último → *Redeploy*.

## Uso
Abre tu web → **⚙ Admin** → escribe la clave. Allí puedes: añadir jugadores, crear partidas (kills y muertes de cada jugador), borrarlas, cerrar temporada (el palmarés se rellena solo), cambiar los puntos y empezar de cero.
Los cambios se ven al momento para todo el que abra la web. Solo quien tenga la clave puede editar.

## Novedades del panel Admin
Editar partidas ya guardadas · bonus y sanciones de puntos · calendario de próximas partidas · noticias (salen en Clasificación) · palmarés manual · añadir varios jugadores a la vez · nombre de la liga y partidas mínimas · copia de seguridad y restaurar · revisión automática de datos.
Nuevas estadísticas públicas: pestañas **Análisis** y **Calendario**, rachas, puesto medio, peor puesto, estadísticas por mapa, por temporada y distribución de puestos en cada jugador.

## Equipos y dos competiciones
- Competiciones: **Golden League** (campeonato de jugadores y de equipos) y **Golden Champions** (cada temporada, los jugadores que tú elijas; el botón "Marcar los 4 primeros de la Golden League" ayuda).
- La barra "Competición" (arriba) filtra TODAS las estadísticas: Todas / Golden League / Golden Champions.
- ⚙ Admin → **Equipos** (crear), **Plantillas** (qué jugador está en cada equipo cada temporada), **Jugadores por competición** (quién juega qué), y al crear una partida eliges la competición.
- Palmarés separado por competición, con campeón de jugadores y de equipos; las fichas de jugador y de equipo muestran sus títulos.
- Para actualizar: sube de nuevo solo `index.html` a GitHub (los datos guardados se conservan).

## 🏅 Golden Awards (premios de cada temporada)
- Nueva pestaña pública **Golden Awards**: premios por temporada (filtrable) y medalleros de jugadores y equipos. Respeta el filtro de competición.
- ⚙ Admin → **Golden Awards**: **crear premio propio** (nombre, icono y si es **de jugador o de equipo**), renombrarlo/borrarlo y **entregarlo** (premio + temporada + competición + ganador). El selector de ganador muestra jugadores o equipos según el tipo del premio.
- Los premios aparecen en el **palmarés** de cada jugador (pestaña Jugador) y de cada equipo (pestaña Equipos), con las temporadas en que los ganó.
- **Golden MVP** y **Golden Killer** vienen creados y se rellenan solos desde el Palmarés al cerrar temporada.
- Los datos nuevos se guardan en `premios` y `galardones` dentro de los mismos datos (no hay que tocar `api/data.js`). Para actualizar, sube solo `index.html`.

### Competiciones propias, premios generales e imágenes
- Al entregar un premio puedes elegir **Golden League, Golden Champions, una competición tuya o «General» (vale para todas)**.
- Botón **➕ Nueva competición** junto al selector: nombre, icono (emoji) e imagen propia. Se gestionan (renombrar, icono, imagen, borrar) en ⚙ Admin → Golden Awards → Mis competiciones.
- Los **premios** también admiten icono (emoji) o **imagen subida**.
- Las imágenes se reducen automáticamente a 128 px y se guardan dentro de los datos (unos pocos KB cada una), así van incluidas en la copia de seguridad.
- Las competiciones propias sirven para clasificar premios; las partidas/clasificaciones siguen siendo de Golden League y Golden Champions.
