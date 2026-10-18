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
Abre tu web → **⚙ Admin** → escribe la clave. Allí puedes: añadir borrushers, crear partidas (kills y muertes de cada borrusher), borrarlas, cerrar temporada (el palmarés se rellena solo), cambiar los puntos y empezar de cero.
Los cambios se ven al momento para todo el que abra la web. Solo quien tenga la clave puede editar.

## Novedades del panel Admin
Editar partidas ya guardadas · bonus y sanciones de puntos · calendario de próximas partidas · noticias (salen en Clasificación) · palmarés manual · añadir varios borrushers a la vez · nombre de la liga y partidas mínimas · copia de seguridad y restaurar · revisión automática de datos.
Nuevas estadísticas públicas: pestañas **Análisis** y **Calendario**, rachas, puesto medio, peor puesto, estadísticas por mapa, por temporada y distribución de puestos en cada borrusher.

## Borrusquads y dos competiciones
- Competiciones: **Golden League** (campeonato de borrushers y de borrusquads) y **Golden Champions** (cada temporada, los borrushers que tú elijas; el botón "Marcar los 4 primeros de la Golden League" ayuda).
- La barra "Competición" (arriba) filtra TODAS las estadísticas: Todas / Golden League / Golden Champions.
- ⚙ Admin → **Borrusquads** (crear), **Plantillas** (qué borrusher está en cada borrusquad cada temporada), **Borrushers por competición** (quién juega qué), y al crear una partida eliges la competición.
- Palmarés separado por competición, con campeón de borrushers y de borrusquads; las fichas de borrusher y de borrusquad muestran sus títulos.
- Para actualizar: sube de nuevo solo `index.html` a GitHub (los datos guardados se conservan).

## 🏅 Golden Awards (premios de cada temporada)
- Nueva pestaña pública **Golden Awards**: premios por temporada (filtrable) y medalleros de borrushers y borrusquads. Respeta el filtro de competición.
- ⚙ Admin → **Golden Awards**: **crear premio propio** (nombre, icono y si es **de borrusher o de borrusquad**), renombrarlo/borrarlo y **entregarlo** (premio + temporada + competición + ganador). El selector de ganador muestra borrushers o borrusquads según el tipo del premio.
- Los premios aparecen en el **palmarés** de cada borrusher (pestaña Borrusher) y de cada borrusquad (pestaña Borrusquads), con las temporadas en que los ganó.
- **Golden MVP** y **Golden Killer** vienen creados y se rellenan solos desde el Palmarés al cerrar temporada.
- Los datos nuevos se guardan en `premios` y `galardones` dentro de los mismos datos (no hay que tocar `api/data.js`). Para actualizar, sube solo `index.html`.

### Competiciones (propias y las existentes) y premios generales
- ⚙ Admin → **Competiciones**: crea tus competiciones (nombre, código corto, icono o imagen). Son competiciones completas como Golden League y Golden Champions: partidas, clasificación, estadísticas, palmarés, campeonato de borrusquads, medallero y filtro "Competición" arriba.
- Cada una (también Golden League y Golden Champions) tiene ajustes propios: **puntos por puesto**, **puntos por kill**, **desempate** (kills / victorias / K/D), **campeonato de borrusquads sí/no** y **quién juega** (todos, o los N primeros de otra competición, con botón «Marcar los primeros» en Borrushers por competición). Al guardar se recalculan los puntos.
- Al crear una partida eliges la competición; su id lleva el código (ej. `CB-T1-J01-P1`).
- **Golden Awards:** las competiciones nuevas aparecen solas al entregar premios y en los filtros; además existe la opción **«General»** (premio válido para todas).
- Premios y competiciones admiten icono (emoji) o **imagen subida** (se reduce a 128 px y se guarda en los datos).
- Golden League y Golden Champions no se pueden borrar. Una competición con partidas o palmarés tampoco hasta que los borres.

### Premios con competición
- Al **crear un premio** eliges su competición (General = todas, Golden League, Golden Champions o las tuyas). Al entregarlo se usa la del premio; puedes cambiarla después desde la lista de premios.
