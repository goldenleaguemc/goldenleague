"""Convierte Golden_League_Borrush.xlsx (hojas Config, Jugadores, Partidas, Palmarés) en data.json.
Uso:  python excel_a_json.py Golden_League_Borrush.xlsx      (necesita: pip install openpyxl)"""
import sys, json, datetime, openpyxl
wb = openpyxl.load_workbook(sys.argv[1] if len(sys.argv) > 1 else 'Golden_League_Borrush.xlsx', data_only=True)
cfg, ju, pa, pm = wb['Config'], wb['Jugadores'], wb['Partidas'], wb['Palmarés']
iso = lambda v: v.date().isoformat() if isinstance(v, datetime.datetime) else (v.isoformat() if isinstance(v, datetime.date) else str(v or ''))
data = dict(demo=False, liga=cfg['B3'].value, minPartidas=cfg['B4'].value or 5,
  puntos=[cfg.cell(r, 2).value or 0 for r in range(6, 22)],
  jugadores=[r[0].value for r in ju.iter_rows(min_row=2, min_col=2, max_col=2) if r[0].value],
  palmares=[dict(temporada=r[0].value, anio=str(r[1].value or ''), campeon=r[2].value, subcampeon=r[3].value, tercero=r[4].value,
                 mvp=r[5].value, killer=r[6].value, killsKiller=r[7].value or 0)
            for r in pm.iter_rows(min_row=6, max_row=35, max_col=8) if r[0].value and r[2].value],
  partidas=[dict(id=r[0].value, temporada=r[1].value, jornada=r[2].value, fecha=iso(r[3].value), mapa=r[4].value or '',
                 jugador=r[5].value, kills=r[6].value, muertes=r[7].value)
            for r in pa.iter_rows(min_row=2, max_col=8) if r[0].value and r[5].value is not None and r[6].value is not None and r[7].value is not None])
json.dump(data, open('data.json', 'w'), ensure_ascii=False, indent=1)
print('data.json listo:', len(data['partidas']), 'filas de partidas,', len(data['jugadores']), 'jugadores')
