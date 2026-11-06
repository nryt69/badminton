/* Offline cache: everything is cached on first load, then served from cache. */
const CACHE = 'badminton-offline-61fed4fc98';
const FILES = [
 "./",
 "index.html",
 "manifest.webmanifest",
 "style.css",
 "assets/fonts/title.ttf",
 "assets/img/Birdie.png",
 "assets/img/Shadow.png",
 "assets/img/arena1.png",
 "assets/img/arena2.png",
 "assets/img/arena3.png",
 "assets/img/arena7.png",
 "assets/img/body.png",
 "assets/img/outdoor.png",
 "assets/img/training.png",
 "assets/js/bodydata.js",
 "assets/snd/Crowd-Boo.mp3",
 "assets/snd/Crowd-Cheering.mp3",
 "assets/snd/HitH.mp3",
 "assets/snd/HitL.mp3",
 "assets/snd/HitM.mp3",
 "assets/snd/Hitair.mp3",
 "assets/snd/MainMusic1.mp3",
 "assets/snd/Out.mp3",
 "assets/snd/SkillReady.mp3",
 "assets/snd/SkillUse.mp3",
 "assets/snd/Smash.mp3",
 "assets/snd/Strong_Smash.mp3",
 "assets/snd/button.mp3",
 "assets/snd/count.mp3",
 "assets/snd/fail.mp3",
 "assets/snd/footstepL.mp3",
 "assets/snd/footstepR.mp3",
 "assets/snd/game_point.mp3",
 "assets/snd/lose.mp3",
 "assets/snd/popUp.mp3",
 "assets/snd/victory.mp3",
 "assets/snd/win.ogg",
 "assets/ui/Gauge_Bar_Background.png",
 "assets/ui/Gauge_Bar_Front_Border.png",
 "assets/ui/Gauge_Bar_Middle.png",
 "assets/ui/Net_Back.png",
 "assets/ui/Net_Front.png",
 "assets/ui/Net_MiddleNet.png",
 "assets/ui/Net_Shadow.png",
 "assets/ui/Pause_Button.png",
 "assets/ui/Skill-Smash.png",
 "assets/ui/SkillOFF-Smash.png",
 "assets/ui/Smash_Button.png",
 "assets/ui/Smash_Button_Empty.png",
 "assets/ui/b_left.png",
 "assets/ui/b_left_dn.png",
 "assets/ui/b_long.png",
 "assets/ui/b_long_dn.png",
 "assets/ui/b_right.png",
 "assets/ui/b_right_dn.png",
 "assets/ui/b_short.png",
 "assets/ui/b_short_dn.png",
 "assets/ui/b_smash.png",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "js/game.js",
 "js/spine.js"
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); return res;
  }).catch(() => caches.match('index.html'))));
});
