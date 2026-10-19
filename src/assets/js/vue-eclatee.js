/**
 * vue-eclatee.js — la cigarette électronique en 3D de l'article
 * « Comment fonctionne une cigarette électronique » (blog).
 *
 * Interrupteur : site.json → effets.vueEclatee. À `false`, le gabarit ne
 * charge ni ce fichier ni Three.js : il ne reste que le texte et l'image fixe.
 *
 * ─── Principe ──────────────────────────────────────────────────────────────
 * Un appareil GÉNÉRIQUE (aucune marque), modélisé ici en quelques formes de
 * révolution. Chaque `.ve-etape` du texte correspond à un état de l'appareil
 * (table ETAPES) : monté ou démonté, pièces mises en avant, liquide, chauffe,
 * air, vapeur, cadrage. On passe d'un état à l'autre par amortissement, pas
 * par une chronologie : défiler vite ou revenir en arrière ne casse rien.
 *
 * ⚠ LE CONTENU NE DÉPEND JAMAIS DE CE SCRIPT. Le texte est dans le HTML,
 *   lisible et entier ; l'image fixe `.ve-poster` montre l'appareil démonté
 *   avec ses légendes. Le script ne fait qu'ajouter `.ve-actif` (scène
 *   épinglée sur téléphone, étapes non lues atténuées) puis `.ve-pret` (le
 *   canvas remplace l'image) — et seulement une fois la 3D réellement prête.
 *
 * ─── Garde-fous ───────────────────────────────────────────────────────────
 * - pas de Three.js, pas de WebGL, ou « Réduire les animations » : on sort,
 *   l'image fixe reste ;
 * - scène hors de vue ou onglet masqué : la boucle ne dessine plus ;
 * - appareil lent : moyenne des images 30 à 150 au-delà de 34 ms → retour à
 *   l'image fixe et contexte WebGL libéré (même règle que hero-fumee.js) ;
 * - amortissements calés sur le TEMPS, pas sur les images : un navigateur
 *   à 3 images/s arrive au même état, plus tard (leçon de vapeur-univers.js).
 *
 * ⚠ API du navigateur toujours lues sur `window.` : `test:pages` exécute ce
 *   fichier dans un simulateur sans WebGL, où un nom nu lèverait.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var racine = document.querySelector('[data-vue-eclatee]');
  if (!racine) return;
  var THREE = window.THREE;
  if (!THREE || !window.requestAnimationFrame) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var sceneEl = racine.querySelector('.ve-scene');
  var canvas = racine.querySelector('.ve-canvas');
  var calque = racine.querySelector('.ve-etiquettes');
  var sections = Array.prototype.slice.call(racine.querySelectorAll('.ve-etape'));
  var cNum = racine.querySelector('.ve-compteur-num');
  var cNom = racine.querySelector('.ve-compteur-nom');
  if (!sceneEl || !canvas || !calque || sections.length !== 9) return;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return; }
  if (!renderer || !renderer.getContext()) return;

  var ratio = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(ratio);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  var TANFOV = Math.tan(THREE.MathUtils.degToRad(30) / 2);

  /* ── Environnement : studio sombre et chaud, quelques boîtes à lumière
        pour que le métal ait quelque chose à refléter ── */
  (function () {
    var c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    var g = c.getContext('2d');
    var fond = g.createLinearGradient(0, 0, 0, 512);
    fond.addColorStop(0, '#3b3328'); fond.addColorStop(0.48, '#17130e'); fond.addColorStop(1, '#040302');
    g.fillStyle = fond; g.fillRect(0, 0, 1024, 512);
    function boite(x, y, w, h, col, a) { g.globalAlpha = a; g.fillStyle = col; g.fillRect(x, y, w, h); }
    boite(110, 70, 150, 240, '#fff4e2', 0.95);
    boite(600, 120, 300, 46, '#E8D5A3', 0.75);
    boite(860, 60, 50, 280, '#ffffff', 0.55);
    boite(380, 300, 200, 30, '#C9A96E', 0.5);
    g.globalAlpha = 1;
    var t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.encoding = THREE.sRGBEncoding;
    var pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(t).texture;
    t.dispose(); pm.dispose();
  })();

  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x0e0c09, 0.35));
  var cle = new THREE.DirectionalLight(0xfff0d8, 1.5); cle.position.set(5, 9, 7); scene.add(cle);
  var contre = new THREE.DirectionalLight(0xC9A96E, 1.6); contre.position.set(-7, 4, -6); scene.add(contre);

  /* ── Matériaux ── */
  var M = {
    metal:   new THREE.MeshStandardMaterial({ color: 0x2a251e, metalness: 0.9, roughness: 0.3 }),
    or:      new THREE.MeshStandardMaterial({ color: 0xC9A96E, metalness: 1, roughness: 0.22 }),
    acier:   new THREE.MeshStandardMaterial({ color: 0xbdb6aa, metalness: 1, roughness: 0.26 }),
    resine:  new THREE.MeshPhysicalMaterial({ color: 0x17120d, metalness: 0.1, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 }),
    verre:   new THREE.MeshPhysicalMaterial({ color: 0xfff8ee, metalness: 0, roughness: 0.04, clearcoat: 1, opacity: 0.17, side: THREE.DoubleSide, depthWrite: false }),
    liquide: new THREE.MeshStandardMaterial({ color: 0xD49A3A, roughness: 0.12, metalness: 0, opacity: 0.6, emissive: 0x3a2105, depthWrite: false }),
    coton:   new THREE.MeshStandardMaterial({ color: 0xD9D1C2, roughness: 1 }),
    carte:   new THREE.MeshStandardMaterial({ color: 0x16271d, roughness: 0.55, metalness: 0.2 }),
    puce:    new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.35, metalness: 0.3 }),
    trou:    new THREE.MeshBasicMaterial({ color: 0x020101 }),
    fil:     new THREE.MeshStandardMaterial({ color: 0x8f877c, metalness: 1, roughness: 0.32, emissive: 0xff4a12, emissiveIntensity: 0 }),
    led:     new THREE.MeshStandardMaterial({ color: 0xC9A96E, metalness: 0.6, roughness: 0.3, emissive: 0xffc46b, emissiveIntensity: 0 })
  };
  var metalDouble = M.metal.clone(); metalDouble.side = THREE.DoubleSide;

  /* ── Pièces ── (cotes en cm environ, appareil monté de 0 à 12) */
  var appareil = new THREE.Group();
  scene.add(appareil);
  var pieces = {};
  var ordre = [];
  function piece(nom, decalY, decalX, etiquettes) {
    var g = new THREE.Group(); appareil.add(g);
    var p = { g: g, dy: decalY, dx: decalX || 0, mats: [], etiquettes: etiquettes || [], lum: 1 };
    pieces[nom] = p; ordre.push(nom); return p;
  }
  function maille(p, geo, mat, pos, rot) {
    var m = mat.clone(); m.transparent = true; m.userData.base = mat.opacity;
    p.mats.push(m);
    var me = new THREE.Mesh(geo, m);
    if (pos) me.position.set(pos[0], pos[1], pos[2]);
    if (rot) me.rotation.set(rot[0], rot[1], rot[2]);
    p.g.add(me); return me;
  }
  function tour(pts, seg) { return new THREE.LatheGeometry(pts.map(function (q) { return new THREE.Vector2(q[0], q[1]); }), seg || 72); }
  function cyl(r, h, s) { return new THREE.CylinderGeometry(r, r, h, s || 48); }
  var QUART = Math.PI / 2;

  // Culot
  var culot = piece('culot', -1.5, 0, []);
  maille(culot, tour([[0, 0], [0.68, 0], [0.77, 0.05], [0.8, 0.16], [0.8, 0.5]]), M.metal);
  maille(culot, new THREE.TorusGeometry(0.8, 0.016, 8, 72), M.or, [0, 0.2, 0], [QUART, 0, 0]);

  // Coque de la batterie, qui s'écarte sur le côté
  var coque = piece('coque', 0, 2.2, [{ nom: 'Bouton', x: 0.82, y: 5.4 }]);
  maille(coque, tour([[0.74, 0.5], [0.8, 0.5], [0.8, 6.5], [0.74, 6.5], [0.74, 0.5]]), metalDouble);
  maille(coque, cyl(0.17, 0.07, 32), M.or, [0.8, 5.4, 0], [0, 0, QUART]);
  var led = maille(coque, new THREE.TorusGeometry(0.8, 0.02, 8, 72), M.led, [0, 6.32, 0], [QUART, 0, 0]);

  // Batterie, avec une étiquette dessinée (redessinée quand les polices du site sont prêtes)
  var batterie = piece('batterie', 0, 0, [{ nom: 'Batterie', x: 0.67, y: 3.4 }]);
  var toile = document.createElement('canvas'); toile.width = 1024; toile.height = 1356;
  var texBat = new THREE.CanvasTexture(toile); texBat.encoding = THREE.sRGBEncoding; texBat.anisotropy = 4;
  function dessinerEtiquette() {
    var g = toile.getContext('2d');
    g.fillStyle = '#1d1914'; g.fillRect(0, 0, 1024, 1356);
    g.fillStyle = '#C9A96E'; g.fillRect(0, 70, 1024, 14); g.fillRect(0, 1272, 1024, 14);
    g.fillStyle = 'rgba(201,169,110,.35)'; g.fillRect(0, 100, 1024, 3); g.fillRect(0, 1253, 1024, 3);
    [256, 768].forEach(function (cx) {
      g.textAlign = 'center';
      g.fillStyle = '#F5F0E8'; g.font = '300 96px Bitter, Georgia, serif'; g.fillText('Li-ion', cx, 600);
      g.fillStyle = '#E8D5A3'; g.font = '44px "Space Mono", monospace'; g.fillText('3,7 V', cx, 690);
      g.fillText('1 100 mAh', cx, 750);
      g.strokeStyle = '#C9A96E'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 70, 810); g.lineTo(cx + 70, 810); g.stroke();
      g.fillStyle = '#A89E8C'; g.font = '32px "Space Mono", monospace'; g.fillText('+', cx, 1180);
    });
    texBat.needsUpdate = true;
  }
  dessinerEtiquette();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(dessinerEtiquette);
  maille(batterie, cyl(0.66, 5.4, 64), new THREE.MeshStandardMaterial({ map: texBat, roughness: 0.42, metalness: 0.15 }), [0, 3.5, 0]);
  maille(batterie, cyl(0.6, 0.05), M.acier, [0, 0.78, 0]);
  maille(batterie, cyl(0.6, 0.05), M.acier, [0, 6.22, 0]);
  maille(batterie, cyl(0.2, 0.07, 32), M.acier, [0, 6.28, 0]);

  // Puce et connecteur
  var puce = piece('puce', 0.95, 0, [{ nom: 'Puce', x: 0.64, y: 6.42 }]);
  maille(puce, cyl(0.64, 0.07), M.carte, [0, 6.42, 0]);
  maille(puce, new THREE.BoxGeometry(0.34, 0.07, 0.24), M.puce, [-0.12, 6.49, 0.12]);
  maille(puce, new THREE.BoxGeometry(0.14, 0.06, 0.1), M.puce, [0.3, 6.48, -0.18]);
  maille(puce, new THREE.BoxGeometry(0.1, 0.05, 0.16), M.or, [0.28, 6.48, 0.25]);
  maille(puce, new THREE.TorusGeometry(0.52, 0.012, 6, 64), M.or, [0, 6.46, 0], [QUART, 0, 0]);
  maille(puce, cyl(0.27, 0.28, 40), M.or, [0, 6.6, 0]);
  for (var i = 0; i < 4; i++) maille(puce, new THREE.TorusGeometry(0.275, 0.012, 6, 40), M.acier, [0, 6.5 + i * 0.06, 0], [QUART, 0, 0]);

  // Arrivée d'air : six ouvertures
  var AIR_ANGLES = [0, 1, 2, 3, 4, 5].map(function (k) { return k * Math.PI / 3 + Math.PI / 6; });
  var air = piece('air', 1.85, 0, [{ nom: "Arrivée d'air", x: 0.82, y: 6.75 }]);
  maille(air, tour([[0.7, 6.5], [0.8, 6.52], [0.8, 6.98], [0.7, 7.0], [0.7, 6.5]]), metalDouble);
  maille(air, cyl(0.7, 0.04), M.metal, [0, 6.97, 0]);
  AIR_ANGLES.forEach(function (a) {
    maille(air, new THREE.CylinderGeometry(0.075, 0.075, 0.05, 20), M.trou, [Math.cos(a) * 0.79, 6.75, Math.sin(a) * 0.79], [0, -a, QUART]);
  });

  // Résistance et coton
  var resistance = piece('resistance', 3.05, 0, [{ nom: 'Résistance', x: 0.36, y: 7.6 }, { nom: 'Coton', x: 0.27, y: 8.32 }]);
  maille(resistance, cyl(0.2, 0.3, 32), M.or, [0, 7.15, 0]);
  var coton = maille(resistance, new THREE.CylinderGeometry(0.26, 0.26, 1.1, 40, 1), M.coton, [0, 7.85, 0]);
  var helice = new THREE.Curve();
  helice.getPoint = function (t, cible) {
    var v = cible || new THREE.Vector3();
    var a = t * 7 * Math.PI * 2;
    return v.set(Math.cos(a) * 0.305, 7.38 + t * 0.94, Math.sin(a) * 0.305);
  };
  var fil = maille(resistance, new THREE.TubeGeometry(helice, 420, 0.03, 8, false), M.fil);
  var pattes = [maille(resistance, cyl(0.02, 0.3, 8), M.fil, [0.3, 7.24, 0]), maille(resistance, cyl(0.02, 0.3, 8), M.fil, [-0.3, 7.24, 0])];
  var lueur = new THREE.PointLight(0xff8a3d, 0, 3.2, 2);
  lueur.position.set(0, 7.85, 0); resistance.g.add(lueur);

  // Réservoir
  var reservoir = piece('reservoir', 4.35, 0, [{ nom: 'Réservoir', x: 0.81, y: 9.3 }]);
  maille(reservoir, tour([[0.74, 7.0], [0.8, 7.06], [0.8, 10.24], [0.74, 10.3]]), M.verre);
  maille(reservoir, tour([[0, 7.1], [0.72, 7.1], [0.72, 9.6], [0, 9.6]], 64), M.liquide);
  maille(reservoir, cyl(0.12, 1.85, 24), M.acier, [0, 9.37, 0]);
  maille(reservoir, new THREE.TorusGeometry(0.8, 0.02, 8, 72), M.or, [0, 7.04, 0], [QUART, 0, 0]);

  // Embout
  var embout = piece('embout', 5.45, 0, [{ nom: 'Embout', x: 0.55, y: 11.3 }]);
  maille(embout, tour([[0.74, 10.3], [0.8, 10.3], [0.8, 10.56], [0.6, 10.62]]), M.or);
  maille(embout, tour([[0.6, 10.58], [0.6, 10.76], [0.53, 11.3], [0.37, 11.85], [0.3, 11.99], [0.13, 12.02], [0.12, 11.9]]), M.resine);
  maille(embout, new THREE.CircleGeometry(0.12, 24), M.trou, [0, 11.93, 0], [-QUART, 0, 0]);

  /* ── Particules : liquide, air, vapeur ── */
  var PX_VS =
    'attribute float aAlpha; attribute float aSize; varying float vA; uniform float uEchelle;' +
    'void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
    ' gl_PointSize = aSize * uEchelle / -mv.z; gl_Position = projectionMatrix * mv; }';
  var PX_FS =
    'uniform vec3 uCouleur; varying float vA;' +
    'void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r) * vA;' +
    ' gl_FragColor = vec4(uCouleur * a, a); }';
  var flux = [];
  function creerFlux(n, couleur, chemin, vitesse) {
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(n * 3), al = new Float32Array(n), ta = new Float32Array(n);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(ta, 1));
    var mat = new THREE.ShaderMaterial({
      uniforms: { uCouleur: { value: new THREE.Color(couleur) }, uEchelle: { value: 400 } },
      vertexShader: PX_VS, fragmentShader: PX_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    var pts = new THREE.Points(geo, mat); pts.frustumCulled = false; appareil.add(pts);
    var etat = [];
    for (var k = 0; k < n; k++) etat.push({ t: Math.random(), v: vitesse * (0.75 + Math.random() * 0.5), a: Math.random() * Math.PI * 2, r: Math.random(), k: Math.random() });
    var o = { pts: pts, geo: geo, pos: pos, al: al, ta: ta, etat: etat, chemin: chemin, force: 0 };
    flux.push(o); return o;
  }
  var v3 = new THREE.Vector3();
  function lerp(a, b, t) { return a + (b - a) * t; }
  function doux(t) { return t * t * (3 - 2 * t); }
  function borne(t) { return Math.min(1, Math.max(0, t)); }

  // Le liquide descend du réservoir et imbibe le coton
  var fLiquide = creerFlux(46, 0xE3A447, function (t, s, out) {
    var yR = reservoir.g.position.y, yC = resistance.g.position.y;
    var u = doux(t), r = lerp(0.45 + s.r * 0.25, 0.27, u);
    out.set(Math.cos(s.a) * r, lerp(yR + 7.2 + s.k * 0.3, yC + 7.45 + s.k * 0.75, u), Math.sin(s.a) * r);
    return [Math.sin(Math.PI * t), 0.11];
  }, 0.45);

  // L'air entre par les ouvertures puis remonte vers la résistance
  var fAir = creerFlux(70, 0xBFD3E6, function (t, s, out) {
    var yA = air.g.position.y, yC = resistance.g.position.y;
    var ang = AIR_ANGLES[Math.floor(s.k * 6) % 6] + (s.r - 0.5) * 0.12;
    if (t < 0.5) {
      var r1 = lerp(1.9, 0.2, doux(t / 0.5));
      out.set(Math.cos(ang) * r1, yA + 6.75 + (s.r - 0.5) * 0.04, Math.sin(ang) * r1);
    } else {
      var u = (t - 0.5) / 0.5, r2 = 0.2 + u * 0.15;
      out.set(Math.cos(ang + u) * r2, lerp(yA + 6.75, yC + 7.5 + s.r * 0.6, doux(u)), Math.sin(ang + u) * r2);
    }
    return [Math.sin(Math.PI * t) * 0.75, 0.055];
  }, 0.55);

  // La vapeur naît autour de la résistance, monte par la cheminée et sort de l'embout
  var fVapeur = creerFlux(150, 0xF5F0E8, function (t, s, out) {
    var yC = resistance.g.position.y, yR = reservoir.g.position.y, yE = embout.g.position.y;
    var u;
    if (t < 0.2) {
      u = t / 0.2;
      var r = lerp(0.33, 0.05, doux(u));
      out.set(Math.cos(s.a) * r, lerp(yC + 7.4 + s.r * 0.9, yC + 8.45, doux(u)), Math.sin(s.a) * r);
      return [u * 0.7, 0.12];
    }
    if (t < 0.72) {
      u = (t - 0.2) / 0.52;
      out.set(Math.cos(s.a) * 0.06, lerp(yR + 8.45, yE + 11.95, u), Math.sin(s.a) * 0.06);
      return [0.6, 0.13];
    }
    u = (t - 0.72) / 0.28;
    var rr = 0.08 + u * (0.55 + s.r * 0.6);
    out.set(Math.cos(s.a) * rr, yE + 11.95 + u * (1.6 + s.k * 1.4), Math.sin(s.a) * rr);
    return [0.95 * (1 - u) * (1 - u * 0.3), lerp(0.18, 1.1, u)];
  }, 0.4);

  function majFlux(f, dt) {
    var visible = f.force > 0.01;
    f.pts.visible = visible;
    if (!visible) return;
    for (var k = 0; k < f.etat.length; k++) {
      var s = f.etat[k];
      s.t += dt * s.v;
      if (s.t >= 1) { s.t -= 1; s.a = Math.random() * Math.PI * 2; s.r = Math.random(); s.k = Math.random(); }
      var res = f.chemin(s.t, s, v3);
      f.pos[k * 3] = v3.x; f.pos[k * 3 + 1] = v3.y; f.pos[k * 3 + 2] = v3.z;
      f.al[k] = res[0] * f.force; f.ta[k] = res[1];
    }
    f.geo.attributes.position.needsUpdate = true;
    f.geo.attributes.aAlpha.needsUpdate = true;
    f.geo.attributes.aSize.needsUpdate = true;
  }

  /* ── Étiquettes (HTML, projetées sur la vue) ── */
  var etiquettes = [];
  ordre.forEach(function (nom) {
    pieces[nom].etiquettes.forEach(function (e, idx) {
      var el = document.createElement('div');
      el.className = 've-tag';
      el.innerHTML = '<i></i><b></b><span></span>';
      el.querySelector('span').textContent = e.nom;
      calque.appendChild(el);
      etiquettes.push({ cle: nom + ':' + idx, nom: nom, e: e, el: el, op: 0, cible: 0, larg: 0 });
    });
  });

  /* ── Les étapes : une ligne par `.ve-etape`, dans l'ordre du texte ──
     e : démontage (0 monté, 1 éclaté) · focus : pièces mises en avant ·
     cadre : ce que la caméra cadre ('ensemble', 'vapeur' ou [pièce, hauteur, champ]) ·
     tags : légendes affichées (« pièce » ou « pièce:n » pour la n-ième) */
  var ETAPES = [
    { e: 0, cadre: 'ensemble', tourne: true, tags: [] },
    { e: 1, cadre: 'ensemble', tags: ['batterie', 'puce', 'air', 'resistance:0', 'reservoir', 'embout'] },
    { e: 1, focus: ['batterie', 'coque'], cadre: ['batterie', 3.5, 8.2], tags: ['batterie', 'coque'] },
    { e: 1, focus: ['puce'], cadre: ['puce', 6.45, 3.4], tags: ['puce'] },
    { e: 1, focus: ['reservoir', 'resistance'], cadre: ['reservoir', 7.4, 7.2], tags: ['reservoir', 'resistance:1'], liquide: 1 },
    { e: 1, focus: ['resistance'], cadre: ['resistance', 7.85, 3.4], tags: ['resistance:0', 'resistance:1'], chaleur: 1, liquide: 0.4 },
    { e: 1, focus: ['air', 'resistance'], cadre: ['air', 7.6, 4.6], tags: ['air', 'resistance:0'], chaleur: 1, air: 1 },
    { e: 0, cadre: 'vapeur', tags: ['embout'], chaleur: 1, air: 1, vapeur: 1 },
    { e: 0, cadre: 'ensemble', tourne: true, tags: [] }
  ];

  var S = { e: 0, chaleur: 0, air: 0, vapeur: 0, liquide: 0, tx: 0, ty: 6, span: 14, larg: 2, imbibe: 0 };
  var etape = 0;

  function majTags() {
    var liste = ETAPES[etape].tags;
    etiquettes.forEach(function (t) {
      t.cible = (liste.indexOf(t.cle) >= 0 || (liste.indexOf(t.nom) >= 0 && /:0$/.test(t.cle))) ? 1 : 0;
    });
  }
  function choisirEtape() {
    var mobile = window.innerWidth < 900;
    var ligne = window.innerHeight * (mobile ? 0.82 : 0.55);
    var idx = 0;
    sections.forEach(function (s, k) { if (s.getBoundingClientRect().top < ligne) idx = k; });
    if (idx === etape) return;
    sections[etape].classList.remove('ve-lue');
    etape = idx;
    sections[etape].classList.add('ve-lue');
    if (cNum) cNum.textContent = (etape < 9 ? '0' : '') + (etape + 1) + ' / 0' + sections.length;
    if (cNom) cNom.textContent = sections[etape].getAttribute('data-nom') || '';
    majTags();
  }
  var attente = false;
  window.addEventListener('scroll', function () {
    if (attente) return;
    attente = true;
    window.requestAnimationFrame(function () { attente = false; choisirEtape(); });
  }, { passive: true });
  window.addEventListener('resize', choisirEtape);

  /* ── Rotation au doigt ou à la souris (glisser horizontal ; le défilement
        vertical reste au navigateur grâce à touch-action: pan-y) ── */
  var angleAuto = 0, angleMain = 0, vitesseMain = 0, glisse = false, dernierX = 0;
  canvas.addEventListener('pointerdown', function (ev) {
    glisse = true; dernierX = ev.clientX; vitesseMain = 0;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* rien */ }
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!glisse) return;
    var d = (ev.clientX - dernierX) * 0.012; dernierX = ev.clientX;
    angleMain += d; vitesseMain = d * 60;
  });
  function lacher() { glisse = false; }
  canvas.addEventListener('pointerup', lacher);
  canvas.addEventListener('pointercancel', lacher);

  /* ── Taille ── */
  var L = 1, H = 1;
  function redim() {
    var r = sceneEl.getBoundingClientRect();
    L = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(L, H, false);
    camera.aspect = L / H; camera.updateProjectionMatrix();
    var ech = H * renderer.getPixelRatio() / (2 * TANFOV);
    flux.forEach(function (f) { f.pts.material.uniforms.uEchelle.value = ech; });
    etiquettes.forEach(function (t) { t.larg = 0; });
  }
  if (window.ResizeObserver) new window.ResizeObserver(redim).observe(sceneEl);
  else window.addEventListener('resize', redim);

  /* ── Boucle ── */
  var enVue = true;
  if (window.IntersectionObserver) {
    new window.IntersectionObserver(function (es) { enVue = es[0].isIntersecting; }).observe(sceneEl);
  }
  var cible = new THREE.Vector3(), tmp = new THREE.Vector3();
  var coulCoton = new THREE.Color(0xD9D1C2), coulImbibe = new THREE.Color(0xD9B06A);
  appareil.rotation.z = -0.1;

  var precedent = 0, temps = 0, images = 0, cumul = 0, arrete = false, pret = false;

  function arreter() {
    arrete = true;
    racine.classList.remove('ve-pret');
    calque.innerHTML = '';
    try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* rien */ }
  }

  function image(maintenant) {
    if (arrete) return;
    window.requestAnimationFrame(image);
    var brut = precedent ? (maintenant - precedent) / 1000 : 0.016;
    precedent = maintenant;
    if (!enVue || document.hidden) return;
    var dt = Math.min(brut, 0.1);
    temps += dt;

    // Appareil lent : on rend la main à l'image fixe
    images++;
    if (images > 30 && images <= 150) cumul += brut * 1000;
    if (images === 150 && cumul / 120 > 34) { arreter(); return; }

    var E = ETAPES[etape];
    var k = 1 - Math.exp(-dt * 2.8);
    S.e += (E.e - S.e) * k;
    S.chaleur += ((E.chaleur || 0) - S.chaleur) * (1 - Math.exp(-dt * 4));
    S.air += ((E.air || 0) - S.air) * k;
    S.vapeur += ((E.vapeur || 0) - S.vapeur) * k;
    S.liquide += ((E.liquide || 0) - S.liquide) * k;
    S.imbibe = borne(S.imbibe + dt * (S.liquide > 0.3 ? 0.25 : -0.03));

    // Démontage, en léger décalage d'une pièce à l'autre
    ordre.forEach(function (nom, n) {
      var p = pieces[nom];
      var u = doux(borne(S.e * 1.25 - n * 0.03));
      p.g.position.y = p.dy * u;
      p.g.position.x = p.dx * doux(borne(S.e));
      var visee = !E.focus || E.focus.indexOf(nom) >= 0 ? 1 : 0.14;
      p.lum += (visee - p.lum) * k;
      p.mats.forEach(function (m) { m.opacity = m.userData.base * p.lum; });
    });

    // Chauffe : le fil rougit, la LED s'allume, une lueur éclaire coton et verre
    var pouls = S.chaleur * (0.82 + 0.18 * Math.sin(temps * 7));
    fil.material.emissiveIntensity = pouls * 1.15;
    pattes.forEach(function (m) { m.material.emissiveIntensity = pouls * 1.15; });
    lueur.intensity = pouls * 1.1;
    led.material.emissiveIntensity = pouls * 1.6;
    coton.material.color.copy(coulCoton).lerp(coulImbibe, S.imbibe);

    fLiquide.force = S.liquide; fAir.force = S.air; fVapeur.force = S.vapeur;
    flux.forEach(function (f) { majFlux(f, dt); });

    // Rotation : tour lent au début et à la fin, retour face caméra ailleurs
    if (E.tourne) angleAuto += dt * 0.35;
    else {
      var proche = Math.round(angleAuto / (Math.PI * 2)) * Math.PI * 2 + Math.sin(temps * 0.5) * 0.18;
      angleAuto += (proche - angleAuto) * k;
    }
    if (!glisse) {
      angleMain += vitesseMain * dt; vitesseMain *= Math.exp(-dt * 3);
      if (!E.tourne) angleMain *= Math.exp(-dt * 0.6);
    }
    appareil.rotation.y = angleAuto + angleMain;

    // Cadrage
    var ty, tx = 0, span, larg;
    var bas = culot.g.position.y, haut = embout.g.position.y + 12;
    if (E.cadre === 'ensemble') {
      ty = (bas + haut) / 2; span = (haut - bas) + 1.2; larg = 1.8 + 2.4 * S.e; tx = 1.1 * S.e;
    } else if (E.cadre === 'vapeur') {
      ty = (bas + haut + 3.2) / 2; span = (haut + 3.2 - bas) + 0.8; larg = 3;
    } else {
      var p = pieces[E.cadre[0]];
      ty = p.g.position.y + E.cadre[1]; span = E.cadre[2]; larg = span * 0.45; tx = p.g.position.x;
    }
    S.ty += (ty - S.ty) * k; S.tx += (tx - S.tx) * k; S.span += (span - S.span) * k; S.larg += (larg - S.larg) * k;
    appareil.updateMatrixWorld();
    cible.set(S.tx, S.ty, 0); appareil.localToWorld(cible);
    var dist = Math.max((S.span / 2) / TANFOV, (S.larg / 2) / (TANFOV * camera.aspect)) * 1.14;
    camera.position.set(cible.x + dist * 0.08, cible.y + dist * 0.1, cible.z + dist);
    camera.lookAt(cible);

    renderer.render(scene, camera);
    if (!pret) { pret = true; racine.classList.add('ve-pret'); }

    // Étiquettes
    etiquettes.forEach(function (t) {
      t.op += (t.cible - t.op) * (1 - Math.exp(-dt * 6));
      if (t.op < 0.01) { if (t.el.style.opacity !== '0') t.el.style.opacity = '0'; return; }
      var pc = pieces[t.nom];
      tmp.set(t.e.x, t.e.y, 0).add(pc.g.position);
      appareil.localToWorld(tmp);
      tmp.project(camera);
      var x = (tmp.x * 0.5 + 0.5) * L, y = (-tmp.y * 0.5 + 0.5) * H;
      if (!t.larg) t.larg = t.el.offsetWidth || 120;
      var gauche = x + t.larg > L - 10;
      t.el.classList.toggle('ve-gauche', gauche);
      t.el.style.transform = 'translate(' + (gauche ? x - t.larg + 4.5 : x - 4.5).toFixed(1) + 'px,' + y.toFixed(1) + 'px) translateY(-50%)';
      t.el.style.opacity = (t.op * (tmp.z < 1 ? 1 : 0)).toFixed(3);
    });
  }

  racine.classList.add('ve-actif');
  redim();
  sections[0].classList.add('ve-lue');
  majTags();
  choisirEtape();
  window.requestAnimationFrame(image);
})();
