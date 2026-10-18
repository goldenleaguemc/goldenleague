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
