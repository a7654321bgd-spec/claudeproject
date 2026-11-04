# Попадает в каждый бит

Залипалки под треки новой школы, смонтированные как фонк-эдит. Светящийся квадрат летит по экрану и врезается в стенку на каждом ударе барабанов: на долях, на восьмых и на шестнадцатых там, где они реально звучат. Стенки появляются чуть заранее, так что видно, куда он полетит.

- **До дропа** всё монохромное, камера медленно наезжает, квадрат дрожит.
- **На дропе** два кадра негатива, расслоение RGB и рваные полосы. Включается цвет: каждая отбитая стенка загорается новым оттенком. Тот же удар повторяется на втором дропе (9-й такт).
- **На каждую долю** зум-панч, наклон камеры, прыжок заголовка, отпечаток квадрата в точке удара. Под бас пульсируют фон, сетка, стенки и пыль.
- **Во второй половине** ударов больше, а в конце фразы идёт дробь шестнадцатыми.
- **В последнем такте** камера отъезжает и показывает весь узор, который нарисовал бит.

Ролики (1080×1920, 60 fps), в обоих в левом нижнем углу плашка «РЕКЛАМА · TELEGRAM-БОТ · Domino Team · @dtlinkk_bot»:

| Трек | Фрагмент | Удары | Длина |
|---|---|---|---|
| VILLIAN & madk1d — «ДИНАСТИЯ» (`beats.json`) | 59,29–87,14 с: два такта до дропа и 16 после | 113 | 27,85 с |
| 9mice, Егор Крид, тёмный принц, madk1d — «Jealous» (`jealous.json`) | 3,84–22,02 с: отсчёт «three, two, one, jealous» и весь первый припев до обрыва | 113 | 18,17 с |
| madk1d & VILLIAN — «8 миля» (`8mile.json`) | 49,99–78,79 с: два такта без баса и 16 тактов после его возвращения | 112 | 28,8 с |
| Индия, Xcho, МОТ — «Шадэ» (Index-1 Radio Edit) (`shade.json`) | 16,84–49,34 с: два такта до возвращения баса и 16 после; хэты сплошные, поэтому удары только до восьмых | 127 | 32,5 с |
| Kai Angel — «Andy Warhol» (`andy.json`) | 28,34–60,97 с: такт до припева и 16 тактов припева | 139 | 32,63 с |
| Toxi$ (`toxis.json`, удары по словам `toxis-vocal.json`) | 33,29–61,11 с: такт до первого громкого блока и 16 тактов блока | 72 | 27,82 с |
| ivycraft — «люблю москву но снится london» (`london.json`) | 4,71–36,33 с: два такта до первой сильной доли после вступления и 16 после | 102 | 31,62 с |
| Егор Крид, OG Buda, Toxi$, Мэйби Бэйби, Baby Cute, Дора, madk1d, тёмный принц — «Malo 2.0» (`malo.json`) | 11,55–44,78 с: два такта тихого вступления и 16 тактов с момента, как заходит бит | 152 | 33,22 с |
| Kai Angel & 9mice — «Ice + Alabaster» (`ice.json`) | 9,79–39,21 с: два такта тихого вступления и 16 тактов с взрыва на 13,06 с | 164 | 29,42 с |
| тёмный принц, tewiq, фортуна 812 — «ПАПА» (`papa.json`) | 28,43–54,61 с: конец паузы без баса и 16 тактов после возвращения баса | 130 | 26,18 с |
| METAN — «Шнурки» (`shnurki.json`) | 13,12–42,42 с: два такта вступления и 16 тактов с момента, как заходит бит | 126 | 29,3 с |
| Big Baby Tape feat. Toxi$ — «Ameli» (`ameli.json`) | 22,00–50,27 с: конец тихой части и 16 тактов громкой | 110 | 28,27 с |

В «Jealous» отскок приходится на каждое слово отсчёта, перед припевом идёт дробь шестнадцатыми. Петля сходится сама: после обрыва «души ме…» снова начинается отсчёт.

Готового видео в репозитории нет, потому что в нём звучит чужой трек, а репозиторий публичный. Видео передано напрямую. Собрать его заново можно своей копией трека (см. ниже).

## Как выложить

**Подпись**

> Он попадает в каждый бит 🤯 Досмотри до конца #залипалка #phonk #satisfying #ритм #edit

**Комментарий от своего аккаунта, закрепить**

> На какой секунде мурашки? Мне хватило дропа 🔥

**Что ещё важно**

- **Звук.** Трек чужой. Если TikTok его заглушит, загрузите ролик и добавьте этот же трек из библиотеки TikTok так, чтобы он стартовал за две доли до дропа. Иначе удары разойдутся с картинкой.
- **Реклама.** Если она платная, включите «Брендированный контент». По российскому закону в описании нужны рекламодатель и токен erid, пометка «РЕКЛАМА» на плашке уже есть.
- **Юзернейм бота.** В Telegram дефис в юзернеймах запрещён, поэтому на плашке стоит `@dtlinkk_bot`. Если настоящий юзернейм другой, пересоберите с `--ad-sub`.

## Как собрать заново

Нужны Python 3 с numpy, Node.js с Playwright (Chromium), ffmpeg и шрифт Inter Display.

```bash
# «ДИНАСТИЯ»: дроп находится сам
python3 analyze.py династия.mp3                                 # → beats.json
node build.js --track династия.mp3                              # → beat-bounce.mp4 и обложка

# «Jealous»: дроп задан вручную, чтобы взять первый припев с отсчётом
python3 analyze.py jealous.mp3 --out jealous.json --drop 7.474 --before 2 --after 8
node build.js --beats jealous.json --track jealous.mp3 --out beat-bounce-jealous.mp4 --seed 7 --bound 1600,2000

# «8 миля»: трек ровно громкий, дропом служит возвращение баса после двух пустых тактов
python3 analyze.py 8-миля.mp3 --out 8mile.json --drop 53.194 --before 2 --after 16
node build.js --beats 8mile.json --track 8-миля.mp3 --out beat-bounce-8mile.mp4 --seed 7

# «Шадэ»: хауc с непрерывными хэтами, удары только до восьмых
python3 analyze.py шадэ.mp3 --out shade.json --drop 20.4 --finest 8
node build.js --beats shade.json --track шадэ.mp3 --out beat-bounce-shade.mp4 --seed 11 --bound 1600,2000

# «Andy Warhol»: припев с 30,27 с (сильная доля, где поднимается громкость), такт до него
python3 analyze.py andy-warhol.mp3 --out andy.json --drop 30.266 --before 1 --after 16
node build.js --beats andy.json --track andy-warhol.mp3 --out beat-bounce-andy.mp4 --seed 7 --bound 1600,2000

# «Andy Warhol», удары по словам: голос отделяется моделью MDX-Net (Kim_Vocal_2.onnx из релизов
# github.com/TRvlvr/model_repo, pip install onnxruntime), удар — где голос резко поднимается из провала
python3 separate.py andy-warhol.mp3 --start 28.34 --dur 32.64 --model Kim_Vocal_2.onnx --out andy-vocals.wav
python3 vocal_hits.py andy-warhol.mp3 andy.json --vocals andy-vocals.wav --rise-db 9 --min-gap 0.12 --out andy-vocal.json
node build.js --beats andy-vocal.json --track andy-warhol.mp3 --out beat-bounce-andy-words.mp4 --seed 11 --bound 1600,2000 \
  --title "ПОПАДАЕТ В КАЖДОЕ СЛОВО" --reveal "так выглядит этот припев"

# Toxi$: удары по словам; подача тянущаяся, поэтому порог подъёма мягче (6 dB)
python3 analyze.py toxis.mp3 --out toxis.json --drop 34.929 --before 1 --after 16
python3 separate.py toxis.mp3 --start 33.2926 --dur 27.8187 --model Kim_Vocal_2.onnx --out toxis-vocals.wav
python3 vocal_hits.py toxis.mp3 toxis.json --vocals toxis-vocals.wav --rise-db 6 --min-gap 0.12 --out toxis-vocal.json
node build.js --beats toxis-vocal.json --track toxis.mp3 --out beat-bounce-toxis-words.mp4 --seed 11 \
  --title "ПОПАДАЕТ В КАЖДОЕ СЛОВО" --reveal "так выглядит этот припев"

# ivycraft: дроп находится сам (8,22 с)
python3 analyze.py london.m4a --out london.json
node build.js --beats london.json --track london.m4a --out beat-bounce-london.mp4 --seed 11 --bound 1600,2000

# «Malo 2.0»: дроп — сильная доля 15,24 с, где после вступления заходит бит
python3 analyze.py malo.mp3 --out malo.json --drop 15.239
node build.js --beats malo.json --track malo.mp3 --out beat-bounce-malo.mp4 --seed 11 --bound 1600,2000

# «Ice + Alabaster»: взрыв на 13,06 с (громкость −13 → −1 dB)
python3 analyze.py ice.m4a --out ice.json --drop 13.064
node build.js --beats ice.json --track ice.m4a --out beat-bounce-ice.mp4 --seed 7 --bound 1600,2000

# «ПАПА»: автоматический темп ошибается (153,6), настоящий ~165 BPM; хэты сплошные — только до восьмых
python3 analyze.py papa.m4a --out papa.json --drop 31.35 --finest 8 --bpm 165.16
node build.js --beats papa.json --track papa.m4a --out beat-bounce-papa.mp4 --seed 11 --bound 1600,2000

# «Шнурки»: дроп находится сам; «Ameli»: вход громкой части на 25,22 с
python3 analyze.py shnurki.m4a --out shnurki.json
node build.js --beats shnurki.json --track shnurki.m4a --out beat-bounce-shnurki.mp4 --seed 7 --bound 1900,2400
python3 analyze.py ameli.m4a --out ameli.json --drop 25.216
node build.js --beats ameli.json --track ameli.m4a --out beat-bounce-ameli.mp4 --seed 7 --bound 1600,2000

node build.js --preview 0,3.1,15                                # PNG-кадры в preview/, трек не нужен
node build.js --track трек.mp3 --ad-title "Domino Team" --ad-sub "@dtlinkk_bot"
```

| Файл | Роль |
|---|---|
| `analyze.py` | Ищет сетку битов (155,07 BPM) по спектральному потоку и уточняет её усреднением атак по всем долям. Дроп находит по удару тарелки. Удары между долями отбирает по силе атаки относительно долей того же такта, во второй половине порог мягче. Пишет `beats.json` |
| `beats.json` | Время и сила каждого удара, огибающие громкости и баса. Самого звука в файле нет |
| `bounce.js` | Планирует путь: диагональный полёт с постоянной скоростью, стенка в момент каждого удара, на быстрых сериях стенки короче. Поиск с возвратом следит, чтобы квадрат не пролетал сквозь стенки и путь оставался компактным |
| `separate.py` | Отделяет голос от музыки моделью MDX-Net (ONNX) |
| `vocal_hits.py` | Удары по словам: начала слов и слогов в отделённом голосе (или, без него, грубо по тональной части микса) |
| `render.html` | Отрисовка кадров на canvas и эффекты монтажа: зум-панчи, наклон камеры, RGB, глитч, негатив |
| `build.js` | Сборка: путь, кадры из Chromium, точный вырез фрагмента трека, запас 3 dB по пику, ffmpeg |

Каждый кадр показывает момент на полкадра вперёд, поэтому удар попадает на кадр, ближайший к звуку. Проверено на дропе: удар тарелки звучит на 3,084 с, вспышка видна на кадре 3,100 с.

## Реклама

Первую половину ролика в левом нижнем углу стоит небольшая плашка: «Domino Team · Discord-канал · @dtlinkk_bot». На первой сильной доле после середины она с отскоком раскрывается в большую неоновую карточку: «Хочешь найти альтушку? Заходи в Discord-канал Domino Team. Ссылка в комментариях или @dtlinkk_bot». Рамка карточки переливается и пульсирует в бит. Текст меняется флагами `--ad-q`, `--ad-title`, `--ad-sub`.
