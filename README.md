# Badminton - Offline Web Edition

Purono Android badminton game er asset (character animation, court, shuttle, button, sound) diye
**notun kore likha web game**. Original game er code zip e chhilo na, tai game logic (physics, CPU opponent,
score, menu, touch control) ekdom scratch theke likha hoyeche. Internet lage na: ekbar load korle offline cholbe.

## Local e chalano (sobcheye shohoj)
```bash
cd badminton-web
python3 -m http.server 8000      # ba: npx serve .
# browser e kholo: http://localhost:8000
```
`index.html` double-click korleo cholbe, kintu offline install (PWA) shudhu http/https e kaj kore.

## GitHub theke test kora
1. Notun repo banan, ei folder er sob file push korun (main branch).
2. Repo > **Settings > Pages > Source: GitHub Actions** select korun.
3. Push korle `.github/workflows/pages.yml` auto deploy korbe. Link: `https://<user>.github.io/<repo>/`
4. Phone e link kholun > browser menu > **Add to Home screen / Install** = offline app.

> Note: GitHub free plan e Pages shudhu **public** repo te kaj kore. Ei game e original game er asset ache,
> tai public korar age nijer adhikar ache kina dekhe nin. Private e rakhte chaile local server e test korun.

## Controls
| Action | Keyboard | Touch |
|---|---|---|
| Move | Left/Right ba A/D | arrow button |
| Short hit (drop) / short serve | J / Z / Down | curved arrow |
| Long hit (clear) / high serve | K / X / Up | up arrow |
| Smash | L / C / Space | player icon |
| Pause | Esc / P | pause button |

Hit korle gauge bhore; gauge full hole porer smash ta **Power Smash** (CPU r dhorte kosto).

## Structure
```
index.html, style.css, sw.js, manifest.webmanifest
js/spine.js      Spine 3.4 runtime (canvas) - bones, mesh, IK, animation
js/game.js       game logic, physics, CPU AI, UI
assets/          original images, sounds, font, spine data (bodydata.js)
tools/build_sw.py  offline cache list regenerate (asset bodlale chalan)
```
Asset bodlale ba add korle: `python3 tools/build_sw.py` (GitHub Action o eta nijei chalay).

## Ja ache / ja nai
Ache: 1v1 match vs CPU (5 level), 6 arena, rally scoring (7/11/15/21), smash gauge, touch + keyboard, offline PWA.
Nai: shop, chest, talent, equipment, online, daily task (original e chhilo, kintu code/server chhara banano jay na).
