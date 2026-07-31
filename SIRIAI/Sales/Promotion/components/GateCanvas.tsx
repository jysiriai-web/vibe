"use client";

import { useEffect, useRef, useState } from "react";

/**
 * GateCanvas — the SIRIAI hero field, ported from the cd-study design system.
 *
 * Two gaussian blooms (bottom-left narrow, top-right larger) are SUMMED and read
 * through one density ramp: nothing→black, thin edge→amber, denser→orange, core→pink.
 * Density is simultaneously hue AND brightness — that single shared axis is the
 * whole design language, which is why the blooms are not tinted individually.
 *
 * The grain is screen-static (no uTime in the hash) so it does not boil; the blooms
 * drift behind it via the fbm warp. Falls back to the CSS `.field-bg` on
 * reduced-motion / no-WebGL / context-loss.
 */

const VERT = `attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `precision highp float;
varying vec2 vUv;
uniform vec2  uRes;
uniform float uTime;
uniform float uReveal;  // 0..1 intro reveal

float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.55;
  mat2 rot=mat2(0.8,0.6,-0.6,0.8);
  for(int i=0;i<3;i++){ v+=a*noise(p); p=rot*p*1.9; a*=0.45; }
  return v;
}

const vec3 ORANGE = vec3(1.00, 0.42, 0.13);
const vec3 AMBER  = vec3(1.00, 0.78, 0.05);
const vec3 PINK   = vec3(0.90, 0.18, 0.38);

/* the drift: the whole field is pushed around by fbm, which is why the hero breathes */
vec2 warp(vec2 p, float amt){
  float t = uTime * 0.11;
  return p + (vec2(fbm(p*1.6 + t), fbm(p*1.6 + 4.0 - t*0.8)) - 0.5) * amt;
}

/* one bloom: a gaussian mass at a, with a sigma per axis */
float bloom(vec2 w, vec2 a, vec2 s){
  vec2 d = (w - a) / s;
  return exp(-dot(d, d));
}

/* THE colormap. density in, colour out: nothing -> black, a thin edge -> amber,
   denser -> orange, a burning core -> pink. brightness and hue share an axis. */
vec3 colormap(float g){
  g = clamp(g, 0.0, 1.0);
  vec3 cm = AMBER;
  cm = mix(cm, ORANGE, smoothstep(0.34, 0.72, g));
  cm = mix(cm, PINK,   smoothstep(0.60, 0.98, g));
  return cm * smoothstep(0.02, 0.74, g);
}

vec3 fieldCore(vec2 uv, vec2 a1, vec2 s1, vec2 a2, vec2 s2, float amp){
  float aspect = uRes.x / uRes.y;
  vec2  p = (uv - 0.5) * vec2(aspect, 1.0);
  vec2  w = warp(p, 0.34);
  return colormap((bloom(w, a1, s1) + bloom(w, a2, s2)) * amp);
}

/* asymmetric sizes, identical make-up, kept out at the corners so black holds the middle */
vec3 background(vec2 uv){
  float ar = (uRes.x / uRes.y) * 0.5;
  return fieldCore(uv, vec2(-ar * 0.82, -0.42), vec2(0.374166),
                       vec2( ar * 0.82,  0.42), vec2(0.447214), 1.0);
}

void main(){
  vec2 fc = vUv * uRes;
  vec3 col = background(vUv);

  /* STATIC grain — fixed to the screen (NO uTime in the hash), so it does not boil.
     The blooms drift BEHIND it. Amplitude ramps with luminance. */
  float gA = hash(fc * 0.58);
  float gB = hash(fc * 0.31 + 19.0);
  float grain = (gA * 0.55 + gB * 0.45) - 0.5;
  float glum = max(col.r, max(col.g, col.b));
  col += grain * (0.12 + 0.27 * smoothstep(0.0, 0.55, glum));

  /* intro: resolve from black */
  col = mix(vec3(0.0), col, 0.25 + 0.75 * smoothstep(0.0, 0.6, uReveal));

  gl_FragColor = vec4(col, 1.0);
}`;

export default function GateCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [glActive, setGlActive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let gl: WebGLRenderingContext | null = null;
    let prog: WebGLProgram | null = null;
    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;
    let buf: WebGLBuffer | null = null;
    let ro: ResizeObserver | null = null;
    let running = false;

    let W = 0,
      H = 0,
      dpr = 1;
    let start = 0;
    let U: Record<string, WebGLUniformLocation | null> = {};

    function compile(type: number, src: string): WebGLShader | null {
      const g = gl!;
      const s = g.createShader(type);
      if (!s) return null;
      g.shaderSource(s, src);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) {
        // a lost context reports a null info-log — that's the WebGL budget being
        // momentarily exhausted (dev HMR/navigation churn), not a shader bug.
        // Stay quiet and let the caller fall back to the CSS .field-bg.
        if (!g.isContextLost()) {
          console.error("[GateCanvas] shader compile:", g.getShaderInfoLog(s));
        }
        g.deleteShader(s);
        return null;
      }
      return s;
    }

    function resize() {
      if (!gl || !canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      H = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      gl.viewport(0, 0, W, H);
    }

    const onLost = (e: Event) => {
      e.preventDefault();
      teardown();
      setGlActive(false);
    };

    function frame(now: number) {
      if (!gl || !running) return;
      const t = (now - start) / 1000;
      const reveal = Math.min(1, (now - start) / 1100); // cd-study: 1100ms reveal
      gl.uniform2f(U.res, W, H);
      gl.uniform1f(U.time, t);
      gl.uniform1f(U.reveal, reveal);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }

    function initGL(): boolean {
      try {
        gl =
          (canvas!.getContext("webgl", {
            antialias: false,
            alpha: false,
            powerPreference: "low-power",
          }) as WebGLRenderingContext | null) ||
          (canvas!.getContext("experimental-webgl") as WebGLRenderingContext | null);
      } catch {
        gl = null;
      }
      // a born-lost context (budget exhausted) can't compile — fall back to .field-bg
      if (!gl || gl.isContextLost()) {
        gl = null;
        return false;
      }

      vs = compile(gl.VERTEX_SHADER, VERT);
      fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return false;
      prog = gl.createProgram();
      if (!prog) return false;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("[GateCanvas] link:", gl.getProgramInfoLog(prog));
        return false;
      }
      gl.useProgram(prog);

      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      U = {
        res: gl.getUniformLocation(prog, "uRes"),
        time: gl.getUniformLocation(prog, "uTime"),
        reveal: gl.getUniformLocation(prog, "uReveal"),
      };

      resize();
      ro = new ResizeObserver(resize);
      ro.observe(canvas!);
      canvas!.addEventListener("webglcontextlost", onLost, false);

      running = true;
      start = performance.now();
      raf = requestAnimationFrame(frame);
      return true;
    }

    function teardown() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (canvas) canvas.removeEventListener("webglcontextlost", onLost);
      if (ro) {
        ro.disconnect();
        ro = null;
      }
      if (gl) {
        if (buf) gl.deleteBuffer(buf);
        if (prog) gl.deleteProgram(prog);
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
        const lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      }
      gl = prog = vs = fs = buf = null;
    }

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    function apply() {
      if (mq.matches) {
        teardown();
        setGlActive(false);
      } else if (!running) {
        const ok = initGL();
        setGlActive(ok);
        if (!ok) teardown();
      }
    }

    apply();
    const onMq = () => apply();
    mq.addEventListener?.("change", onMq);

    return () => {
      mq.removeEventListener?.("change", onMq);
      teardown();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="fixed inset-0 z-0 block h-full w-full"
        style={{ display: glActive ? "block" : "none" }}
      />
      {!glActive && (
        <div className="field-bg" aria-hidden>
          <span className="l-bloom bl" />
          <span className="l-bloom tr" />
        </div>
      )}
    </>
  );
}
