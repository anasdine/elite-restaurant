(() => {
if (customElements.get('kitchen-scene')) return;
const CDN = (typeof window !== 'undefined' && window.__resources && window.__resources.three) || 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
const c01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = x => x * x * (3 - 2 * x);
const kf = (p, keys) => {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (p <= keys[i][0]) { const [a, va] = keys[i - 1], [b, vb] = keys[i]; return va + (vb - va) * smooth((p - a) / (b - a)); }
  return keys[keys.length - 1][1];
};
const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

// A single scroll-driven story: the döner is carved, the slices land on a plate,
// the plate is dressed, and it arrives on the table.
class KitchenScene extends HTMLElement {
  static get observedAttributes() { return ['count']; }
  attributeChangedCallback() {}
  connectedCallback() {
    this._stop = false;
    if (this._up) { if (this._restart) this._restart(); return; }
    this._up = true;
    Object.assign(this.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', overflow: 'hidden', pointerEvents: 'none', zIndex: '0', background: '#100e0b' });
    this._boot();
  }
  disconnectedCallback() { this._stop = true; }

  async _boot() {
    let THREE, renderer;
    try {
      THREE = await import(CDN);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    } catch (e) { console.warn('[kitchen-scene] three/WebGL unavailable', e); this.dataset.fallback = 'true'; this.style.background = 'radial-gradient(120% 80% at 70% 30%, #1d1912 0%, #100e0b 55%)'; return; }
    const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const lowPower = coarse || (navigator.hardwareConcurrency || 8) <= 4;
    const BG = 0x100e0b;
    const basePR = Math.min(window.devicePixelRatio || 1, lowPower ? 1.15 : 1.5);
    renderer.setPixelRatio(basePR);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    this.appendChild(renderer.domElement);

    // ── offscreen target + one post pass (depth of field, grain, vignette, heat shimmer)
    const isGL2 = renderer.capabilities.isWebGL2;
    const depthTex = new THREE.DepthTexture(2, 2); depthTex.type = isGL2 ? THREE.FloatType : THREE.UnsignedIntType;
    let rt;
    try { rt = new THREE.WebGLRenderTarget(2, 2, { samples: isGL2 ? (lowPower ? 2 : 4) : 0, type: THREE.HalfFloatType, depthTexture: depthTex, depthBuffer: true }); }
    catch (e) { rt = new THREE.WebGLRenderTarget(2, 2, { depthTexture: depthTex, depthBuffer: true }); }
    const post = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: rt.texture }, tDepth: { value: depthTex }, resolution: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: 0.1 }, cameraFar: { value: 60 },
        focusDist: { value: 3 }, focusRange: { value: 2 }, maxBlur: { value: 4 }, time: { value: 0 }, grain: { value: 0.02 }, vignette: { value: 0.17 }, bloom: { value: 0.3 }, shimmer: { value: 0 }, shimmerX: { value: 0.7 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tColor, tDepth; uniform vec2 resolution; uniform float cameraNear, cameraFar, focusDist, focusRange, maxBlur, time, grain, vignette, shimmer, shimmerX, bloom;
        varying vec2 vUv;
        float linDepth(float d){ float z = d * 2.0 - 1.0; return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear)); }
        void main(){
          vec2 px = 1.0 / resolution;
          float band = smoothstep(0.0, 0.18, 0.18 - abs(vUv.x - shimmerX)) * smoothstep(0.1, 0.55, vUv.y);
          vec2 uv = vUv + vec2(sin(vUv.y * 52.0 + time * 2.6) * 0.0012 + sin(vUv.y * 19.0 - time * 1.4) * 0.0018, 0.0) * band * shimmer;
          float depth = linDepth(texture2D(tDepth, uv).x);
          float coc = smoothstep(0.0, 1.0, abs(depth - focusDist) / focusRange) * maxBlur;
          vec2 taps[12];
          taps[0]=vec2(-0.326,-0.406); taps[1]=vec2(-0.840,-0.074); taps[2]=vec2(-0.696,0.457); taps[3]=vec2(-0.203,0.621);
          taps[4]=vec2(0.962,-0.195); taps[5]=vec2(0.473,-0.480); taps[6]=vec2(0.519,0.767); taps[7]=vec2(0.185,-0.893);
          taps[8]=vec2(0.507,0.064); taps[9]=vec2(0.896,0.412); taps[10]=vec2(-0.322,-0.933); taps[11]=vec2(-0.792,-0.598);
          vec3 col = texture2D(tColor, uv).rgb;
          if (maxBlur > 0.05) {
            float tot = 1.0;
            for (int i = 0; i < 12; i++) {
              vec2 o = taps[i] * coc * px;
              float dd = linDepth(texture2D(tDepth, uv + o).x);
              float w = mix(0.35, 1.0, smoothstep(0.0, 1.0, abs(dd - focusDist) / focusRange));
              col += texture2D(tColor, uv + o).rgb * w; tot += w;
            }
            col /= tot;
          }
          vec3 bl = vec3(0.0);
          for (int i = 0; i < 12; i++) { vec3 sb = texture2D(tColor, uv + taps[i] * px * 26.0).rgb; bl += max(sb - vec3(1.0), 0.0); }
          col += bl / 12.0 * bloom;
          #include <tonemapping_fragment>
          vec2 q = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
          col *= mix(1.0 - vignette, 1.0, smoothstep(1.25, 0.4, length(q)));
          float n = fract(sin(dot(vUv * resolution + vec2(time * 37.0, time * 91.0), vec2(12.9898, 78.233))) * 43758.5453);
          col += (n - 0.5) * grain;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`
    });
    const postScene = new THREE.Scene(); postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const scene = new THREE.Scene();
    scene.background = (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#070605'); g.addColorStop(0.42, '#14110c'); g.addColorStop(0.68, '#241b12'); g.addColorStop(0.86, '#120f0b'); g.addColorStop(1, '#0a0806');
      x.fillStyle = g; x.fillRect(0, 0, 64, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping; return t;
    })();
    scene.fog = new THREE.Fog(BG, 5, 12);
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 40);

    // ── studio environment for the metals and glazes
    {
      const pm = new THREE.PMREMGenerator(renderer);
      const env = new THREE.Scene();
      env.add(new THREE.Mesh(new THREE.SphereGeometry(30, 16, 10), new THREE.MeshBasicMaterial({ color: 0x14110d, side: THREE.BackSide })));
      const panel = (w, h, x, y, z, r, g, b) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
      panel(14, 8, 0, 9, 1, 15, 13, 10.5); panel(6, 12, -9, 1, -2, 2.4, 3.2, 4.6); panel(5, 10, 9, 0, 3, 8.5, 5.4, 2.6); panel(16, 6, 0, -8, 0, 0.7, 0.6, 0.5);
      scene.environment = pm.fromScene(env, 0.04).texture; pm.dispose();
    }
    scene.add(new THREE.HemisphereLight(0xfff3e0, 0x221c14, 0.7));
    const key = new THREE.DirectionalLight(0xffeccf, 2.4); key.position.set(3, 6, 4); scene.add(key);
    key.castShadow = true; key.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.015; key.shadow.radius = 3;
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -5, near: 1, far: 20 }); key.shadow.camera.updateProjectionMatrix();
    const rim = new THREE.DirectionalLight(0xffc98a, 1.7); rim.position.set(-3, -1, 5); scene.add(rim);

    // ── textures and materials
    const noiseTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
      const img = x.createImageData(256, 256), d = img.data, r = rng(7);
      for (let i = 0; i < d.length; i += 4) { const v = 150 + Math.floor(r() * 70); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      x.putImageData(img, 0, 0); x.globalAlpha = 0.5; for (let k = 0; k < 3; k++) x.drawImage(c, (k - 1) * 1.5, k - 1);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
    })();
    // meat strata: horizontal bands of roast, fat and char with grain
    const [meatTex, meatRough] = (() => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const x = c.getContext('2d');
      const cr = document.createElement('canvas'); cr.width = 1024; cr.height = 1024; const xr = cr.getContext('2d');
      const r = rng(31);
      x.fillStyle = '#6e3a20'; x.fillRect(0, 0, 1024, 1024); xr.fillStyle = '#9a9a9a'; xr.fillRect(0, 0, 1024, 1024);
      const band = (ctx, y0, y1, ph) => { ctx.beginPath(); ctx.moveTo(0, y0); for (let xx = 0; xx <= 1024; xx += 16) ctx.lineTo(xx, y0 + Math.sin(xx * 0.021 + ph) * 3.5 + Math.sin(xx * 0.0071 + ph * 2.3) * 5); ctx.lineTo(1024, y1); for (let xx = 1024; xx >= 0; xx -= 16) ctx.lineTo(xx, y1 + Math.sin(xx * 0.019 + ph + 1.1) * 3.5 + Math.sin(xx * 0.0066 + ph * 1.7) * 5); ctx.closePath(); ctx.fill(); };
      for (let y = 0, i = 0; y < 1040; i++) {
        const hgt = 12 + r() * 26, kind = r(), ph = r() * 9;
        const col = kind < 0.14 ? '#e2c19a' : kind < 0.26 ? '#3f1d10' : kind < 0.5 ? '#9a4f2a' : kind < 0.75 ? '#7d3f22' : '#b0633a';
        x.fillStyle = col; band(x, y, y + hgt, ph);
        xr.fillStyle = kind < 0.14 ? '#4a4a4a' : kind < 0.26 ? '#e0e0e0' : '#a8a8a8'; band(xr, y, y + hgt, ph);
        x.fillStyle = 'rgba(0,0,0,.42)'; band(x, y + hgt - 2.5, y + hgt + 0.5, ph);
        if (kind < 0.14) { x.fillStyle = 'rgba(255,240,215,.35)'; band(x, y + 2, y + 4, ph); }
        y += hgt;
      }
      x.globalAlpha = 0.28;
      for (let i = 0; i < 14000; i++) { x.fillStyle = r() < 0.55 ? '#1a0a05' : '#f4d1a8'; x.fillRect(r() * 1024, r() * 1024, 1 + r() * 3, 1 + r() * 2); }
      x.globalAlpha = 0.16;
      for (let i = 0; i < 40; i++) { const xx = r() * 1024, yy = r() * 1024; const g = x.createLinearGradient(0, yy, 0, yy + 120 + r() * 200); g.addColorStop(0, 'rgba(40,15,5,0)'); g.addColorStop(0.3, 'rgba(40,15,5,1)'); g.addColorStop(1, 'rgba(40,15,5,0)'); x.fillStyle = g; x.fillRect(xx, yy, 2 + r() * 5, 320); }
      x.globalAlpha = 1;
      const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1); t.anisotropy = 8; return t; };
      return [mk(c, true), mk(cr, false)];
    })();
    const tileTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d'); const r = rng(19);
      x.fillStyle = '#0c0b0a'; x.fillRect(0, 0, 1024, 1024);
      for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) {
        const X = tx * 128 + 4, Y = ty * 128 + 4, v = r();
        const g = x.createLinearGradient(X, Y, X + 120, Y + 120);
        g.addColorStop(0, `rgb(${40 + v * 10},${36 + v * 8},${31 + v * 6})`); g.addColorStop(1, `rgb(${22 + v * 8},${20 + v * 6},${17 + v * 5})`);
        x.fillStyle = g; x.fillRect(X, Y, 120, 120);
        x.fillStyle = 'rgba(255,240,220,.06)'; x.fillRect(X, Y, 120, 3); x.fillRect(X, Y, 3, 120);
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.5, 2); t.anisotropy = 8; return t;
    })();
    const woodTex = (() => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d'); const r = rng(11);
      x.fillStyle = '#4a2f1c'; x.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(${18 + r() * 50},${9 + r() * 26},${4 + r() * 12},${0.18 + r() * 0.42})`; x.lineWidth = 0.4 + r() * 2.6; x.beginPath(); const y0 = r() * 512; x.moveTo(0, y0); for (let xx = 0; xx <= 1024; xx += 32) x.lineTo(xx, y0 + Math.sin(xx * 0.004 + i) * 9 + Math.sin(xx * 0.017 + i * 2) * 1.6 + (r() - 0.5) * 2); x.stroke(); }
      for (let i = 0; i < 5; i++) { const kx = r() * 1024, ky = r() * 512; for (let k = 6; k > 0; k--) { x.strokeStyle = `rgba(20,10,4,${0.12 + k * 0.03})`; x.lineWidth = 1.2; x.beginPath(); x.ellipse(kx, ky, k * 9, k * 4.5, 0.3, 0, 6.29); x.stroke(); } }
      for (let i = 0; i < 7; i++) { x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(0, i * 74 + 60, 1024, 1.5); x.fillStyle = 'rgba(255,225,190,.07)'; x.fillRect(0, i * 74 + 61.5, 1024, 1); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    })();
    const roughen = (geo, amp, freq, extra) => {
      const pos = geo.attributes.position, v = new THREE.Vector3(); geo.computeVertexNormals(); const nrm = geo.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n = Math.sin(v.x * freq) * Math.sin(v.y * freq * 1.37 + 1.7) * Math.sin(v.z * freq * 0.91 + 3.1) + 0.45 * Math.sin(v.x * freq * 2.3 + 0.6) * Math.sin(v.z * freq * 2.1 + 2.2) + (extra ? extra(v) / amp : 0);
        pos.setXYZ(i, v.x + nrm.getX(i) * n * amp, v.y + nrm.getY(i) * n * amp, v.z + nrm.getZ(i) * n * amp);
      }
      geo.computeVertexNormals(); return geo;
    };
    const phys = (o) => new THREE.MeshPhysicalMaterial(o);
    const M = {
      steel: phys({ color: 0xb4b9be, metalness: 1, roughness: 0.42, roughnessMap: noiseTex, envMapIntensity: 1.15 }),
      steelDark: phys({ color: 0x6d7378, metalness: 1, roughness: 0.55, roughnessMap: noiseTex, envMapIntensity: 0.9 }),
      housing: phys({ color: 0x24211d, roughness: 0.6, bumpMap: noiseTex, bumpScale: 0.01, envMapIntensity: 0.5 }),
      reflector: phys({ color: 0x7a6a56, metalness: 1, roughness: 0.5, envMapIntensity: 0.9 }),
      bar: new THREE.MeshStandardMaterial({ color: 0x4a1408, emissive: 0xff4e0e, emissiveIntensity: 2.4, roughness: 0.9 }),
      meat: phys({ map: meatTex, roughnessMap: meatRough, roughness: 1, bumpMap: meatTex, bumpScale: 0.035, clearcoat: 0.55, clearcoatRoughness: 0.34, anisotropy: 0.65, anisotropyRotation: Math.PI / 2, sheen: 0.4, sheenColor: new THREE.Color(0xffb680), sheenRoughness: 0.5, specularIntensity: 1, envMapIntensity: 0.95 }),
      slice: phys({ map: meatTex, roughnessMap: meatRough, roughness: 1, bumpMap: meatTex, bumpScale: 0.02, clearcoat: 0.3, clearcoatRoughness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.7 }),
      crust: phys({ color: 0x4a2012, roughness: 0.75, bumpMap: noiseTex, bumpScale: 0.025, clearcoat: 0.2, envMapIntensity: 0.5 }),
      porcelain: phys({ color: 0xe6dfd0, roughness: 0.32, roughnessMap: noiseTex, clearcoat: 0.7, clearcoatRoughness: 0.22, envMapIntensity: 0.6, side: THREE.DoubleSide }),
      tile: phys({ map: tileTex, roughness: 0.3, bumpMap: tileTex, bumpScale: 0.012, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.7 }),
      harissa: phys({ color: 0xb42e18, roughness: 0.22, clearcoat: 0.95, clearcoatRoughness: 0.15, envMapIntensity: 0.8 }),
      parsley: phys({ color: 0x2f5a22, roughness: 0.5, clearcoat: 0.3, side: THREE.DoubleSide }),
      wax: phys({ color: 0xf1e6cf, roughness: 0.5, transmission: 0, sheen: 0.6, sheenColor: new THREE.Color(0xfff2dd) }),
      flame: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb347).multiplyScalar(6), toneMapped: true }),
      plateRim: phys({ color: 0xc2a15c, metalness: 0.9, roughness: 0.4, envMapIntensity: 1 }),
      fries: phys({ color: 0xe0ad55, roughness: 0.55, bumpMap: noiseTex, bumpScale: 0.012, clearcoat: 0.25, clearcoatRoughness: 0.6 }),
      leaf: phys({ color: 0x4f7d34, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
      leafPale: phys({ color: 0x9ab85a, roughness: 0.5, clearcoat: 0.3, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
      cucumber: phys({ color: 0xcfe2a0, roughness: 0.35, clearcoat: 0.6, side: THREE.DoubleSide }),
      tomato: phys({ color: 0xb8301c, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.2, sheen: 0.3, sheenColor: new THREE.Color(0xff8866) }),
      onion: phys({ color: 0xe6dff0, roughness: 0.42, clearcoat: 0.5, side: THREE.DoubleSide }),
      bread: phys({ color: 0xd6ab7a, roughness: 0.8, bumpMap: noiseTex, bumpScale: 0.02, sheen: 0.25, sheenColor: new THREE.Color(0xfff0d8) }),
      yoghurt: phys({ color: 0xf3ede2, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.2 }),
      lemon: phys({ color: 0xdcc04e, roughness: 0.4, clearcoat: 0.6 }),
      wood: phys({ map: woodTex, color: 0x9a8570, roughness: 0.78, bumpMap: woodTex, bumpScale: 0.006, envMapIntensity: 0.35 }),
      glass: lowPower ? phys({ color: 0xeef2f4, roughness: 0.05, transparent: true, opacity: 0.28, side: THREE.DoubleSide, envMapIntensity: 1.2 }) : phys({ color: 0xffffff, roughness: 0.04, transmission: 1, thickness: 0.06, ior: 1.5, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
      tea: phys({ color: 0x8e3a16, roughness: 0.15, clearcoat: 0.8 }),
      copper: phys({ color: 0xa06a43, metalness: 1, roughness: 0.48, roughnessMap: noiseTex, envMapIntensity: 0.9 }),
      counter: phys({ color: 0x33363b, metalness: 1, roughness: 0.46, roughnessMap: noiseTex, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 0.5 }),
      napkin: phys({ color: 0x7b2418, roughness: 0.9 }),
      mince: phys({ color: 0x6e2a16, roughness: 0.85, bumpMap: noiseTex, bumpScale: 0.03, envMapIntensity: 0.4 })
    };
    const put = (geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };
    // steam: soft points rising from a local cloud of seeds
    const steamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: { value: 0 }, scale: { value: 300 }, rise: { value: 0.9 }, strength: { value: 1 }, tint: { value: new THREE.Color(0xffe3c4) } },
      vertexShader: 'attribute float seed; uniform float time, scale, rise; varying float vA; void main(){ float life = fract(time * 0.14 + seed); vec3 p = position; p.y += life * rise; p.x += sin(life * 5.0 + seed * 40.0) * 0.09 * rise * life; p.z += cos(life * 4.0 + seed * 30.0) * 0.07 * rise * life; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (0.06 + life * 0.3) * rise * scale / -mv.z; vA = sin(life * 3.14159) * (1.0 - life * 0.55); }',
      fragmentShader: 'uniform vec3 tint; uniform float strength; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.08, d) * vA * 0.14 * strength; gl_FragColor = vec4(tint, a); }' });
    const steams = [];
    const steam = (parent, n, seedFn, rise, strength) => {
      const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), sd = new Float32Array(n), r = rng(n);
      for (let i = 0; i < n; i++) { const p = seedFn(r); pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; sd[i] = r(); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
      const m = steamMat.clone(); m.uniforms.rise.value = rise; m.uniforms.strength.value = strength;
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; parent.add(pts); steams.push(pts); return pts;
    };
    const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
    const dust = (() => {
      const n = lowPower ? 120 : 260, g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), sd = new Float32Array(n), r = rng(23);
      for (let i = 0; i < n; i++) { pos[i * 3] = (r() - 0.5) * 8; pos[i * 3 + 1] = -1.6 + r() * 5.2; pos[i * 3 + 2] = -3 + r() * 6.5; sd[i] = r(); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { time: { value: 0 }, scale: { value: 300 } },
        vertexShader: 'attribute float seed; uniform float time, scale; varying float vA; void main(){ vec3 p = position; p.x += sin(time * 0.11 + seed * 31.0) * 0.4; p.y += sin(time * 0.07 + seed * 57.0) * 0.3 + mod(time * 0.02 + seed, 1.0) * 0.3; p.z += cos(time * 0.09 + seed * 19.0) * 0.35; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (0.8 + seed * 1.6) * scale / -mv.z; vA = 0.25 + 0.75 * abs(sin(seed * 22.0 + time * 0.55)); }',
        fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(1.0, 0.82, 0.6, smoothstep(0.5, 0.0, d) * vA * 0.09); }' });
      const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); return p;
    })();

    const prof = t => 0.15 + 0.36 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - 0.2 * t);
    // ── the döner station
    const station = new THREE.Group(); scene.add(station);
    {
      put(new THREE.PlaneGeometry(6, 5), M.tile, station, 0, 0.6, -1.3);
      put(new THREE.BoxGeometry(3.2, 0.1, 1.3), M.counter, station, 0.3, -1.42, -0.2);
      put(new THREE.BoxGeometry(3.2, 1.3, 1.2), M.housing, station, 0.3, -2.12, -0.25);
      [-0.66, 0.66].forEach(x => put(new THREE.BoxGeometry(0.06, 2.75, 0.06), M.steel, station, x, -0.05, -0.42));
      put(new THREE.BoxGeometry(1.38, 0.06, 0.06), M.steel, station, 0, 1.33, -0.42);
      put(new THREE.BoxGeometry(1.1, 2.36, 0.16), M.housing, station, 0, 0, -0.52);
      put(new THREE.BoxGeometry(1.0, 2.26, 0.015), M.reflector, station, 0, 0, -0.43);
      const bars = []; for (let i = 0; i < 6; i++) bars.push(put(new THREE.BoxGeometry(0.88, 0.05, 0.04), M.bar, station, 0, -0.92 + i * 0.37, -0.4));
      put(new THREE.CylinderGeometry(0.017, 0.017, 2.7, 14), M.steel, station, 0, 0, 0);
      put(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 20), M.steelDark, station, 0, 1.3, 0);
      put(new THREE.CylinderGeometry(0.11, 0.13, 0.06, 24), M.steelDark, station, 0, -1.22, 0);
      // one continuous cone of meat, textured with strata and roughened
      const profPts = []; for (let i = 0; i <= 28; i++) { const t = i / 28; profPts.push([0.15 + 0.36 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - 0.2 * t) + (i === 0 || i === 28 ? -0.14 : 0), -1.05 + t * 2.1]); }
      profPts[0][0] = 0.06; profPts[28][0] = 0.05;
      const meatGeo = roughen(new THREE.LatheGeometry(profPts.map(p => new THREE.Vector2(p[0], p[1])), 128), 0.018, 9, v => {
        let a = Math.atan2(v.z, v.x) - 0.99; while (a > Math.PI) a -= 6.283185; while (a < -Math.PI) a += 6.283185;
        const flank = Math.exp(-(a / 0.62) * (a / 0.62));
        return Math.sin(v.y * 74) * 0.0035 * (1 - 0.7 * flank)
          + 0.005 * Math.sin(v.y * 21 + Math.atan2(v.z, v.x) * 3) * (1 - flank)
          - 0.024 * flank
          + Math.sin(v.y * 165) * 0.0016 * flank;
      });
      const meat = put(meatGeo, M.meat, station, 0, 0, 0); station.userData.meat = meat;
      // drip tray + lamp
      put(new THREE.BoxGeometry(0.9, 0.035, 0.5), M.steel, station, 0.05, -1.3, 0.55);
      const lamp = new THREE.PointLight(0xff7a33, 6.5, 5.4, 2); lamp.position.set(0, 0, -0.05); station.add(lamp);
      const graze = new THREE.SpotLight(0xffd9a6, 18, 4.6, 0.75, 0.9, 1.6); graze.position.set(1.05, 0.95, 1.15); graze.target.position.set(0, 0.05, 0); station.add(graze); station.add(graze.target); station.userData.graze = graze;
      const gloss = new THREE.PointLight(0xfff0d8, 1.4, 2.6, 2); gloss.position.set(0.42, 0.25, 0.62); station.add(gloss); station.userData.gloss = gloss;
      steam(station, 70, r => { const t = 0.35 + r() * 0.62, a = r() * 6.283, rr = prof(t) + 0.03; return [Math.cos(a) * rr, -1.05 + t * 2.1, Math.sin(a) * rr]; }, 1.0, 1);
      const drips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 10, 8), phys({ color: 0x8a5a2c, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.1 }), 7);
      drips.castShadow = false; station.add(drips); station.userData.drips = drips;
      station.userData.bars = bars; station.userData.lamp = lamp;
      // the knife: blade + handle, animated along the cone
      const knife = new THREE.Group(); station.add(knife); station.userData.knife = knife;
      put(new THREE.BoxGeometry(0.5, 0.005, 0.085), M.steel, knife, 0.02, 0, 0);
      put(new THREE.BoxGeometry(0.5, 0.012, 0.02), M.steelDark, knife, 0.02, 0.006, -0.04);
      put(new THREE.CapsuleGeometry(0.02, 0.15, 6, 12), M.wood, knife, 0.36, 0, 0, 0, 0, Math.PI / 2);
    }

    // ── the plate, and everything that lands on it
    const plateGeo = lathe([[0, 0.012], [0.22, 0.008], [0.3, 0.02], [0.4, 0.05], [0.44, 0.062], [0.446, 0.068], [0.436, 0.068], [0.42, 0.045], [0.31, 0.03], [0.2, 0.024], [0, 0.03]], 80);
    const rimGeo = new THREE.TorusGeometry(0.415, 0.004, 8, 96);
    const bowlGeo = lathe([[0, 0], [0.06, 0.004], [0.13, 0.05], [0.163, 0.11], [0.17, 0.132], [0.162, 0.133], [0.15, 0.056], [0.056, 0.016], [0, 0.012]], 40);
    const smallBowlGeo = lathe([[0, 0], [0.04, 0.003], [0.085, 0.035], [0.105, 0.08], [0.11, 0.092], [0.103, 0.093], [0.096, 0.04], [0.036, 0.012], [0, 0.01]], 36);
    const plate = new THREE.Group(); scene.add(plate);
    const sliceGeo = (() => { const g = new THREE.BoxGeometry(0.17, 0.006, 0.11, 8, 1, 5), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, p.getY(i) + 0.02 * Math.pow(Math.abs(x) / 0.085, 2) + 0.008 * Math.pow(Math.abs(z) / 0.055, 2)); } return roughen(g, 0.004, 40); })();
    {
      put(plateGeo, M.porcelain, plate, 0, 0, 0);
      put(rimGeo, M.plateRim, plate, 0, 0.064, 0, Math.PI / 2, 0, 0);
      // the pile that has already landed
      const pile = new THREE.Group(); plate.add(pile); plate.userData.pile = pile;
      const r = rng(5);
      for (let i = 0; i < 14; i++) { const s = put(sliceGeo, i % 4 === 3 ? M.crust : M.slice, pile, -0.02 + (r() - 0.5) * 0.2, 0.036 + i * 0.0085, 0.02 + (r() - 0.5) * 0.16); s.rotation.set((r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3); }
      // dressing: fries (instanced), salad, tomato, onion, bread, yoghurt, lemon — each with its own arrival
      const dress = new THREE.Group(); plate.add(dress); plate.userData.dress = dress;
      const arrivals = [];
      const fries = new THREE.InstancedMesh(new THREE.BoxGeometry(0.024, 0.024, 0.2), M.fries, 26);
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
      for (let i = 0; i < 26; i++) { const ang = i * 2.39996, rr = 0.11 * Math.sqrt((i + 0.5) / 26); e.set(0.9 + r() * 0.6, ang, (r() - 0.5) * 0.8); q.setFromEuler(e); v.set(0.2 + Math.cos(ang) * rr, 0.06 + (i % 5) * 0.022, -0.06 + Math.sin(ang) * rr * 0.8); mtx.compose(v, q, new THREE.Vector3(1, 1, 1)); fries.setMatrixAt(i, mtx); }
      for (let i = 0; i < 26; i++) { fries.getMatrixAt(i, mtx); mtx.scale(new THREE.Vector3(1, 1, 0.7 + r() * 0.5)); fries.setMatrixAt(i, mtx); fries.setColorAt(i, new THREE.Color().setHSL(0.085 + r() * 0.03, 0.62, 0.5 + r() * 0.14)); }
      fries.instanceMatrix.needsUpdate = true; fries.castShadow = fries.receiveShadow = true; dress.add(fries); arrivals.push({ o: fries, at: 0.0, y: fries.position.y });
      const leafGeo = roughen(new THREE.CircleGeometry(0.075, 14), 0.018, 34);
      for (let i = 0; i < 8; i++) { const l = put(leafGeo, i % 3 === 2 ? M.leafPale : M.leaf, dress, -0.2 + Math.cos(i * 1.9) * 0.12, 0.045 + (i % 3) * 0.014, 0.12 + Math.sin(i * 1.9) * 0.1, -Math.PI / 2 + (r() - 0.5) * 0.9, 0, r() * 6.28); l.scale.set(1 + r() * 0.5, 0.8 + r() * 0.5, 1); arrivals.push({ o: l, at: 0.1 + i * 0.035, y: l.position.y }); }
      for (let i = 0; i < 3; i++) { const cu = put(new THREE.CylinderGeometry(0.038, 0.038, 0.006, 20), M.cucumber, dress, -0.3 + i * 0.06, 0.07, 0.06 + i * 0.05, 0.4 * (i - 1), i, 0.2); arrivals.push({ o: cu, at: 0.28 + i * 0.04, y: cu.position.y }); }
      for (let i = 0; i < 3; i++) { const t = put(new THREE.SphereGeometry(0.045, 16, 12, 0, 6.28, 0, Math.PI / 2), M.tomato, dress, -0.26 + i * 0.09, 0.062, 0.2 - i * 0.03); t.scale.y = 0.7; arrivals.push({ o: t, at: 0.36 + i * 0.05, y: t.position.y }); }
      for (let i = 0; i < 4; i++) { const o = put(new THREE.TorusGeometry(0.035, 0.005, 6, 18, Math.PI * 1.3), M.onion, dress, -0.1 + i * 0.05, 0.075, 0.17 + Math.sin(i) * 0.03, Math.PI / 2, i * 0.7, 0); arrivals.push({ o, at: 0.5 + i * 0.04, y: o.position.y }); }
      const bread = put(roughen(new THREE.BoxGeometry(0.26, 0.09, 0.16, 6, 3, 4), 0.01, 22), M.bread, dress, 0.22, 0.07, 0.2, 0, -0.5, 0); arrivals.push({ o: bread, at: 0.64, y: bread.position.y });
      const yog = put(roughen(new THREE.SphereGeometry(0.07, 18, 12), 0.006, 14), M.yoghurt, dress, -0.16, 0.06, -0.16); yog.scale.y = 0.65; arrivals.push({ o: yog, at: 0.78, y: yog.position.y });
      const lem = put(lathe([[0, 0], [0.07, 0.008], [0.068, 0.04], [0.04, 0.062], [0, 0.066]], 20), M.lemon, dress, 0.12, 0.05, 0.26, 0.3, 0, 0.4); arrivals.push({ o: lem, at: 0.9, y: lem.position.y });
      const sPts = []; for (let i = 0; i <= 12; i++) sPts.push(new THREE.Vector3(-0.09 + i * 0.016, 0.16 + Math.sin(i * 0.9) * 0.008 - Math.abs(i - 6) * 0.004, 0.02 + Math.sin(i * 1.9) * 0.07));
      const sauce = put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sPts), 48, 0.0065, 8), M.harissa, dress); arrivals.push({ o: sauce, at: 0.96, y: sauce.position.y });
      const pGeo = roughen(new THREE.CircleGeometry(0.018, 8), 0.005, 90);
      for (let i = 0; i < 7; i++) { const pl = put(pGeo, M.parsley, dress, -0.02 + (r() - 0.5) * 0.22, 0.165 + (r() - 0.5) * 0.02, 0.02 + (r() - 0.5) * 0.18, -Math.PI / 2 + (r() - 0.5) * 1.2, 0, r() * 6.28); arrivals.push({ o: pl, at: 0.86 + i * 0.012, y: pl.position.y }); }
      steam(plate, 30, r => { const a = r() * 6.283, rr = r() * 0.1; return [-0.02 + Math.cos(a) * rr, 0.15, 0.02 + Math.sin(a) * rr]; }, 0.4, 0.7);
      plate.userData.arrivals = arrivals;
    }
    // slices in flight: three, looping from the knife to the pile
    const flight = []; for (let i = 0; i < 3; i++) { const s = put(sliceGeo, M.slice, scene); s.scale.setScalar(1.15); flight.push({ m: s, off: i / 3 }); }

    // ── the table: oak top, tea glass, cacık bowl, folded napkin, bread basket
    const table = new THREE.Group(); scene.add(table);
    {
      put(new THREE.BoxGeometry(4.2, 0.08, 2.4), M.wood, table, 0, -0.04, 0);
      put(new THREE.BoxGeometry(4.2, 0.03, 0.06), M.steelDark, table, 0, -0.095, 1.17);
      put(lathe([[0, 0.012], [0.05, 0.004], [0.095, 0.008], [0.12, 0.026], [0.128, 0.042], [0.126, 0.046], [0.112, 0.03], [0.088, 0.018], [0.05, 0.014], [0, 0.02]], 40), M.copper, table, 0.85, 0, -0.35);
      put(lathe([[0, 0], [0.048, 0], [0.056, 0.01], [0.05, 0.026], [0.04, 0.062], [0.069, 0.118], [0.056, 0.165], [0.064, 0.206], [0.062, 0.216], [0.056, 0.212], [0.048, 0.168], [0.062, 0.12], [0.033, 0.064], [0.043, 0.024], [0.046, 0.012], [0, 0.008]], 40), M.glass, table, 0.85, 0.02, -0.35);
      put(new THREE.CylinderGeometry(0.05, 0.036, 0.1, 24), M.tea, table, 0.85, 0.09, -0.35);
      const dishes = []; table.userData.dishes = dishes;
      const dish = (x, z, ry, at) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; table.add(g); dishes.push({ o: g, at }); return g; };
      const r2 = rng(77);
      { const g = dish(0.5, -0.78, 0, 0.05); put(bowlGeo, M.porcelain, g); put(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 32), M.yoghurt, g, 0, 0.11, 0); put(new THREE.CylinderGeometry(0.038, 0.038, 0.005, 16), M.cucumber, g, 0.04, 0.122, 0.02, 0.2, 0.4, 0); for (let i = 0; i < 4; i++) put(roughen(new THREE.CircleGeometry(0.016, 8), 0.004, 90), M.parsley, g, (r2() - 0.5) * 0.15, 0.123, (r2() - 0.5) * 0.15, -Math.PI / 2, 0, r2() * 6); }
      // second döner plate
      { const g = dish(-1.15, -0.35, 2.1, 0.12); const c = plate.clone(); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0);
        c.traverse(o => { if (o.isPoints) o.visible = false; }); g.add(c);
        steam(g, 24, r => { const a = r() * 6.283, rr = r() * 0.09; return [Math.cos(a) * rr, 0.15, Math.sin(a) * rr]; }, 0.35, 0.6); }
      // lahmacun
      { const g = dish(1.4, 0.25, -0.4, 0.22); put(roughen(new THREE.CylinderGeometry(0.29, 0.28, 0.012, 48, 1), 0.006, 20), M.bread, g, 0, 0.006, 0); put(roughen(new THREE.CylinderGeometry(0.245, 0.24, 0.008, 40, 1), 0.006, 30), M.mince, g, 0, 0.016, 0); for (let i = 0; i < 6; i++) put(roughen(new THREE.CircleGeometry(0.018, 8), 0.005, 90), M.parsley, g, (r2() - 0.5) * 0.36, 0.024, (r2() - 0.5) * 0.36, -Math.PI / 2, 0, r2() * 6); const lm = put(lathe([[0, 0], [0.07, 0.008], [0.068, 0.04], [0.04, 0.062], [0, 0.066]], 20), M.lemon, g, 0.2, 0.02, 0.16, 0.3, 0, 0.4); lm.scale.setScalar(0.8); }
      // pide
      { const g = dish(-1.3, 0.62, 0.5, 0.3); const b = put(roughen(new THREE.SphereGeometry(0.3, 28, 18), 0.008, 18), M.bread, g, 0, 0.04, 0); b.scale.set(1.6, 0.2, 0.55); const f = put(roughen(new THREE.SphereGeometry(0.22, 20, 12), 0.006, 20), M.mince, g, 0, 0.055, 0); f.scale.set(1.5, 0.1, 0.4); put(roughen(new THREE.SphereGeometry(0.03, 12, 10), 0.003, 40), M.yoghurt, g, 0.1, 0.075, 0).scale.set(1.5, 0.4, 1); }
      // çoban salad
      { const g = dish(0.95, 0.88, 0.3, 0.4); put(plateGeo, M.porcelain, g).scale.setScalar(0.75); put(rimGeo, M.plateRim, g, 0, 0.048, 0, Math.PI / 2, 0, 0).scale.setScalar(0.75);
        for (let i = 0; i < 6; i++) { const t = put(new THREE.SphereGeometry(0.04, 16, 12), M.tomato, g, (r2() - 0.5) * 0.3, 0.06, (r2() - 0.5) * 0.3); t.scale.set(1, 0.8, 1); }
        for (let i = 0; i < 6; i++) put(new THREE.CylinderGeometry(0.032, 0.032, 0.008, 18), M.cucumber, g, (r2() - 0.5) * 0.34, 0.05 + r2() * 0.03, (r2() - 0.5) * 0.34, r2() * 0.8, r2() * 3, r2() * 0.6);
        for (let i = 0; i < 4; i++) put(new THREE.TorusGeometry(0.03, 0.004, 6, 18, Math.PI * 1.4), M.onion, g, (r2() - 0.5) * 0.3, 0.075, (r2() - 0.5) * 0.3, Math.PI / 2 + (r2() - 0.5), r2() * 3, 0);
        for (let i = 0; i < 6; i++) put(roughen(new THREE.CircleGeometry(0.02, 8), 0.005, 90), M.parsley, g, (r2() - 0.5) * 0.3, 0.06 + r2() * 0.03, (r2() - 0.5) * 0.3, -Math.PI / 2 + (r2() - 0.5), 0, r2() * 6); }
      // bread basket
      { const g = dish(-0.15, -0.98, 0.2, 0.5); put(lathe([[0, 0], [0.18, 0.004], [0.24, 0.09], [0.25, 0.1], [0.242, 0.1], [0.232, 0.09], [0.17, 0.012], [0, 0.01]], 40), M.copper, g); for (let i = 0; i < 3; i++) { const b = put(roughen(new THREE.SphereGeometry(0.12, 20, 14), 0.008, 24), M.bread, g, (i - 1) * 0.1, 0.07 + Math.abs(i - 1) * 0.02, (i - 1) * 0.04, 0.3 * (i - 1), i, 0.2); b.scale.set(1, 0.55, 0.7); } }
      // mezze: ezme and haydari
      { const g = dish(0.42, 0.82, 0, 0.6); put(smallBowlGeo, M.porcelain, g); put(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 28), M.harissa, g, 0, 0.075, 0); put(roughen(new THREE.CircleGeometry(0.016, 8), 0.004, 90), M.parsley, g, 0.02, 0.083, -0.02, -Math.PI / 2, 0, 1); }
      { const g = dish(-0.6, 0.9, 0, 0.7); put(smallBowlGeo, M.porcelain, g); put(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 28), M.yoghurt, g, 0, 0.075, 0); put(new THREE.SphereGeometry(0.012, 8, 8), M.harissa, g, 0, 0.082, 0).scale.set(2, 0.4, 2); }
      { const g = dish(1.45, -0.6, 0, 0.8); put(lathe([[0, 0.012], [0.05, 0.004], [0.095, 0.008], [0.12, 0.026], [0.128, 0.042], [0.126, 0.046], [0.112, 0.03], [0.088, 0.018], [0.05, 0.014], [0, 0.02]], 40), M.copper, g); put(lathe([[0, 0], [0.048, 0], [0.056, 0.01], [0.05, 0.026], [0.04, 0.062], [0.069, 0.118], [0.056, 0.165], [0.064, 0.206], [0.062, 0.216], [0.056, 0.212], [0.048, 0.168], [0.062, 0.12], [0.033, 0.064], [0.043, 0.024], [0.046, 0.012], [0, 0.008]], 40), M.glass, g, 0, 0.02, 0); put(new THREE.CylinderGeometry(0.05, 0.036, 0.1, 24), M.tea, g, 0, 0.09, 0); }
      put(new THREE.BoxGeometry(0.34, 0.012, 0.2), M.napkin, table, 0.72, 0.006, 0.42, 0, 0.35, 0);
      const cut = new THREE.Group(); cut.position.set(0.74, 0.014, 0.64); cut.rotation.y = 0.35; table.add(cut);
      put(new THREE.BoxGeometry(0.22, 0.004, 0.026), M.steel, cut, -0.09, 0, -0.03); put(new THREE.CapsuleGeometry(0.011, 0.14, 4, 10), M.steelDark, cut, 0.11, 0.004, -0.03, 0, 0, Math.PI / 2);
      put(new THREE.BoxGeometry(0.07, 0.004, 0.034), M.steel, cut, -0.16, 0, 0.03); for (let i = 0; i < 4; i++) put(new THREE.BoxGeometry(0.06, 0.004, 0.005), M.steel, cut, -0.22, 0, 0.018 + i * 0.008); put(new THREE.CapsuleGeometry(0.009, 0.15, 4, 10), M.steelDark, cut, -0.03, 0.003, 0.03, 0, 0, Math.PI / 2);
      // tealight
      put(new THREE.CylinderGeometry(0.06, 0.055, 0.075, 28, 1, true), M.glass, table, -0.35, 0.038, -0.6);
      put(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 24), M.wax, table, -0.35, 0.025, -0.6);
      const flame = put(new THREE.SphereGeometry(0.011, 10, 10), M.flame, table, -0.35, 0.075, -0.6); flame.scale.set(1, 2.2, 1); flame.castShadow = false;
      const cl = new THREE.PointLight(0xffa550, 1.8, 2.6, 2); cl.position.set(-0.35, 0.12, -0.6); table.add(cl); table.userData.candle = { flame, light: cl };
      const spot = new THREE.SpotLight(0xffd9a8, 22, 7, 0.55, 0.85, 1.6); spot.position.set(0.2, 3.2, 0.6); spot.target.position.set(0, 0, 0.2); table.add(spot); table.add(spot.target);
      if (!lowPower) { spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0003; spot.shadow.normalBias = 0.02; }
    }

    // ── sizing
    let W = 0, H = 0;
    const measure = () => { const w = this.clientWidth || window.innerWidth, h = this.clientHeight || window.innerHeight; return (w >= 2 && h >= 2) ? [w, h] : null; };
    const resize = () => {
      const m = measure(); if (!m || (m[0] === W && m[1] === H)) return false;
      [W, H] = m; renderer.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
      const pr = renderer.getPixelRatio(); rt.setSize(Math.round(W * pr), Math.round(H * pr)); post.uniforms.resolution.value.set(Math.round(W * pr), Math.round(H * pr));
      return true;
    };
    new ResizeObserver(() => { if (resize()) safeFrame(); }).observe(this);
    window.addEventListener('resize', () => { if (resize()) safeFrame(); });
    resize();

    let track = null, tries = 0;
    const progress = () => {
      if (!track && tries++ % 30 === 0) track = document.querySelector('[data-scene-track]');
      const el = track || document.scrollingElement || document.documentElement;
      if (el.scrollHeight - el.clientHeight > 4) return c01(el.scrollTop / (el.scrollHeight - el.clientHeight));
      return 0;
    };

    // ── adaptive quality
    let quality = lowPower ? 1 : 2, acc = 0, accN = 0;
    const setQuality = (q) => { if (q === quality) return; quality = q; const pr = q >= 2 ? basePR : Math.min(basePR, 1); if (Math.abs(renderer.getPixelRatio() - pr) > 0.01) { renderer.setPixelRatio(pr); W = 0; H = 0; resize(); } };

    let cur = 0, t0 = performance.now(), lastFrame = 0, rafId = 0, focusNow = 0;
    const look = new THREE.Vector3(), tmp = new THREE.Vector3();
    const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    if (matchMedia('(pointer: fine)').matches && !RM) window.addEventListener('pointermove', e => { ptr.tx = (e.clientX / window.innerWidth - 0.5) * 2; ptr.ty = (e.clientY / window.innerHeight - 0.5) * 2; }, { passive: true });
    this._dbg = { renderer, scene, cam, render: () => safeFrame(), get cur() { return cur; } };

    // beats: 0–.22 carve · .22–.5 the plate is dressed · .5–.8 it arrives on the table · .8–1 settle
    const frame = (now) => {
      if (!W || !H) { if (!resize()) return; }
      const tgt = progress();
      cur = RM ? tgt : cur + (tgt - cur) * 0.07;
      if (this._dbg.force != null) cur = this._dbg.force;
      const p = cur, tS = RM ? 0 : (now - t0) / 1000;
      ptr.x += (ptr.tx - ptr.x) * 0.04; ptr.y += (ptr.ty - ptr.y) * 0.04;
      const aspect = W / H, wide = c01((aspect - 0.6) / 0.95);
      cam.fov = aspect < 0.7 ? 60 : aspect < 1 ? 52 : aspect < 1.4 ? 44 : 39;

      // station: right of the title on the first screen, rising away afterwards
      const sx = 0.62 + 1.32 * wide, stationUp = kf(p, [[0.16, 0], [0.42, 3.2]]);
      station.position.set(sx, -0.1 + stationUp, wide < 0.35 ? -1.2 : 0.3);
      station.visible = stationUp < 3.1;
            const spin = tS * 0.235 + Math.sin(tS * 0.47) * 0.018 + Math.sin(tS * 1.9) * 0.0035;
      const mt = station.userData.meat;
      mt.rotation.y = spin;
      mt.rotation.z = 0.022 + Math.cos(spin) * 0.007;
      mt.rotation.x = Math.sin(spin) * 0.006;
      mt.position.x = Math.sin(spin) * 0.004; mt.position.y = Math.sin(spin * 2) * 0.002;
      station.userData.gloss.intensity = 1.4 * (0.8 + 0.2 * Math.cos(spin));
      const flick = RM ? 1 : 0.88 + 0.12 * Math.sin(tS * 7.3) * Math.sin(tS * 3.1);
      station.userData.bars.forEach((b, i) => { b.material.emissiveIntensity = 3.4 * flick * (0.9 + 0.1 * Math.sin(tS * 5 + i)); });
      station.userData.lamp.intensity = 6.5 * flick;
      key.intensity = kf(p, [[0.4, 2.4], [0.7, 1.6]]);
      renderer.toneMappingExposure = kf(p, [[0.4, 1.28], [0.7, 1.08]]);
      const ppx = H * renderer.getPixelRatio() * 1.4;
      for (const s of steams) { s.material.uniforms.time.value = tS % 200; s.material.uniforms.scale.value = ppx; }
      dust.material.uniforms.time.value = tS % 400; dust.material.uniforms.scale.value = ppx * 0.017;
      { const dr = station.userData.drips, dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), dv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < 7; i++) {
          const life = (tS * 0.33 + i / 7) % 1, rel = 0.18 + (i % 3) * 0.22, ang = i * 2.3994 + tS * 0.28;
          const rr = prof(rel) + 0.015, y0 = -1.05 + rel * 2.1;
          const fy = y0 - (y0 + 1.27) * life * life, sq = life < 0.08 ? life / 0.08 : life > 0.94 ? 0 : 1;
          dv.set(Math.cos(ang) * rr, fy, Math.sin(ang) * rr);
          one.set(sq, sq * (1 + life * 0.8), sq); dm.compose(dv, dq, one); dr.setMatrixAt(i, dm);
        }
        dr.instanceMatrix.needsUpdate = true; }
      { const cd = table.userData.candle, fl = RM ? 1 : 0.85 + 0.15 * Math.sin(tS * 9.1) * Math.sin(tS * 4.7) + 0.05 * Math.sin(tS * 23); cd.light.intensity = 1.8 * fl; cd.flame.scale.set(0.9 + 0.2 * fl, 2 + 0.5 * fl, 0.9 + 0.2 * fl); cd.flame.position.x = -0.35 + Math.sin(tS * 6.3) * 0.003; }

      // knife: a 2.2 s stroke down the front of the cone, a quick return
      const kc = (tS % 2.9) / 2.9, down = kc < 0.72 ? smooth(kc / 0.72) : 1 - smooth((kc - 0.72) / 0.28);
      const ky = 0.95 - down * 1.9, kt = c01((ky + 1.05) / 2.1), kr = prof(kt) + 0.02;
      const knife = station.userData.knife;
      knife.position.set(kr * 0.55 + 0.02, ky, kr * 0.84 + 0.02);
      knife.rotation.set(0.12, -0.55, -0.42 + (kc < 0.72 ? 0 : 0.35));

      // plate: under the tray while carving, then to centre stage, then onto the table
      const px = kf(p, [[0.1, sx + 0.06], [0.34, 0.2 + 0.25 * wide], [0.6, 0.08]]);
      const py = kf(p, [[0.1, -1.55], [0.34, -0.55], [0.6, -0.72], [0.74, -0.78]]);
      const pz = kf(p, [[0.1, 0.25], [0.34, 0.9], [0.6, 0.42]]);
      plate.position.set(px, py, pz); plate.visible = p > 0.09;
      plate.rotation.y = kf(p, [[0.2, 0], [0.6, 0.55]]);
      const dressP = c01((p - 0.22) / 0.3);
      for (const a of plate.userData.arrivals) { const e = smooth(c01((dressP - a.at) / 0.12)); a.o.visible = e > 0.001; a.o.position.y = a.y + (1 - e) * 0.9; if (a.o !== plate.userData.arrivals[0].o) a.o.scale.setScalar(0.4 + 0.6 * e); }

      // slices in flight — only while the knife is at work
      const carve = 1 - smooth(c01((p - 0.1) / 0.1));
      for (const f of flight) {
        const u = ((tS * 0.55 + f.off) % 1), fall = u * u;
        const src = tmp.set(station.position.x + knife.position.x * 0.9, station.position.y + ky - 0.05, station.position.z + knife.position.z);
        f.m.position.set(src.x + (plate.position.x - src.x) * u, src.y + (plate.position.y + 0.15 - src.y) * fall, src.z + (plate.position.z - src.z) * u);
        f.m.rotation.set(u * 3.2, f.off * 6, u * 2.1);
        f.m.visible = carve > 0.02 && station.visible;
      }

      // table: below the frame until the plate is dressed, then rises to meet it
      const tUp = kf(p, [[0.42, -3.2], [0.66, -0.78]]);
      table.position.set(0.1, tUp, 0.3);
      table.visible = tUp > -3.1;
      const dP = c01((p - 0.66) / 0.3);
      for (const d of table.userData.dishes) { const e = smooth(c01((dP - d.at) / 0.2)); d.o.visible = e > 0.001; d.o.position.y = (1 - e) * 0.7; d.o.scale.setScalar(0.5 + 0.5 * e); }

      // camera: station → plate close-up → table three-quarter
      const cx = kf(p, [[0, 0.5 + 0.55 * wide], [0.34, 0.15], [0.66, -0.25], [1, -0.2]]);
      const cy = kf(p, [[0, 0.1], [0.34, 0.55], [0.66, 1.75], [1, 2.05]]);
      const cz = kf(p, [[0, 4.35 + (1 - wide) * 1.8], [0.34, 3.0 + (1 - wide) * 1.2], [0.66, 2.5 + (1 - wide) * 1.1], [1, 3.4 + (1 - wide) * 1.4]]);
      const lx = kf(p, [[0, sx * 0.6], [0.34, px * 0.6], [0.66, 0.05], [1, 0.1]]);
      const ly = kf(p, [[0, -0.2], [0.34, -0.55], [0.66, -0.75], [1, -0.72]]);
      const lz = kf(p, [[0, 0.1], [0.34, pz], [0.66, 0.45], [1, 0.2]]);
      look.set(lx, ly, lz);
      const br = RM ? 0 : 1;
      cam.position.set(
        cx + ptr.x * 0.16 + br * (Math.sin(tS * 0.17) * 0.055 + Math.sin(tS * 0.061 + 1.3) * 0.045),
        cy - ptr.y * 0.1 + br * (Math.sin(tS * 0.13 + 0.7) * 0.04 + Math.sin(tS * 0.047) * 0.03),
        cz + br * Math.sin(tS * 0.083 + 2.1) * 0.07);
      look.x += br * Math.sin(tS * 0.071 + 0.4) * 0.03; look.y += br * Math.sin(tS * 0.053 + 2.6) * 0.02;
      cam.lookAt(look);
      cam.updateProjectionMatrix();

      // focus: the knife first, then the plate
      const focusTarget = p < 0.2 ? tmp.copy(station.position).add(knife.position) : plate.position;
      const want = cam.position.distanceTo(focusTarget);
      focusNow = focusNow ? focusNow + (want - focusNow) * 0.08 : want;
      scene.fog.near = cz + 1.8; scene.fog.far = cz + 8;

      const tStart = performance.now();
      if (quality === 0) renderer.render(scene, cam);
      else {
        renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
        post.uniforms.cameraNear.value = cam.near; post.uniforms.cameraFar.value = cam.far;
        post.uniforms.focusDist.value = focusNow; post.uniforms.focusRange.value = 2.6;
        post.uniforms.maxBlur.value = quality >= 2 ? 1.4 * renderer.getPixelRatio() : 0;
        post.uniforms.time.value = tS % 100; post.uniforms.shimmer.value = 0.6 * carve; post.uniforms.shimmerX.value = 0.5 + 0.22 * wide;
        renderer.render(postScene, postCam);
      }
      acc += performance.now() - tStart; accN++;
      if (accN >= 30) { const avg = acc / accN; acc = 0; accN = 0; if (avg > 26 && quality > 0) setQuality(quality - 1); else if (avg < 9 && quality < 2) setQuality(quality + 1); }
      this._frames = (this._frames || 0) + 1;
    };
    const safeFrame = () => { try { frame(performance.now()); } catch (e) { this._stop = true; this.dataset.error = String(e && e.stack || e); console.error('[kitchen-scene]', e); } };
    const animate = (now) => { if (this._stop) { rafId = 0; return; } rafId = requestAnimationFrame(animate); lastFrame = performance.now(); try { frame(now); } catch (e) { this._stop = true; this.dataset.error = String(e && e.stack || e); console.error('[kitchen-scene]', e); } };
    safeFrame();
    let wd = 0;
    const onScroll = () => { if (!this._stop && performance.now() - lastFrame > 60) { resize(); safeFrame(); } };
    const startWatchdog = () => { clearInterval(wd); wd = setInterval(() => { if (this._stop) { clearInterval(wd); wd = 0; return; } if (resize() || performance.now() - lastFrame > 400) safeFrame(); }, 250); };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    const tr = document.querySelector('[data-scene-track]'); if (tr) tr.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this._restart) this._restart(); });
    this._restart = () => { resize(); safeFrame(); startWatchdog(); if (!rafId) rafId = requestAnimationFrame(animate); };
    startWatchdog();
    rafId = requestAnimationFrame(animate);
  }
}
customElements.define('kitchen-scene', KitchenScene);
})();
